
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

// Configuration
const CONFIG = {
    symbol: 'BTCUSDT',
    interval: '5m',
    wsUrl: `wss://stream.binance.com:9443/ws/btcusdt@kline_5m`,
    apiUrl: 'https://api.binance.com/api/v3',
    port: 3000
};

const wsManager = require('../core/websocket-manager');
const profileManager = require('../core/strategy-profile-manager');

class LiveTrader {
    constructor() {
        this.strategy = new BoosisTrend();
        this.candles = [];
        this.trades = [];
        this.ws = null;
        this.app = express();

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
        this.initialCapital = 1000;
        this.balance = {
            usdt: this.initialCapital,
            asset: 0
        };
        this.realBalance = [];
        this.totalBalanceUSD = 0;
        this.equityHistory = [];
        this.emergencyStopped = false;

        // Multi-Asset State
        this.activePositions = new Map(); // symbol -> position
        this.marketData = new Map(); // symbol -> { candles: [], strategy: instance }

        // Legacy support (Primary Symbol)
        this.activePosition = null;
        this.lastBuyPrice = 0;

        this.health = new HealthChecker(this);
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
            windowMs: 60 * 1000, // 1 minuto
            max: 100, // 100 requests por minuto
            message: { error: 'Demasiadas solicitudes. Intenta de nuevo en un momento.' },
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
            req.on('close', () => logger.off('log', onLog));
        });

        this.app.get('/api/status', authMiddleware, (req, res) => {
            const requestedSymbol = req.query.symbol || CONFIG.symbol;
            const context = this.marketData.get(requestedSymbol) || { strategy: this.strategy };
            const position = this.activePositions.get(requestedSymbol) || null;

            res.json({
                status: 'online',
                strategy: context.strategy.name,
                symbol: requestedSymbol,
                liveTrading: this.liveTrading,
                paperTrading: !this.liveTrading,
                balance: this.balance,
                initialCapital: this.initialCapital,
                realBalance: this.realBalance,
                totalBalanceUSD: this.totalBalanceUSD,
                emergencyStopped: this.emergencyStopped,
                activePosition: position
            });
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
                const limit = validators.validateLimit(req.query.limit || 100);

                let candleData = [];

                // 1. Try Memory Buffer
                if (this.marketData.has(symbol)) {
                    candleData = this.marketData.get(symbol).candles;
                } else if (symbol === CONFIG.symbol) {
                    candleData = this.candles;
                }

                // 2. If memory is empty, try DB
                if (candleData.length === 0) {
                    candleData = await db.getRecentCandles(symbol, limit);
                } else {
                    candleData = candleData.slice(-limit);
                }

                const response = candleData.map(c => ({
                    open_time: c[0], open: c[1], high: c[2], low: c[3], close: c[4], volume: c[5], close_time: c[6],
                    indicators: {} // Todo: add indicators if needed
                }));

                res.json(response);
            } catch (error) {
                res.status(400).json({ error: error.message });
            }
        });

        this.app.get('/api/trades', authMiddleware, async (req, res) => {
            const trades = await db.getRecentTrades(50);
            res.json(trades);
        });

        this.app.get('/api/metrics', authMiddleware, async (req, res) => {
            try {
                const trades = await db.getRecentTrades(100);
                // Simple analysis for UI
                const wins = trades.filter(t => t.side === 'SELL' && t.reason !== 'STOP LOSS').length; // Mock-ish
                const total = trades.length;
                const winRate = total > 0 ? ((wins / total) * 100).toFixed(1) + '%' : '0%';

                res.json({
                    profitFactor: '1.25',
                    winRate: winRate,
                    totalTrades: total
                });
            } catch (error) {
                res.status(500).json({ error: error.message });
            }
        });

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

                // Live Reload
                const profile = profileManager.getProfile(symbol);
                if (this.marketData.has(symbol)) {
                    // Update existing strategy instance
                    const context = this.marketData.get(symbol);
                    if (context.strategy) {
                        context.strategy.configure(profile);
                        logger.info(`[Refinery] ✅ Estrategia para ${symbol} reconfigurada en caliente.`);
                    }
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
        this.app.post('/api/optimize', authMiddleware, async (req, res) => {
            try {
                const { symbol, period, params } = req.body;
                if (!symbol || !params) return res.status(400).json({ error: 'symbol y params iniciales requeridos' });

                const optimizer = require('../core/optimizer');
                const results = await optimizer.optimize(symbol, period || '1m', params);

                res.json({ status: 'ok', results });
            } catch (error) {
                logger.error(`[API] Error en optimización: ${error.message}`);
                res.status(500).json({ error: error.message });
            }
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
                this.addTradingPair(symbol, strategy);
                res.json({ status: 'ok', message: `Par ${symbol} agregado`, symbol, strategy });
            } catch (error) {
                res.status(500).json({ error: error.message });
            }
        });

        this.app.delete('/api/trading/pair/remove', authMiddleware, async (req, res) => {
            try {
                const { symbol } = req.body;
                if (!symbol) return res.status(400).json({ error: 'symbol requerido' });
                this.removeTradingPair(symbol);
                res.json({ status: 'ok', message: `Par ${symbol} removido` });
            } catch (error) {
                res.status(500).json({ error: error.message });
            }
        });
    }

    async start() {
        try {
            logger.info('Starting Boosis Quant Bot...');
            await db.connect();
            await schema.init(db.pool);
            await binanceService.initialize();

            await this.loadTradingMode();
            await this.loadPaperBalance();
            await this.loadActivePosition();
            await this.loadHistoricalData();

            this.fetchRealBalance();
            setInterval(() => this.fetchRealBalance(), 60000);

            if (this.liveTrading) await this.reconcileOrders();
            this.startHeartbeat();

            if (!this.emergencyStopped) this.connectWebSocket();

            const mode = this.liveTrading ? 'LIVE (💰 REAL)' : 'PAPER (📝 SIMULATION)';
            notifications.send(`🚀 **BOT INICIADO**\n\nModo: ${mode}\nBalance: $${this.totalBalanceUSD.toFixed(2)} USD`, 'info');

            this.app.listen(CONFIG.port, () => {
                logger.success(`Dashboard API listening on port ${CONFIG.port}`);
            });
        } catch (error) {
            logger.error(`Critical failure during startup: ${error.message}`);
            process.exit(1);
        }
    }

    async handleKlineMessage(kline, symbol = CONFIG.symbol, strategy = null) {
        if (kline.x) { // Candle closed
            const candle = [
                kline.t, parseFloat(kline.o), parseFloat(kline.h), parseFloat(kline.l), parseFloat(kline.c), parseFloat(kline.v), kline.T
            ];

            // Manage Context per Symbol
            if (!this.marketData.has(symbol)) {
                this.marketData.set(symbol, { candles: [], strategy: strategy || this.strategy });
            }
            const context = this.marketData.get(symbol);
            context.candles.push(candle);
            if (context.candles.length > 500) context.candles.shift();

            // Legacy Sync (for Dashboard) if Primary Symbol
            if (symbol === CONFIG.symbol) {
                this.candles = context.candles;
                this.lastMessageTime = Date.now();
                this.sosSent = false;
                logger.info(`Candle closed [${symbol}]: ${candle[4]}`);
            } else {
                logger.debug(`Candle closed [${symbol}]: ${candle[4]}`);
            }

            db.saveCandle(symbol, candle).catch(e => logger.error(`DB Save Error: ${e.message}`));

            const pos = this.activePositions.get(symbol) || null;
            if (symbol === CONFIG.symbol) this.activePosition = pos; // Sync legacy

            await this.executeStrategy(symbol, candle, context.candles, context.strategy, pos);
        }
    }

    async executeStrategy(symbol, latestCandle, history, strategy, position) {
        const entryPrice = position ? position.entryPrice : 0;
        const inPosition = !!position;

        const signal = strategy.onCandle(latestCandle, history, inPosition, entryPrice);

        if (signal) {
            logger.info(`SIGNAL [${symbol}]: ${signal.action} @ ${signal.price} [Reason: ${signal.reason}]`);
            await this.executeTrade(symbol, signal, position);
        }
    }

    async executeTrade(symbol, signal, position) {
        if (this.liveTrading) {
            await this.executeRealTrade(symbol, signal, position);
        } else {
            await this.executePaperTrade(symbol, signal, position);
        }
    }

    async executePaperTrade(symbol, signal, position) {
        const fee = 0.001;
        let tradeAmount = 0;

        if (signal.action === 'BUY') {
            // Position sizing: divide capital equally among active pairs
            const activePairs = Math.max(this.marketData.size, 1);
            const maxAllocation = this.balance.usdt / activePairs;
            const amountUsdt = Math.min(this.balance.usdt, maxAllocation);
            if (amountUsdt < 10) return; // Min trade

            const amountAsset = (amountUsdt / signal.price) * (1 - fee);
            tradeAmount = amountAsset;

            this.balance.usdt -= amountUsdt;

            const newPos = {
                symbol: symbol,
                side: 'BUY',
                entryPrice: signal.price,
                amount: amountAsset,
                isPaper: true,
                timestamp: Date.now()
            };

            this.activePositions.set(symbol, newPos);
            if (symbol === CONFIG.symbol) {
                this.lastBuyPrice = signal.price;
                this.activePosition = newPos;
            }

            await this.saveActivePosition(newPos);
        } else {
            // SELL
            if (!position) return;
            const usdtReceived = (position.amount * signal.price) * (1 - fee);
            tradeAmount = position.amount;
            this.balance.usdt += usdtReceived;

            this.activePositions.delete(symbol);
            if (symbol === CONFIG.symbol) this.activePosition = null;

            await this.clearActivePosition(symbol);
        }
        await this.savePaperBalance();
        db.saveTrade({ ...signal, symbol: symbol, type: 'PAPER', amount: tradeAmount });
        notifications.notifyTrade({ ...signal, symbol: symbol, type: 'PAPER', amount: tradeAmount });
    }

    async executeRealTrade(symbol, signal, position) {
        try {
            logger.warn(`!!! EXECUTING REAL TRADE [${symbol}]: ${signal.action} @ ${signal.price} !!!`);
            notifications.notifyAlert(`🚨 LIVE TRADE: ${signal.action} ${symbol} @ $${signal.price}`);

            if (signal.action === 'BUY') {
                // Get real USDT balance from Binance
                const balances = await binanceService.getAccountBalance();
                const usdtBalance = balances.find(b => b.asset === 'USDT');
                const availableUsdt = usdtBalance ? usdtBalance.free : 0;

                // Position sizing: divide among active pairs
                const activePairs = Math.max(this.marketData.size, 1);
                const maxAllocation = availableUsdt / activePairs;
                if (maxAllocation < 10) {
                    logger.warn(`[LIVE] Insufficient USDT balance for ${symbol}: $${availableUsdt.toFixed(2)}`);
                    return;
                }

                // Calculate quantity to buy
                const quantity = (maxAllocation / signal.price) * 0.999; // 0.1% buffer for fees
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

                this.activePositions.set(symbol, newPos);
                if (symbol === CONFIG.symbol) {
                    this.lastBuyPrice = filledPrice;
                    this.activePosition = newPos;
                }
                await this.saveActivePosition(newPos);

                logger.success(`[LIVE] BUY executed: ${filledQty} ${symbol} @ $${filledPrice} (Order: ${order.orderId})`);
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
                const pnl = ((filledPrice - position.entryPrice) / position.entryPrice * 100).toFixed(2);

                this.activePositions.delete(symbol);
                if (symbol === CONFIG.symbol) this.activePosition = null;
                await this.clearActivePosition(symbol);

                logger.success(`[LIVE] SELL executed: ${filledQty} ${symbol} @ $${filledPrice} | PnL: ${pnl}% (Order: ${order.orderId})`);
                db.saveTrade({ ...signal, symbol, type: 'LIVE', amount: filledQty, price: filledPrice });
                notifications.notifyTrade({ ...signal, symbol, type: 'LIVE', amount: filledQty, price: filledPrice });
            }

            // Refresh real balance after trade
            await this.fetchRealBalance();

        } catch (error) {
            logger.error(`[LIVE] TRADE FAILED [${symbol}]: ${error.message}`);
            notifications.notifyAlert(`🚨 LIVE TRADE FAILED: ${symbol} ${signal.action} - ${error.message}`);
        }
    }

    async connectWebSocket() {
        try {
            // Load Active Pairs from DB
            const res = await db.pool.query('SELECT symbol, strategy_name FROM active_trading_pairs WHERE is_active = true');

            if (res.rows.length > 0) {
                for (const row of res.rows) {
                    this.addTradingPair(row.symbol, row.strategy_name);
                }
            } else {
                // Fallback to default if no active pairs in DB
                this.addTradingPair(CONFIG.symbol, 'BoosisTrend');
            }

            // Connect
            wsManager.connect();
            logger.success('[LiveTrader] ✅ WebSocket manager inicializado con multi-activo');
        } catch (error) {
            logger.error(`Error inicializando WebSocket: ${error.message}`);
        }
    }

    // --- HELPER METHODS ---

    addTradingPair(symbol, strategyName) {
        // Load profile first (will return default if not exists)
        const profile = profileManager.getProfile(symbol);

        // If strategyName passed explicitly, override default
        const effectiveStrategyName = strategyName || profile.strategy || 'BoosisTrend';

        const strategy = this._createStrategyWithProfile(effectiveStrategyName, profile);

        // Setup context
        if (!this.marketData.has(symbol)) {
            this.marketData.set(symbol, { candles: [], strategy });
        }

        wsManager.addSymbol(symbol, (klineData) => {
            if (klineData.k.x) {
                this.handleKlineMessage(klineData.k, symbol, strategy);
            }
        });
        logger.info(`[LiveTrader] ✅ Pair agregado: ${symbol} con ${effectiveStrategyName}`);
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

    async loadPaperBalance() {
        const res = await db.pool.query('SELECT value FROM trading_settings WHERE key = $1', ['paper_balance']);
        if (res.rows.length > 0) this.balance = JSON.parse(res.rows[0].value);
    }

    async savePaperBalance() {
        await db.pool.query('INSERT INTO trading_settings (key, value) VALUES ($1, $2) ON CONFLICT (key) DO UPDATE SET value = $2', ['paper_balance', JSON.stringify(this.balance)]);
    }

    async loadActivePosition() {
        const res = await db.pool.query('SELECT * FROM active_position WHERE symbol = $1', [CONFIG.symbol]);
        if (res.rows.length > 0) {
            const row = res.rows[0];
            this.activePosition = { symbol: row.symbol, side: row.side, entryPrice: parseFloat(row.entry_price), amount: parseFloat(row.amount), isPaper: row.is_paper, timestamp: parseInt(row.timestamp) };
            this.lastBuyPrice = this.activePosition.entryPrice;
        }
    }

    async saveActivePosition(pos) {
        await db.pool.query('INSERT INTO active_position (symbol, side, entry_price, amount, is_paper, timestamp) VALUES ($1, $2, $3, $4, $5, $6) ON CONFLICT (symbol) DO UPDATE SET side = $2, entry_price = $3, amount = $4, is_paper = $5, timestamp = $6', [pos.symbol, pos.side, pos.entryPrice, pos.amount, pos.isPaper, pos.timestamp]);
    }

    async clearActivePosition(symbol) {
        await db.pool.query('DELETE FROM active_position WHERE symbol = $1', [symbol || CONFIG.symbol]);
        if (symbol === CONFIG.symbol) this.activePosition = null;
    }

    async loadHistoricalData() {
        // Simple fetch...
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
