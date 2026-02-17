require('dotenv').config();
const WebSocket = require('ws');
const path = require('path');
const express = require('express');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const logger = require('../core/logger');
const BoosisTrend = require('../strategies/BoosisTrend');
const auth = require('../core/auth');
const validators = require('../core/validators');
const db = require('../core/database');
const credentialsManager = require('../core/credentials-manager');
const notifications = require('../core/notifications');
const binanceService = require('../core/binance');
const TechnicalIndicators = require('../core/technical_indicators');
const HealthChecker = require('../core/health');
const schema = require('../core/database-schema');
const fs = require('fs');
const axios = require('axios');

// Configuration
const CONFIG = {
    symbol: 'BTCUSDT',
    interval: '1m',
    wsUrl: `wss://stream.binance.com:9443/ws/btcusdt@kline_1m`,
    apiUrl: 'https://api.binance.com/api/v3',
    port: 3000
};

const wsManager = require('../core/websocket-manager');
const profileManager = require('../core/strategy-profile-manager');
const TradingPairManager = require('../core/trading-pair-manager');

class LiveTrader {
    constructor() {
        this.app = express();

        // MULTI-ASSET ARCHITECTURE V2
        this.pairManagers = new Map(); // symbol -> TradingPairManager


        // ⛔ SAFETY CHECK - PROTOCOLO TONY 13 FEB 2026
        this.tradingMode = process.env.TRADING_MODE || 'PAPER';
        this.forcePaper = process.env.FORCE_PAPER_MODE !== 'false';

        if (this.tradingMode === 'LIVE' && this.forcePaper) {
            const errorMsg = '🚨 CRITICAL SECURITY BREACH: Bot attempted to start in LIVE mode while FORCE_PAPER is active.';
            logger.error(errorMsg);
            throw new Error(errorMsg);
        }

        // Trading State
        this.liveTrading = false;
        this.paperTrading = true;
        this.initialCapital = 200;
        this.balance = {
            usdt: this.initialCapital,
            asset: 0
        };
        this.realBalance = [];
        this.totalBalanceUSD = 0;
        this.equityHistory = [];
        this.emergencyStopped = false;
        this.clients = new Set(); // Frontend clients for candle streaming

        // MULTI-ASSET: Handled by pairManagers map
        this.health = new HealthChecker(this);
        this.token = null;
        this.lastMessageTime = Date.now();
        this.sosSent = false;

        logger.info(`Initializing Boosis Live Trader [Mode: ${this.tradingMode}] [Symbol: ${CONFIG.symbol}]`);
        this.setupServer();
    }

    setupServer() {
        this.app.use(cors());
        this.app.use(express.json());

        // Rate limiting
        const loginLimiter = rateLimit({
            windowMs: 15 * 60 * 1000, // 15 minutos
            max: 5, // máximo 5 intentos por ventana
            message: { error: 'Demasiados intentos de login. Intenta de nuevo en 15 minutos.' },
            standardHeaders: true,
            legacyHeaders: false,
        });

        const apiLimiter = rateLimit({
            windowMs: 15 * 60 * 1000, // 15 minutos
            max: 3000, // 10 pares × (status + candles) cada 5s = ~2700 req/15min
            message: 'Demasiadas peticiones desde esta IP, intenta de nuevo en 15 minutos',
            standardHeaders: true,
            legacyHeaders: false,
        });

        this.app.use('/api/', apiLimiter);

        const authMiddleware = async (req, res, next) => {
            if (req.url === '/api/login' || req.originalUrl === '/api/login') return next();
            const authHeader = req.headers.authorization || '';
            let token = authHeader.replace('Bearer ', '');
            if (!token && req.query.token) token = req.query.token;
            if (!(await auth.verifyToken(token))) {
                return res.status(401).json({ error: 'No autorizado' });
            }
            next();
        };

        this.app.use(express.static(path.join(__dirname, '../../public')));

        this.app.post('/api/login', loginLimiter, async (req, res) => {
            const { password } = req.body;
            const token = await auth.generateToken(password);
            if (!token) return res.status(401).json({ error: 'Contraseña incorrecta' });
            res.json({ token, expiresIn: '24h' });
        });

        this.app.post('/api/settings/trading-mode', authMiddleware, async (req, res) => {
            const { live } = req.body;
            if (live && this.forcePaper) {
                return res.status(403).json({ error: 'Modo LIVE bloqueado por políticas de seguridad.' });
            }
            this.liveTrading = live;
            this.paperTrading = !live;
            this.emergencyStopped = false;
            await this.saveTradingMode();
            if (!this.ws || this.ws.readyState !== WebSocket.OPEN) this.connectWebSocket();
            logger.warn(`TRADING MODE CHANGED: ${live ? 'LIVE' : 'PAPER'}`);
            notifications.send(`🔄 **TRADING MODE CHANGED**: ${live ? '💰 LIVE' : '📝 PAPER'}`, 'warning');
            res.json({ success: true, mode: live ? 'LIVE' : 'PAPER' });
        });

        this.app.post('/api/emergency-stop', authMiddleware, async (req, res) => {
            this.liveTrading = false;
            this.paperTrading = true;
            this.emergencyStopped = true;
            await this.saveTradingMode();
            if (this.ws) this.ws.terminate();
            logger.error('🚨 EMERGENCY STOP ACTIVATED');
            notifications.notifyAlert('🚨 **EMERGENCY STOP ACTIVATED**');
            res.json({ success: true });
        });

        this.app.get('/api/logs/stream', authMiddleware, (req, res) => {
            res.setHeader('Content-Type', 'text/event-stream');
            res.setHeader('Cache-Control', 'no-cache');
            res.setHeader('Connection', 'keep-alive');
            res.flushHeaders();
            const onLog = (log) => res.write(`data: ${JSON.stringify(log)}\n\n`);
            logger.on('log', onLog);
            // Keep-alive ping every 25s to avoid certain proxies closing the SSE
            const keepAlive = setInterval(() => {
                try {
                    res.write(': ping\n\n');
                } catch (e) { }
            }, 25000);

            req.on('close', () => {
                clearInterval(keepAlive);
                logger.off('log', onLog);
            });
        });

        // STATUS ENDPOINT (Multi-Asset Ready)
        this.app.get('/api/status', authMiddleware, (req, res) => {
            const requestedSymbol = req.query.symbol;

            if (requestedSymbol && requestedSymbol !== 'undefined') {
                // Specific Pair Status
                const manager = this.pairManagers.get(requestedSymbol);
                if (!manager) {
                    return res.json({
                        status: 'inactive',
                        symbol: requestedSymbol,
                        metrics: { winRate: 0, trades: 0 },
                        balance: { usdt: this.balance.usdt, assetValue: 0 }
                    });
                }

                const status = manager.getStatus();
                // Enrich with global context
                status.liveTrading = this.liveTrading;
                status.paperTrading = this.paperTrading;
                status.balance = {
                    usdt: this.balance.usdt,
                    assetValue: status.activePosition ? (status.activePosition.amount * status.latestCandle.close) : 0
                };
                status.initialCapital = this.initialCapital;
                status.emergencyStopped = this.emergencyStopped;
                res.json(status);

            } else {
                // Global Summary
                const activePairs = Array.from(this.pairManagers.keys());
                const positions = Array.from(this.pairManagers.values())
                    .map(m => m.activePosition)
                    .filter(p => p !== null);

                res.json({
                    status: 'online',
                    mode: this.liveTrading ? 'LIVE' : 'PAPER',
                    liveTrading: this.liveTrading,
                    paperTrading: !this.liveTrading,
                    balance: this.balance,
                    realBalance: this.realBalance,
                    totalBalanceUSD: this.totalBalanceUSD,
                    totalEquity: this.calculateTotalEquity ? this.calculateTotalEquity() : this.totalBalanceUSD,
                    activePairs: activePairs,
                    activePositionsCount: positions.length,
                    activePositions: positions, // For legacy dashboard compatibility
                    emergencyStopped: this.emergencyStopped,
                    symbol: CONFIG.symbol // For legacy
                });
            }
        });

        this.app.get('/api/health', (req, res) => {
            res.json(this.health.getStatus());
        });

        // --- CREDENTIALS MANAGEMENT ---
        this.app.post('/api/credentials/setup', authMiddleware, async (req, res) => {
            // Solo permitir si NO hay credenciales ya, a menos que se pase force=true
            // O simplemente permitir sobreescribir (seguridad básica: authMiddleware requerido)
            try {
                const { apiKey, apiSecret } = req.body;
                if (!apiKey || !apiSecret) {
                    return res.status(400).json({ error: 'apiKey and apiSecret required' });
                }
                await credentialsManager.saveCredentials('binance', apiKey, apiSecret);
                // Recargar en memoria
                await binanceService.initialize();
                res.json({ message: 'Credenciales guardadas y encriptadas', status: 'ok' });
            } catch (error) {
                res.status(500).json({ error: error.message });
            }
        });

        this.app.get('/api/credentials/test', authMiddleware, async (req, res) => {
            try {
                const has = await credentialsManager.hasCredentials('binance');
                if (!has) return res.json({ status: 'no_credentials_in_db' });

                // Check in memory
                if (!binanceService.apiKey) {
                    return res.json({ status: 'error', message: 'Credentials in DB but not loaded in service' });
                }

                // Intentar conectar
                const balance = await binanceService.getAccountBalance();
                if (balance) {
                    res.json({ status: 'ok', message: 'Credenciales funcionan', balance: balance.length });
                } else {
                    res.status(500).json({ status: 'error', message: 'Fallo al obtener balance' });
                }
            } catch (error) {
                res.status(500).json({ error: error.message });
            }
        });

        this.app.get('/api/candles', authMiddleware, async (req, res) => {
            try {
                const symbol = req.query.symbol || CONFIG.symbol;
                const timeframe = req.query.timeframe || '1m';
                const limit = Math.min(validators.validateLimit(req.query.limit || 500), 500);

                let candles1m = [];

                // 1. Try Memory Buffer (Multi-Asset V2)
                const manager = this.pairManagers.get(symbol);
                if (manager && manager.candles.length > 0) {
                    candles1m = manager.candles;
                }

                // 2. If memory is empty, try DB
                if (candles1m.length === 0) {
                    candles1m = await db.getRecentCandles(symbol, limit * 60);
                } else {
                    candles1m = candles1m.slice(-(limit * 60));
                }

                // 3. If 1m requested, convert format directly
                if (timeframe === '1m') {
                    const response = candles1m.slice(-limit).map(c => ({
                        time: Math.floor(c[0] / 1000),
                        open: parseFloat(c[1]),
                        high: parseFloat(c[2]),
                        low: parseFloat(c[3]),
                        close: parseFloat(c[4]),
                        volume: parseFloat(c[5])
                    }));
                    return res.json({ candles: response, timeframe: '1m', symbol, count: response.length });
                }

                // 4. For other timeframes, aggregate
                const aggregated = this._aggregateCandles(candles1m, timeframe);
                const response = aggregated.slice(-limit).map(c => ({
                    time: c.time,
                    open: c.open,
                    high: c.high,
                    low: c.low,
                    close: c.close,
                    volume: c.volume
                }));

                res.json({ candles: response, timeframe, symbol, count: response.length });
            } catch (error) {
                res.status(400).json({ error: error.message });
            }
        });

        // ... trades endpoint ...

        this.app.get('/api/trades', authMiddleware, async (req, res) => {
            const trades = await db.getRecentTrades(50);
            res.json(trades);
        });

        this.app.get('/api/metrics', authMiddleware, async (req, res) => {
            try {
                let totalTrades = 0;
                let wins = 0;
                let totalPnL = 0;

                for (const manager of this.pairManagers.values()) {
                    totalTrades += manager.metrics.totalTrades;
                    wins += manager.metrics.winningTrades;
                    totalPnL += manager.metrics.totalPnL;
                }

                const winRate = totalTrades > 0 ? ((wins / totalTrades) * 100).toFixed(1) + '%' : '0%';

                res.json({
                    profitFactor: totalPnL >= 0 ? '1.50' : '0.85', // Calculado o mock según disponibilidad
                    winRate: winRate,
                    totalTrades: totalTrades,
                    totalPnL: totalPnL.toFixed(2)
                });
            } catch (error) {
                res.status(500).json({ error: error.message });
            }
        });

        // ... metrics ...

        // --- THE REFINERY: STRATEGY PROFILES ---
        this.app.get('/api/refinery/profiles', authMiddleware, (req, res) => {
            const profiles = profileManager.listProfiles();
            res.json({ status: 'ok', count: profiles.length, profiles });
        });

        this.app.get('/api/refinery/profile/:symbol', authMiddleware, (req, res) => {
            const { symbol } = req.params;
            const profile = profileManager.getProfile(symbol);
            res.json({ status: 'ok', symbol, profile });
        });

        this.app.post('/api/refinery/profile/update', authMiddleware, async (req, res) => {
            try {
                const { symbol, params } = req.body;
                if (!symbol || !params) return res.status(400).json({ error: 'symbol y params requeridos' });

                const profileId = await profileManager.upsertProfile(symbol, params);

                // Live Reload (Multi-Asset V2)
                const manager = this.pairManagers.get(symbol);
                if (manager && manager.strategy) {
                    manager.strategy.configure(profileManager.getProfile(symbol));
                    logger.info(`[Refinery] ✅ Estrategia para ${symbol} reconfigurada en caliente.`);
                }

                // Audit Log
                await db.pool.query(`
                  INSERT INTO strategy_changes (symbol, action, field_changed, new_value, changed_by)
                  VALUES ($1, $2, $3, $4, $5)
                `, [symbol, 'PROFILE_UPDATED', 'all_parameters', JSON.stringify(params), 'API']);

                res.json({ status: 'ok', message: `Perfil actualizado: ${symbol}`, profileId });
            } catch (error) {
                res.status(500).json({ error: error.message });
            }
        });

        // POST /api/refinery/backtest (REAL - no mock)
        this.app.post('/api/refinery/backtest', authMiddleware, async (req, res) => {
            try {
                const { symbol, params, period } = req.body;
                if (!symbol || !params) return res.status(400).json({ error: 'symbol y params requeridos' });

                const backtestEngine = require('../core/backtest-engine');
                logger.info(`[API] Backtesting ${symbol} con período ${period || '1y'}`);

                const results = await backtestEngine.runBacktest(symbol, params, period || '1y');
                res.json({ status: 'ok', data: results });
            } catch (error) {
                logger.error(`[API] Error en backtest: ${error.message}`);
                res.status(500).json({ error: error.message, status: 'failed' });
            }
        });

        // POST /api/optimize (The Lab)
        // Supported periods: '1w', '1m', '3m', '6m', '1y', '2y', '5y'
        this.app.post('/api/optimize', authMiddleware, async (req, res) => {
            try {
                const { symbol, period, params } = req.body;
                if (!symbol || !params) return res.status(400).json({ error: 'symbol y params iniciales requeridos' });

                const optimizer = require('../core/optimizer');
                const validPeriods = ['1w', '1m', '3m', '6m', '1y', '2y', '5y'];
                const safePeriod = validPeriods.includes(period) ? period : '1m';

                const results = await optimizer.optimize(symbol, safePeriod, params);

                res.json({ status: 'ok', results });
            } catch (error) {
                logger.error(`[API] Error en optimización: ${error.message}`);
                res.status(500).json({ error: error.message });
            }
        });

        // ⛏️ DATA MINER API (The Refinery)
        this.app.post('/api/miner/mine', authMiddleware, async (req, res) => {
            try {
                const { symbol, days, interval = '5m' } = req.body;
                if (!symbol || !days) return res.status(400).json({ error: 'symbol and days required' });

                const validIntervals = ['1m', '3m', '5m', '15m', '30m', '1h'];
                const selectedInterval = validIntervals.includes(interval) ? interval : '5m';

                const miner = require('../core/data_miner');

                // Start async job (don't await)
                miner.mineToDatabase(symbol, selectedInterval, parseInt(days))
                    .catch(err => logger.error(`[Miner Background Error] ${err.message}`));

                res.json({ status: 'started', symbol, days, interval: selectedInterval });
            } catch (error) {
                res.status(500).json({ error: error.message });
            }
        });

        this.app.get('/api/miner/status', authMiddleware, (req, res) => {
            const miner = require('../core/data_miner');
            res.json(miner.getStatus());
        });

        this.app.get('/api/refinery/history/:symbol', authMiddleware, async (req, res) => {
            try {
                const { symbol } = req.params;
                const limit = req.query.limit || 10;
                const history = await profileManager.getChangeHistory(symbol, limit);
                res.json({ status: 'ok', symbol, history });
            } catch (error) {
                res.status(500).json({ error: error.message });
            }
        });

        // --- MULTI-ASSET WEBSOCKET MANAGEMENT ---
        this.app.get('/api/websocket/status', authMiddleware, (req, res) => {
            res.json(wsManager.getStatus());
        });

        this.app.post('/api/trading/pair/add', authMiddleware, async (req, res) => {
            try {
                const { symbol, strategy } = req.body;
                if (!symbol || !strategy) return res.status(400).json({ error: 'symbol y strategy requeridos' });
                await this.addTradingPair(symbol, strategy);
                res.json({ status: 'ok', message: `Par ${symbol} agregado`, symbol, strategy });
            } catch (error) {
                res.status(500).json({ error: error.message });
            }
        });

        this.app.delete('/api/trading/pair/remove', authMiddleware, async (req, res) => {
            try {
                const { symbol } = req.body;
                if (!symbol) return res.status(400).json({ error: 'symbol requerido' });
                await this.removeTradingPair(symbol);
                res.json({ status: 'ok', message: `Par ${symbol} removido` });
            } catch (error) {
                res.status(500).json({ error: error.message });
            }
        });
    }


    async handleKlineMessage(kline, symbol) {
        if (!kline.x || this.emergencyStopped) return; // Detener todo si hay emergencia

        const manager = this.pairManagers.get(symbol);
        if (!manager) return;

        const candle = [
            kline.t, parseFloat(kline.o), parseFloat(kline.h), parseFloat(kline.l), parseFloat(kline.c), parseFloat(kline.v), kline.T
        ];

        try {
            // Emit to frontend clients
            if (this.clients && this.clients.size > 0) {
                const candleData = {
                    time: Math.floor(kline.t / 1000),
                    open: parseFloat(kline.o),
                    high: parseFloat(kline.h),
                    low: parseFloat(kline.l),
                    close: parseFloat(kline.c),
                    volume: parseFloat(kline.v)
                };

                this.clients.forEach(client => {
                    if (client.readyState === 1 && client.symbol === symbol) { // 1 = OPEN
                        client.send(JSON.stringify(candleData));
                    }
                });
            }

            // Process (Manager handles DB and logic)
            const signal = await manager.onCandleClosed(candle);

            // Heartbeat
            if (symbol === CONFIG.symbol) {
                this.lastMessageTime = Date.now();
                this.sosSent = false;
            }

            // Execute
            if (signal) {
                await this.executeSignal(symbol, signal, manager);
            }
        } catch (err) {
            logger.error(`[${symbol}] Kline Error: ${err.message}`);
        }
    }



    async executeSignal(symbol, signal, manager) {
        if (this.liveTrading) {
            await this.executeRealTrade(symbol, signal, manager);
        } else {
            await this.executePaperTrade(symbol, signal, manager);
        }
    }

    async executePaperTrade(symbol, signal, manager) {
        const fee = 0.001;
        let tradeAmount = 0;
        const position = manager.activePosition;

        if (signal.action === 'BUY') {
            // Position sizing: Global Balance / Active Pairs
            const activePairsCount = Math.max(this.pairManagers.size, 1);
            const maxAllocation = this.balance.usdt / activePairsCount;

            // Limit to actual available global balance
            const amountUsdt = Math.min(this.balance.usdt, maxAllocation);

            if (amountUsdt < 10) return; // Minimum trade size

            const amountAsset = (amountUsdt / signal.price) * (1 - fee);
            tradeAmount = amountAsset;

            // Deduct from Global Pool
            this.balance.usdt -= amountUsdt;

            const newPos = {
                symbol: symbol,
                side: 'BUY',
                entryPrice: signal.price,
                amount: amountAsset,
                isPaper: true,
                timestamp: Date.now()
            };

            // Register in Manager
            manager.recordTrade({
                action: 'OPEN',
                position: newPos,
                pnl: 0,
                pnlValue: 0
            });

            await this.saveActivePosition(newPos);

        } else {
            // SELL
            if (!position) return;

            const usdtReceived = (position.amount * signal.price) * (1 - fee);
            tradeAmount = position.amount;

            // Add back to Global Pool
            this.balance.usdt += usdtReceived;

            const pnlValue = usdtReceived - (position.amount * position.entryPrice);
            const pnlPercent = ((signal.price - position.entryPrice) / position.entryPrice) * 100;

            // Register in Manager
            manager.recordTrade({
                action: 'CLOSE',
                position: null,
                pnl: pnlPercent,
                pnlValue: pnlValue
            });

            await this.clearActivePosition(symbol);
        }

        await this.savePaperBalance();

        // Log & Notify
        const tradeData = { ...signal, symbol: symbol, type: 'PAPER', amount: tradeAmount };
        db.saveTrade(tradeData);
        notifications.notifyTrade(tradeData);
    }

    async executeRealTrade(symbol, signal, manager) {
        const position = manager.activePosition;
        try {
            logger.warn(`!!! EXECUTING REAL TRADE [${symbol}]: ${signal.action} @ ${signal.price} !!!`);
            notifications.notifyAlert(`🚨 LIVE TRADE: ${signal.action} ${symbol} @ $${signal.price}`);

            if (signal.action === 'BUY') {
                // Get real USDT balance from Binance
                const balances = await binanceService.getAccountBalance();
                const usdtBalance = balances.find(b => b.asset === 'USDT');
                const availableUsdt = usdtBalance ? parseFloat(usdtBalance.free) : 0;

                // Position sizing
                const activePairsCount = Math.max(this.pairManagers.size, 1);
                const maxAllocation = availableUsdt / activePairsCount;

                if (maxAllocation < 10) {
                    logger.warn(`[LIVE] Insufficient USDT balance for ${symbol}: $${availableUsdt.toFixed(2)}`);
                    return;
                }

                // Calculate quantity
                const quantity = (maxAllocation / signal.price) * 0.999;
                const order = await binanceService.executeOrder(symbol, 'BUY', quantity);

                const filledQty = parseFloat(order.executedQty);
                const filledPrice = parseFloat(order.fills?.[0]?.price || signal.price);

                const newPos = {
                    symbol: symbol,
                    side: 'BUY',
                    entryPrice: filledPrice,
                    amount: filledQty,
                    isPaper: false,
                    orderId: order.orderId,
                    timestamp: Date.now()
                };

                manager.recordTrade({
                    action: 'OPEN',
                    position: newPos,
                    pnl: 0,
                    pnlValue: 0
                });

                await this.saveActivePosition(newPos);
                logger.success(`[LIVE] BUY executed: ${filledQty} ${symbol} @ $${filledPrice}`);

                db.saveTrade({ ...signal, symbol, type: 'LIVE', amount: filledQty, price: filledPrice });
                notifications.notifyTrade({ ...signal, symbol, type: 'LIVE', amount: filledQty, price: filledPrice });

            } else if (signal.action === 'SELL') {
                if (!position || !position.amount) {
                    logger.warn(`[LIVE] No position to sell for ${symbol}`);
                    return;
                }

                const order = await binanceService.executeOrder(symbol, 'SELL', position.amount);
                const filledQty = parseFloat(order.executedQty);
                const filledPrice = parseFloat(order.fills?.[0]?.price || signal.price);

                const entryVal = position.amount * position.entryPrice;
                const exitVal = filledQty * filledPrice; // Gross
                const pnlValue = exitVal - entryVal; // Approx (fees not included in simple display)
                const pnlPercent = ((filledPrice - position.entryPrice) / position.entryPrice) * 100;

                manager.recordTrade({
                    action: 'CLOSE',
                    position: null,
                    pnl: pnlPercent,
                    pnlValue: pnlValue
                });

                await this.clearActivePosition(symbol);
                logger.success(`[LIVE] SELL: ${filledQty} ${symbol} @ $${filledPrice} | PnL: ${pnlPercent.toFixed(2)}%`);

                db.saveTrade({ ...signal, symbol, type: 'LIVE', amount: filledQty, price: filledPrice });
                notifications.notifyTrade({ ...signal, symbol, type: 'LIVE', amount: filledQty, price: filledPrice });
            }

            // Refresh real balance global
            await this.fetchRealBalance();

        } catch (error) {
            logger.error(`[LIVE] TRADE FAILED [${symbol}]: ${error.message}`);
            notifications.notifyAlert(`🚨 LIVE TRADE FAILED: ${symbol} ${signal.action} - ${error.message}`);
        }
    }

    async connectWebSocket() {
        try {
            // Initialization logic moved to start(). Just triggering connection here.
            wsManager.connect();
            logger.success('[LiveTrader] ✅ WebSocket manager connected');
        } catch (error) {
            logger.error(`Error initializing WebSocket: ${error.message}`);
        }
    }

    // --- HELPER METHODS ---

    async addTradingPair(symbol, strategyName) {
        if (this.pairManagers.has(symbol)) {
            logger.warn(`Pair ${symbol} already active`);
            return;
        }

        try {
            // 1. Load Strategy Profile
            const profile = profileManager.getProfile(symbol);

            // 2. Determine Strategy Class
            const effectiveStrategyName = strategyName || profile.strategy || 'BoosisTrend';
            const strategy = this._createStrategyWithProfile(effectiveStrategyName, profile);

            // 3. Create Manager
            const manager = new TradingPairManager(symbol, strategy);
            await manager.init(); // Load DB state

            this.pairManagers.set(symbol, manager);

            // 4. Subscribe WS
            wsManager.addSymbol(symbol, (klineData) => {
                this.handleKlineMessage(klineData.k, symbol);
            });

            // 5. Persist Activation
            await db.pool.query(`
                INSERT INTO active_trading_pairs (symbol, strategy_name, is_active)
                VALUES ($1, $2, true)
                ON CONFLICT (symbol) DO UPDATE SET is_active = true, strategy_name = $2
            `, [symbol, effectiveStrategyName]);

            logger.info(`[LiveTrader] ✅ Pair Activated: ${symbol} (${effectiveStrategyName})`);

        } catch (error) {
            logger.error(`Failed to add pair ${symbol}: ${error.message}`);
        }
    }

    _createStrategyWithProfile(strategyName, profile) {
        try {
            const StrategyClass = require(`../strategies/${strategyName}`);
            const strategy = new StrategyClass();
            strategy.configure(profile);
            return strategy;
        } catch (e) {
            logger.error(`Error loading strategy ${strategyName}: ${e.message}`);
            return new BoosisTrend(); // Fallback
        }
    }

    // Deprecated simple loader
    _loadStrategy(name) {
        return this._createStrategyWithProfile(name, {});
    }

    startHeartbeat() {
        setInterval(() => {
            const status = this.emergencyStopped ? '🛑 DETENIDO' : '✅ OPERANDO';
            notifications.send(`💓 **HEARTBEAT**: ${status}\nModo: ${this.liveTrading ? 'LIVE' : 'PAPER'}`, 'info');
        }, 12 * 60 * 60 * 1000);
    }

    async reconcileOrders() {
        const openOrders = await binanceService.getOpenOrders(CONFIG.symbol);
        if (openOrders?.length > 0) {
            notifications.send(`⚠️ **RECONCILIACIÓN**: ${openOrders.length} órdenes abiertas en Binance.`, 'warning');
        }
    }

    async fetchRealBalance() {
        try {
            const data = await binanceService.getEnrichedBalance();
            this.realBalance = data.balances;
            this.totalBalanceUSD = data.totalUSD;
        } catch (e) { logger.error(`Balance Fetch Error: ${e.message}`); }
    }

    async loadTradingMode() {
        const res = await db.pool.query('SELECT key, value FROM trading_settings WHERE key = $1', ['live_trading']);
        if (res.rows.length > 0) {
            this.liveTrading = res.rows[0].value === 'true';
            if (this.liveTrading && this.forcePaper) this.liveTrading = false;
        }
    }

    async saveTradingMode() {
        await db.pool.query('INSERT INTO trading_settings (key, value) VALUES ($1, $2) ON CONFLICT (key) DO UPDATE SET value = $2', ['live_trading', this.liveTrading.toString()]);
    }

    _aggregateCandles(candles1m, targetTimeframe) {
        const timeframeMs = {
            '1m': 60 * 1000,
            '5m': 5 * 60 * 1000,
            '15m': 15 * 60 * 1000,
            '30m': 30 * 60 * 1000,
            '1h': 60 * 60 * 1000,
            '4h': 4 * 60 * 60 * 1000,
            '1d': 24 * 60 * 60 * 1000,
            '1w': 7 * 24 * 60 * 60 * 1000,
            '1M': 30 * 24 * 60 * 60 * 1000
        };

        const ms = timeframeMs[targetTimeframe];
        if (!ms) throw new Error(`Invalid timeframe: ${targetTimeframe}`);

        const grouped = {};

        for (const c of candles1m) {
            const time = Math.floor(c[0] / ms) * ms;
            if (!grouped[time]) {
                grouped[time] = [];
            }
            grouped[time].push({
                open: parseFloat(c[1]),
                high: parseFloat(c[2]),
                low: parseFloat(c[3]),
                close: parseFloat(c[4]),
                volume: parseFloat(c[5])
            });
        }

        const aggregated = [];
        for (const [time, group] of Object.entries(grouped)) {
            aggregated.push(this._processCandleGroup(parseInt(time), group));
        }

        return aggregated.sort((a, b) => a.time - b.time);
    }

    _processCandleGroup(time, group) {
        const opens = group.map(c => c.open);
        const highs = group.map(c => c.high);
        const lows = group.map(c => c.low);
        const closes = group.map(c => c.close);
        const volumes = group.map(c => c.volume);

        return {
            time: Math.floor(time / 1000),
            open: opens[0],
            high: Math.max(...highs),
            low: Math.min(...lows),
            close: closes[closes.length - 1],
            volume: volumes.reduce((a, b) => a + b, 0)
        };
    }

    async start() {
        try {
            logger.info('Starting Boosis Quant Bot (Multi-Asset Engine)...');
            await db.connect();
            await schema.init(db.pool);
            await binanceService.initialize();

            await this.loadTradingMode();
            await this.loadPaperBalance();

            // Sync initial balance display
            this.totalBalanceUSD = (Number(this.balance.usdt) || 0) + (Number(this.balance.asset) || 0);

            // Fetch real balance from Binance if credentials exist
            this.fetchRealBalance();
            setInterval(() => this.fetchRealBalance(), 60000);

            // MULTI-ASSET: Load Active Pairs
            const pairs = await db.pool.query('SELECT symbol, strategy_name FROM active_trading_pairs WHERE is_active = true');
            if (pairs.rows.length > 0) {
                logger.info(`[Startup] Loading ${pairs.rows.length} active pairs from DB...`);
                for (const row of pairs.rows) {
                    await this.addTradingPair(row.symbol, row.strategy_name);
                }
            } else {
                // Default: BTCUSDT
                logger.info('[Startup] No active pairs found. Adding default BTCUSDT.');
                await this.addTradingPair(CONFIG.symbol, 'BoosisTrend');
            }

            // Connect WS
            wsManager.connect();

            this.startHeartbeat();

            const mode = this.liveTrading ? 'LIVE (💰 REAL)' : 'PAPER (📝 SIMULATION)';
            const initialLink = `🚀 **BOT INICIADO**\n\nModo: ${mode}\nBalance: $${(Number(this.totalBalanceUSD) || 0).toFixed(2)} USD\nHormigas Activas: ${this.pairManagers.size}`;

            logger.success(`BOT STARTED | Mode: ${mode} | Active Pairs: ${this.pairManagers.size}`);

            // Send to Telegram
            await notifications.send(initialLink, 'success');

            const server = this.app.listen(CONFIG.port, () => {
                logger.success(`API listening on port ${CONFIG.port}`);
                // Generar token después de que el servidor esté escuchando
                this.generateInitialToken().catch(err => {
                    logger.error(`[Token] Error en generación inicial: ${err.message}`);
                });
            });

            this.setupWebSocket(server);

        } catch (error) {
            logger.error(`Fatal startup error: ${error.message}`);
            process.exit(1);
        }
    }

    async removeTradingPair(symbol) {
        if (!this.pairManagers.has(symbol)) return;

        // 1. Unsubscribe WS
        wsManager.removeSymbol(symbol);

        // 2. Remove from Map
        this.pairManagers.delete(symbol);

        // 3. Update DB
        await db.pool.query(`UPDATE active_trading_pairs SET is_active = false WHERE symbol = $1`, [symbol]);

        logger.info(`[LiveTrader] ➖ Pair Deactivated: ${symbol}`);
    }

    calculateTotalEquity() {
        let equity = this.balance.usdt;
        for (const manager of this.pairManagers.values()) {
            if (manager.activePosition) {
                // Determine current price
                const currentPrice = manager.getStatus().latestCandle.close;
                if (currentPrice > 0) {
                    equity += manager.activePosition.amount * currentPrice;
                }
            }
        }
        return equity;
    }

    setupWebSocket(server) {
        const wss = new WebSocket.Server({ noServer: true });

        server.on('upgrade', async (request, socket, head) => {
            const { pathname, searchParams } = new URL(request.url, `http://${request.headers.host}`);

            if (pathname === '/api/candles/stream') {
                const token = searchParams.get('token');
                const symbol = searchParams.get('symbol');

                if (!(await auth.verifyToken(token))) {
                    socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
                    socket.destroy();
                    return;
                }

                wss.handleUpgrade(request, socket, head, (ws) => {
                    ws.symbol = symbol;
                    this.clients.add(ws);
                    ws.on('close', () => this.clients.delete(ws));
                    wss.emit('connection', ws, request);
                });
            } else {
                socket.destroy();
            }
        });

        logger.info('[LiveTrader] ✅ Candle Streaming WebSocket Server initialized');
    }

    // --- LEGACY / HELPER METHODS ---

    _createStrategyWithProfile(strategyName, profile) {
        try {
            const StrategyClass = require(`../strategies/${strategyName}`);
            const strategy = new StrategyClass();
            strategy.configure(profile);
            return strategy;
        } catch (e) {
            logger.error(`Error loading strategy ${strategyName}: ${e.message}`);
            return new BoosisTrend(); // Fallback
        }
    }

    startHeartbeat() {
        setInterval(() => {
            const status = this.emergencyStopped ? '🛑 DETENIDO' : '✅ OPERANDO';
            notifications.send(`💓 **HEARTBEAT**: ${status}\nModo: ${this.liveTrading ? 'LIVE' : 'PAPER'}`, 'info');
        }, 12 * 60 * 60 * 1000);
    }

    async loadPaperBalance() {
        const res = await db.pool.query('SELECT value FROM trading_settings WHERE key = $1', ['paper_balance']);
        if (res.rows.length > 0) this.balance = JSON.parse(res.rows[0].value);
    }

    async savePaperBalance() {
        await db.pool.query('INSERT INTO trading_settings (key, value) VALUES ($1, $2) ON CONFLICT (key) DO UPDATE SET value = $2', ['paper_balance', JSON.stringify(this.balance)]);
    }

    // Adapt active position storage for multi-asset (using conflict on symbol)
    async saveActivePosition(pos) {
        await db.pool.query('INSERT INTO active_position (symbol, side, entry_price, amount, is_paper, timestamp) VALUES ($1, $2, $3, $4, $5, $6) ON CONFLICT (symbol) DO UPDATE SET side = $2, entry_price = $3, amount = $4, is_paper = $5, timestamp = $6', [pos.symbol, pos.side, pos.entryPrice, pos.amount, pos.isPaper, pos.timestamp]);
    }

    async clearActivePosition(symbol) {
        await db.pool.query('DELETE FROM active_position WHERE symbol = $1', [symbol]);
    }

    // Deprecated but kept for safety
    async loadHistoricalData() { }

    async generateInitialToken() {
        try {
            const password = process.env.ADMIN_PASSWORD;
            if (!password) {
                logger.warn('[Token] ADMIN_PASSWORD no configurado en .env, saltando generación automática');
                return;
            }

            const response = await axios.post(`http://localhost:${CONFIG.port}/api/login`, { password });

            if (response.data && response.data.token) {
                const tokenPath = path.join(__dirname, '../../auth_token.txt');
                fs.writeFileSync(tokenPath, response.data.token, 'utf8');
                logger.info(`[Token] ✅ Token automático generado y guardado en auth_token.txt`);
            }
        } catch (err) {
            logger.error(`[Token] ❌ Error generando token inicial: ${err.message}`);
        }
    }
}

module.exports = LiveTrader;

if (require.main === module) {
    const trader = new LiveTrader();
    trader.start().catch(err => {
        console.error('Fatal error starting trader:', err);
        process.exit(1);
    });
}
