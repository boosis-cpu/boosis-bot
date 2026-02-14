require('dotenv').config();
const WebSocket = require('ws');
const axios = require('axios');
const path = require('path');
const express = require('express');
const os = require('os');
const cors = require('cors');
const logger = require('../core/logger');
const BoosisTrend = require('../strategies/BoosisTrend');
const auth = require('../core/auth');
const validators = require('../core/validators');
const db = require('../core/database'); // Fixed import path
const notifications = require('../core/notifications'); // Added for executeRealTrade
const binanceService = require('../core/binance'); // Added for executeRealTrade
const TechnicalIndicators = require('../core/technical_indicators'); // Added for calculateMarketHealth

// Configuration
const CONFIG = {
    symbol: 'BTCUSDT',
    interval: '5m',
    wsUrl: `wss://stream.binance.com:9443/ws/btcusdt@kline_5m`,
    apiUrl: 'https://api.binance.com/api/v3',
    port: 3000
};

class LiveTrader {
    constructor() {
        this.strategy = new BoosisTrend();
        this.candles = [];
        this.trades = []; // Store trades in memory for the dashboard
        this.ws = null;
        this.app = express();

        // ⛔ SAFETY CHECK - PROTOCOLO TONY 13 FEB 2026
        // Nunca remover ni bypassear este bloque.
        this.tradingMode = process.env.TRADING_MODE || 'PAPER';
        this.forcePaper = process.env.FORCE_PAPER_MODE !== 'false'; // Default to true

        if (this.tradingMode === 'LIVE' && this.forcePaper) {
            const errorMsg = '🚨 CRITICAL SECURITY BREACH: Bot attempted to start in LIVE mode while FORCE_PAPER is active.';
            logger.error(errorMsg);
            throw new Error(errorMsg);
        }

        // Trading State - Will be loaded from DB
        this.liveTrading = false;
        this.paperTrading = true;
        this.balance = {
            usdt: 1000,
            asset: 0
        };

        // Real Balance (cached)
        this.realBalance = [];
        this.totalBalanceUSD = 0;
        this.equityHistory = [];
        this.emergencyStopped = false;
        this.activePosition = null;

        logger.info(`Initializing Boosis Live Trader [Mode: ${this.tradingMode}] [Symbol: ${CONFIG.symbol}]`);
        this.setupServer();
    }

    setupServer() {
        this.app.use(cors()); // Enable CORS for local development
        this.app.use(express.json());

        // Middleware protector
        const authMiddleware = async (req, res, next) => {
            // Permitir login sin token
            if (req.url === '/api/login' || req.originalUrl === '/api/login') {
                return next();
            }

            const authHeader = req.headers.authorization || '';
            let token = authHeader.replace('Bearer ', '');

            // Fallback for SSE which cannot send headers easily
            if (!token && req.query.token) {
                token = req.query.token;
            }

            const isValid = await auth.verifyToken(token);
            if (!isValid) {
                return res.status(401).json({ error: 'No autorizado' });
            }

            next();
        };

        // Middleware for API logging
        this.app.use((req, res, next) => {
            logger.debug(`API Request: ${req.method} ${req.url}`);
            next();
        });

        // Serve static files from React build
        this.app.use(express.static(path.join(__dirname, '../../public')));

        // Login Endpoint (NO protegido)
        this.app.post('/api/login', async (req, res) => {
            const { password } = req.body;
            const token = await auth.generateToken(password);

            if (!token) {
                return res.status(401).json({ error: 'Contraseña incorrecta' });
            }

            res.json({ token, expiresIn: '24h' });
        });

        // Endpoint to toggle trading mode (protected)
        this.app.post('/api/settings/trading-mode', authMiddleware, async (req, res) => {
            const { live } = req.body;

            // Update runtime state
            this.liveTrading = live;
            this.paperTrading = !live;
            this.emergencyStopped = false; // Reset stop flag on toggle

            // Persist to database
            await this.saveTradingMode();

            // Reconnect if it was stopped
            if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
                this.connectWebSocket();
            }

            logger.warn(`TRADING MODE CHANGED: ${live ? 'LIVE (REAL MONEY)' : 'PAPER (SIMULATION)'}`);

            notifications.send(`🔄 **TRADING MODE CHANGED**\n\nEl bot ahora opera en modo: ${live ? '💰 LIVE (REAL MONEY)' : '📝 PAPER (SIMULATION)'}`, 'warning');

            res.json({
                success: true,
                mode: live ? 'LIVE' : 'PAPER',
                message: `Bot switched to ${live ? 'LIVE' : 'PAPER'} trading mode.`
            });
        });

        // Emergency Stop Endpoint
        this.app.post('/api/emergency-stop', authMiddleware, async (req, res) => {
            try {
                // Force paper trading mode
                this.liveTrading = false;
                this.paperTrading = true;
                this.emergencyStopped = true;
                await this.saveTradingMode();

                // Close WebSocket to stop receiving new data
                if (this.ws) {
                    this.ws.terminate();
                }

                logger.error('🚨 EMERGENCY STOP ACTIVATED - All trading halted');
                notifications.notifyAlert('🚨 **EMERGENCY STOP ACTIVATED**\n\nEl bot ha detenido todas las operaciones y cerrado la conexión con el mercado. Revisa el dashboard para reanudar manualmente.');

                res.json({
                    success: true,
                    message: 'Emergency stop activated. Bot switched to PAPER mode and WebSocket closed.'
                });
            } catch (error) {
                logger.error(`Error in emergency stop: ${error.message}`);
                res.status(500).json({ error: 'Failed to execute emergency stop' });
            }
        });

        // ENDPOINTS PROTEGIDOS
        // Logs Stream Endpoint (SSE)
        this.app.get('/api/logs/stream', authMiddleware, (req, res) => {
            res.setHeader('Content-Type', 'text/event-stream');
            res.setHeader('Cache-Control', 'no-cache');
            res.setHeader('Connection', 'keep-alive');
            res.flushHeaders(); // flush the headers to establish SSE with client

            const onLog = (log) => {
                res.write(`data: ${JSON.stringify(log)}\n\n`);
            };

            // Subscribe to logger events
            logger.on('log', onLog);

            // Cleanup on client disconnect
            req.on('close', () => {
                logger.off('log', onLog);
            });
        });

        this.app.get('/api/status', authMiddleware, (req, res) => {
            res.json({
                status: 'online',
                bot: 'Boosis Quant Bot',
                strategy: this.strategy.name,
                symbol: CONFIG.symbol,
                liveTrading: this.liveTrading,
                paperTrading: !this.liveTrading,
                balance: this.balance,
                realBalance: this.realBalance,
                totalBalanceUSD: this.totalBalanceUSD,
                equityHistory: this.equityHistory.slice(-50),
                emergencyStopped: this.emergencyStopped,
                activePosition: this.activePosition,
                marketStatus: this.calculateMarketHealth()
            });
        });

        this.app.get('/api/health', (req, res) => {
            const health = {
                status: 'ACTIVE',
                uptime: process.uptime(),
                timestamp: new Date().toISOString(),
                bot: {
                    wsConnected: this.ws && this.ws.readyState === WebSocket.OPEN,
                    candlesCount: this.candles.length,
                    lastCandleTime: this.candles.length > 0 ? new Date(this.candles[this.candles.length - 1][6]).toLocaleString() : null,
                    emergencyStopped: this.emergencyStopped
                },
                system: {
                    loadAvg: os.loadavg(),
                    freeMem: `${(os.freemem() / 1024 / 1024 / 1024).toFixed(2)} GB`
                }
            };
            res.json(health);
        });

        this.app.get('/api/metrics', authMiddleware, (req, res) => {
            // Calculate basic metrics from trade history
            const winningTrades = this.trades.filter(t => (t.side === 'SELL' && t.price > t.entryPrice) || (t.side === 'BUY' && false)); // Simplified win logic
            const winRate = this.trades.length > 0 ? ((winningTrades.length / (this.trades.length / 2)) * 100).toFixed(1) + '%' : '0%';

            res.json({
                profitFactor: '1.5', // Placeholder
                winRate: winRate,
                totalTrades: this.trades.length
            });
        });

        this.app.get('/api/candles', authMiddleware, (req, res) => {
            try {
                const limit = validators.validateLimit(req.query.limit || 100);

                // Calculate indicators for frontend visualization
                const historyPrices = this.candles.map(c => parseFloat(c[4]));
                const rsi = historyPrices.length >= 14 ? TechnicalIndicators.calculateRSI(historyPrices, 14) : null;
                const sma200 = historyPrices.length >= 200 ? TechnicalIndicators.calculateSMA(historyPrices, 200) : null;
                const bb = historyPrices.length >= 20 ? TechnicalIndicators.calculateBollingerBands(historyPrices, 20, 2) : null;

                // Map candles with their indicator values at that point in time (simplified, using current calculation for last candle logic usually)
                // For visualization, passing the latest calc is often enough or we'd need to calculate historical indicators
                // Here we just pass raw candles + latest indicators for the current state

                const candlesWithIndicators = this.candles.slice(-limit).map((c, i, arr) => {
                    // Very simplified indicator attachment for chart
                    // A real implementation would calculate indicators for EACH point in history
                    // For now, just sending raw data
                    return {
                        open_time: c[0],
                        open: c[1],
                        high: c[2],
                        low: c[3],
                        close: c[4],
                        volume: c[5],
                        close_time: c[6],
                        indicators: {
                            rsi: i === arr.length - 1 ? rsi : null,
                            sma200: i === arr.length - 1 ? sma200 : null,
                            bb: i === arr.length - 1 ? bb : null
                        }
                    };
                });

                res.json(candlesWithIndicators);
            } catch (error) {
                logger.error(`Error in /api/candles: ${error.message}`);
                res.status(400).json({ error: error.message });
            }
        });

        this.app.get('/api/trades', authMiddleware, (req, res) => {
            try {
                const limit = validators.validateLimit(req.query.limit || 50);
                const trades = this.trades.slice(-limit).reverse();
                res.json(trades);
            } catch (error) {
                res.status(400).json({ error: error.message });
            }
        });

        // Serve React App (SPA)
        const distPath = path.join(__dirname, '../../boosis-ui/dist');
        this.app.use(express.static(distPath));

        this.app.get(/(.*)/, (req, res) => {
            // If not API, serve index.html for client-side routing
            if (!req.path.startsWith('/api')) {
                res.sendFile(path.join(distPath, 'index.html'));
            } else {
                res.status(404).json({ error: 'Endpoint not found' });
            }
        });
    }

    async start() {
        try {
            logger.info('Starting Boosis Quant Bot...');

            // Initialize Database
            await db.connect();
            await db.initSchema();

            // 1. Initial Load from Persistent Store
            await this.initTradingModeTable();
            await this.loadTradingMode();
            await this.loadPaperBalance();
            await this.loadActivePosition();
            await this.loadRecentTrades();

            // 1.5 Initial Data Load (Bootstrap)
            await this.loadHistoricalData();

            // 2. Fetch Initial Balance (Real)
            this.fetchRealBalance();
            setInterval(() => this.fetchRealBalance(), 60000); // Refresh every minute

            // 3. Reconcile with Binance (Paso 3)
            if (this.liveTrading) {
                await this.reconcileOrders();
            }

            // 4. Start Heartbeat (Paso 2)
            this.startHeartbeat();

            // 5. Connect to WebSocket (skip if emergency stopped)
            if (!this.emergencyStopped) {
                this.connectWebSocket();
            } else {
                logger.warn('⚠️ Skipping WebSocket connection - Emergency Stop is active');
            }

            const mode = this.liveTrading ? 'LIVE (💰 REAL MONEY)' : 'PAPER (📝 SIMULATION)';
            notifications.send(`🚀 **BOT INICIADO**\n\nModo: ${mode}\nBalance: $${this.totalBalanceUSD.toFixed(2)} USD\n\nEl sistema está listo y monitoreando el mercado.`, 'info');

            // 6. Setup Daily Summary (Every 24h)
            setInterval(() => this.sendDailySummary(), 24 * 60 * 60 * 1000);

            // 7. Telegram Interactive Commands
            this.setupTelegramCommands();

            // 8. Start Web Server
            this.app.listen(CONFIG.port, () => {
                logger.success(`Dashboard API listening on http://localhost:${CONFIG.port}`);
            });

        } catch (error) {
            logger.error(`Critical failure during startup: ${error.message}`);
            process.exit(1);
        }
    }

    startHeartbeat() {
        // Enviar un "latido" cada 12 horas
        setInterval(() => {
            const status = this.emergencyStopped ? '🛑 DETENIDO' : '✅ OPERANDO';
            const mode = this.liveTrading ? '💰 LIVE' : '📝 PAPER';
            const balance = this.totalBalanceUSD.toFixed(2);

            notifications.send(`💓 **HEARTBEAT - BOOSIS BOT**\n\nEstatus: ${status}\nModo: ${mode}\nBalance Actual: $${balance} USD\nUptime: ${(process.uptime() / 3600).toFixed(2)} horas\n\nSigo aquí, Tony. Todo bajo control.`, 'info');
        }, 12 * 60 * 60 * 1000);

        logger.info('Heartbeat system initialized (12h interval)');
    }

    async reconcileOrders() {
        try {
            logger.info('Reconciling orders with Binance...');
            const openOrders = await binanceService.getOpenOrders(CONFIG.symbol);

            if (openOrders && openOrders.length > 0) {
                logger.warn(`Found ${openOrders.length} open orders on Binance. Syncing...`);
                notifications.send(`⚠️ **RECONCILIACIÓN**\n\nSe encontraron ${openOrders.length} órdenes abiertas en Binance. Asegúrate de que el bot las tenga registradas.`, 'warning');
            } else {
                logger.success('No open orders found on Binance. State is clean.');
            }
        } catch (error) {
            logger.error(`Failed to reconcile orders: ${error.message}`);
        }
    }

    async fetchRealBalance() {
        try {
            const enrichedData = await binanceService.getEnrichedBalance();
            this.realBalance = enrichedData.balances;
            this.totalBalanceUSD = enrichedData.totalUSD;
        } catch (error) {
            logger.error(`Error obteniendo balance de Binance: ${error.message}`);
        }
    }

    async initTradingModeTable() {
        try {
            await db.pool.query(`
                CREATE TABLE IF NOT EXISTS trading_settings (
                    key VARCHAR(50) PRIMARY KEY,
                    value TEXT NOT NULL,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                );

                CREATE TABLE IF NOT EXISTS active_position (
                    symbol VARCHAR(20) PRIMARY KEY,
                    side VARCHAR(10) NOT NULL,
                    entry_price DECIMAL NOT NULL,
                    amount DECIMAL NOT NULL,
                    is_paper BOOLEAN NOT NULL,
                    timestamp BIGINT NOT NULL
                );
            `);
        } catch (error) {
            logger.error(`Error inicializando tabla de configuración: ${error.message}`);
        }
    }

    async loadTradingMode() {
        try {
            const result = await db.pool.query(
                'SELECT key, value FROM trading_settings WHERE key IN ($1, $2)',
                ['live_trading', 'emergency_stopped']
            );

            const settings = {};
            result.rows.forEach(row => {
                settings[row.key] = row.value;
            });

            if (settings.live_trading) {
                this.liveTrading = settings.live_trading === 'true';

                // ⛔ SECONDARY SAFETY CHECK - PROTOCOLO TONY
                if (this.liveTrading && this.forcePaper) {
                    logger.error('🚨 UNAUTHORIZED LIVE MODE DETECTED IN DB - FORCING BACK TO PAPER');
                    this.liveTrading = false;
                    await this.saveTradingMode(); // Restore safety in DB
                }

                this.paperTrading = !this.liveTrading;
                logger.info(`Trading Mode Loaded from DB: ${this.liveTrading ? 'LIVE (REAL MONEY)' : 'PAPER (SIMULATION)'}`);
            } else {
                // Si no existe en DB, usar el valor del .env como default
                this.liveTrading = process.env.LIVE_TRADING === 'true';

                // ⛔ SECONDARY SAFETY CHECK - PROTOCOLO TONY
                if (this.liveTrading && this.forcePaper) {
                    this.liveTrading = false;
                }

                this.paperTrading = !this.liveTrading;
                await this.saveTradingMode(); // Guardar el default en DB
                logger.info(`Trading Mode Initialized from ENV: ${this.liveTrading ? 'LIVE (REAL MONEY)' : 'PAPER (SIMULATION)'}`);
            }

            // Load emergency stop state
            if (settings.emergency_stopped) {
                this.emergencyStopped = settings.emergency_stopped === 'true';
                if (this.emergencyStopped) {
                    logger.warn('⚠️ EMERGENCY STOP STATE RESTORED - Bot will not auto-connect to market');
                }
            }
        } catch (error) {
            logger.error(`Error cargando modo de trading: ${error.message}`);
            // Fallback al .env si hay error
            this.liveTrading = process.env.LIVE_TRADING === 'true';
            this.paperTrading = !this.liveTrading;
        }
    }

    async saveTradingMode() {
        try {
            await db.pool.query(`
                INSERT INTO trading_settings (key, value, updated_at)
                VALUES ($1, $2, CURRENT_TIMESTAMP)
                ON CONFLICT (key) DO UPDATE
                SET value = $2, updated_at = CURRENT_TIMESTAMP
            `, ['live_trading', this.liveTrading.toString()]);

            await db.pool.query(`
                INSERT INTO trading_settings (key, value, updated_at)
                VALUES ($1, $2, CURRENT_TIMESTAMP)
                ON CONFLICT (key) DO UPDATE
                SET value = $2, updated_at = CURRENT_TIMESTAMP
            `, ['emergency_stopped', this.emergencyStopped.toString()]);

            logger.success(`Trading mode saved to database: ${this.liveTrading ? 'LIVE' : 'PAPER'}`);
        } catch (error) {
            logger.error(`Error guardando modo de trading: ${error.message}`);
        }
    }

    async saveActivePosition(position) {
        try {
            await db.pool.query(`
                INSERT INTO active_position (symbol, side, entry_price, amount, is_paper, timestamp)
                VALUES ($1, $2, $3, $4, $5, $6)
                ON CONFLICT (symbol) DO UPDATE
                SET side = $2, entry_price = $3, amount = $4, is_paper = $5, timestamp = $6
            `, [
                position.symbol,
                position.side,
                position.entryPrice,
                position.amount,
                position.isPaper,
                position.timestamp
            ]);
            this.activePosition = position; // Update memory
            logger.success(`Active position [${position.side}] saved to database.`);
        } catch (error) {
            logger.error(`Error saving active position: ${error.message}`);
        }
    }

    async clearActivePosition() {
        try {
            await db.pool.query('DELETE FROM active_position WHERE symbol = $1', [CONFIG.symbol]);
            this.activePosition = null; // Update memory
            logger.info('Active position cleared from database.');
        } catch (error) {
            logger.error(`Error clearing active position: ${error.message}`);
        }
    }

    async loadActivePosition() {
        try {
            const result = await db.pool.query('SELECT * FROM active_position WHERE symbol = $1', [CONFIG.symbol]);
            if (result.rows.length > 0) {
                const row = result.rows[0];
                const position = {
                    symbol: row.symbol,
                    side: row.side,
                    entryPrice: parseFloat(row.entry_price),
                    amount: parseFloat(row.amount),
                    isPaper: row.is_paper,
                    timestamp: parseInt(row.timestamp)
                };

                this.activePosition = position; // Maintain in-memory tracking

                // Restore internal state
                if (position.isPaper) {
                    this.balance.asset = position.amount;
                    this.balance.usdt = 0;
                }

                logger.warn(`RECOVERY: Found active [${position.isPaper ? 'PAPER' : 'REAL'}] position: ${position.side} @ ${position.entryPrice}`);
                return position;
            }
            return null;
        } catch (error) {
            logger.error(`Error loading active position: ${error.message}`);
            return null;
        }
    }

    async savePaperBalance() {
        try {
            await db.pool.query(`
                INSERT INTO trading_settings (key, value, updated_at)
                VALUES ($1, $2, CURRENT_TIMESTAMP)
                ON CONFLICT (key) DO UPDATE
                SET value = $2, updated_at = CURRENT_TIMESTAMP
            `, ['paper_balance', JSON.stringify(this.balance)]);
            logger.debug('Paper balance saved to database');
        } catch (error) {
            logger.error(`Error saving paper balance: ${error.message}`);
        }
    }

    async loadPaperBalance() {
        try {
            const result = await db.pool.query(
                'SELECT value FROM trading_settings WHERE key = $1',
                ['paper_balance']
            );
            if (result.rows.length > 0) {
                this.balance = JSON.parse(result.rows[0].value);
                logger.info(`Paper balance restored: $${this.balance.usdt.toFixed(2)} USDT + ${this.balance.asset.toFixed(6)} BTC`);
            }
        } catch (error) {
            logger.error(`Error loading paper balance: ${error.message}`);
        }
    }

    async loadHistoricalData() {
        logger.info('Fetching historical data to warm up indicators...');
        try {
            const response = await axios.get(`${CONFIG.apiUrl}/klines`, {
                params: {
                    symbol: CONFIG.symbol,
                    interval: '5m',
                    limit: 300 // Enough for SMA200 + buffer
                }
            });

            this.candles = response.data.map(k => [
                k[0], // Open time
                parseFloat(k[1]), // Open
                parseFloat(k[2]), // High
                parseFloat(k[3]), // Low
                parseFloat(k[4]), // Close
                parseFloat(k[5]), // Volume
                k[6]  // Close time
            ]);

            logger.success(`Loaded ${this.candles.length} historical candles.`);
        } catch (error) {
            logger.error(`Failed to load historical data: ${error.message}`);
            throw error;
        }
    }

    connectWebSocket() {
        this.ws = new WebSocket(CONFIG.wsUrl);

        this.ws.on('open', () => {
            logger.success('Connected to Binance WebSocket.');
        });

        this.ws.on('message', (data) => {
            try {
                const message = JSON.parse(data);
                if (message.e === 'kline') {
                    this.handleKlineMessage(message.k);
                }
            } catch (err) {
                logger.error(`Error parsing WS message: ${err.message}`);
            }
        });

        this.ws.on('close', () => {
            if (this.emergencyStopped) {
                logger.warn('WebSocket connection closed and Emergency Stop is ACTIVE. No reconnection.');
                return;
            }
            logger.warn('WebSocket connection closed. Reconnecting in 5s...');
            notifications.notifyAlert('⚠️ WebSocket de Binance desconectado. Reintentando en 5s...');
            setTimeout(() => this.connectWebSocket(), 5000);
        });

        this.ws.on('error', (err) => {
            logger.error(`WebSocket Error: ${err.message}`);
            notifications.notifyError(err, 'WebSocket Connection');
        });
    }

    handleKlineMessage(kline) {
        const isCandleClosed = kline.x;
        const candle = [
            kline.t,              // Open Time
            parseFloat(kline.o), // Open
            parseFloat(kline.h), // High
            parseFloat(kline.l), // Low
            parseFloat(kline.c), // Close
            parseFloat(kline.v), // Volume
            kline.T               // Close Time
        ];

        // Record equity data points for the /chart command
        this.recordEquitySnapshot(candle[4]);

        // Only process strategy logic when candle closes to avoid repainting
        if (isCandleClosed) {
            // Add new candle to history and remove oldest
            this.candles.push(candle);
            if (this.candles.length > 300) this.candles.shift(); // Keep size manageable for SMA200

            logger.info(`Candle closed: ${candle[4]} (Volume: ${candle[5]})`);
            this.executeStrategy(candle);
        }
    }

    executeStrategy(latestCandle) {
        const signal = this.strategy.onCandle(latestCandle, this.candles);

        if (signal) {
            logger.info(`SIGNAL DETECTED: ${signal.action} @ ${signal.price} | ${signal.reason}`);
            this.executeTrade(signal);
        }
    }

    async executeTrade(signal) {
        if (this.liveTrading) {
            await this.executeRealTrade(signal);
        } else {
            // Paper trading is always the fallback if live is OFF
            await this.executePaperTrade(signal);
        }
        this.recordEquitySnapshot(signal.price);
    }

    async executeRealTrade(signal) {
        try {
            logger.warn(`!!! EJECUTANDO ORDEN REAL EN BINANCE: ${signal.action} @ ${signal.price} !!!`);

            // For now, we still calculate simulated quantity based on balance
            // In a full implementation, we'd fetch balance from Binance first
            const fee = 0.001;
            let quantity = 0;

            if (signal.action === 'BUY') {
                const availableUsdt = parseFloat(this.realBalance?.find(b => b.asset === 'USDT')?.free || 0);
                if (availableUsdt < 10) throw new Error('Balance insuficiente en Binance para comprar.');
                quantity = (availableUsdt / signal.price) * (1 - fee);
            } else {
                const availableAsset = parseFloat(this.realBalance?.find(b => b.asset === 'BTC')?.free || 0);
                if (availableAsset < 0.0001) throw new Error('Fondos de BTC insuficientes en Binance para vender.');
                quantity = availableAsset;
            }

            // Dynamic precision based on Binance filters
            const roundedQty = binanceService.formatQuantity(quantity);

            const result = await binanceService.executeOrder(CONFIG.symbol, signal.action, roundedQty);

            const executionPrice = result.fills ?
                result.fills.reduce((sum, f) => sum + (parseFloat(f.price) * parseFloat(f.qty)), 0) / result.fills.reduce((sum, f) => sum + parseFloat(f.qty), 0) :
                signal.price;

            const slippage = ((executionPrice - signal.price) / signal.price) * 100;

            const trade = {
                symbol: CONFIG.symbol,
                side: signal.action,
                price: parseFloat(executionPrice.toFixed(2)),
                expectedPrice: signal.price,
                slippage: parseFloat(slippage.toFixed(4)),
                amount: roundedQty,
                timestamp: Date.now(),
                type: 'REAL',
                executionId: result.orderId,
                reason: signal.reason,
                latency: Date.now() - signal.timestamp
            };

            this.trades.push(trade);
            await db.saveTrade(trade);

            // Persist State
            if (signal.action === 'BUY') {
                await this.saveActivePosition({
                    symbol: CONFIG.symbol,
                    side: 'LONG',
                    entryPrice: trade.price,
                    amount: trade.amount,
                    isPaper: false,
                    timestamp: trade.timestamp
                });
            } else {
                await this.clearActivePosition();
            }

            notifications.notifyTrade({
                ...trade,
                status: 'CONCRETADA EN BINANCE',
                balanceUsdt: this.realBalance?.find(b => b.asset === 'USDT')?.free,
                balanceAsset: this.realBalance?.find(b => b.asset === 'BTC')?.free
            });

            logger.success(`[LIVE] ${signal.action} ejecutado con ${trade.slippage}% de slippage.`);
        } catch (error) {
            logger.error(`FALLO CRÍTICO EN EJECUCIÓN REAL: ${error.message}`);
            notifications.notifyAlert(`❌ ERROR EN BINANCE: No se pudo ejecutar ${signal.action}. Revisar búnker.`);
        }
    }

    async executePaperTrade(signal) {
        const fee = 0.001; // 0.1% fee
        const price = signal.price;
        const timestamp = Date.now();

        if (signal.action === 'BUY' && this.balance.usdt > 10) {
            const amountUsd = this.balance.usdt;
            const amountAsset = (amountUsd / price) * (1 - fee);
            this.balance.asset += amountAsset;
            this.balance.usdt = 0;

            const trade = {
                symbol: CONFIG.symbol,
                side: 'BUY',
                price: price,
                amount: amountAsset,
                timestamp: timestamp,
                is_paper: true,
                reason: signal.reason
            };
            this.trades.push(trade);
            notifications.notifyTrade({ ...trade, type: 'PAPER' });

            // Persist State (Paper)
            await this.saveActivePosition({
                symbol: CONFIG.symbol,
                side: 'LONG',
                entryPrice: price,
                amount: amountAsset,
                isPaper: true,
                timestamp: timestamp
            });

            logger.success(`[PAPER TRADE] BOUGHT ${amountAsset.toFixed(6)} BTC @ ${price}. Portfolio Value: ~$${(amountAsset * price).toFixed(2)}`);

            // Save paper balance
            await this.savePaperBalance();

            // Low balance alert (Paper)
            if (this.balance.usdt < 10) {
                notifications.notifyAlert(`⚠️ **BALANCE BAJO (PAPER)**: Solo quedan $${this.balance.usdt.toFixed(2)} USDT.`);
            }
        } else if (signal.action === 'SELL' && this.balance.asset > 0.0001) {
            const amountAsset = this.balance.asset;
            const amountUsd = (amountAsset * price) * (1 - fee);
            this.balance.usdt += amountUsd;
            this.balance.asset = 0;

            const trade = {
                symbol: CONFIG.symbol,
                side: 'SELL',
                price: price,
                amount: amountAsset,
                timestamp: timestamp,
                is_paper: true,
                reason: signal.reason
            };
            this.trades.push(trade);
            notifications.notifyTrade({ ...trade, type: 'PAPER' });

            // Clear State (Paper)
            await this.clearActivePosition();

            // Save paper balance
            await this.savePaperBalance();

            logger.success(`[PAPER TRADE] SOLD ${amountAsset.toFixed(6)} BTC @ ${price}. New Balance: $${this.balance.usdt.toFixed(2)}`);
        }
    }

    async loadRecentTrades() {
        try {
            const result = await db.pool.query(
                'SELECT * FROM trades ORDER BY timestamp DESC LIMIT 50'
            );

            this.trades = result.rows.map(row => ({
                symbol: row.symbol,
                side: row.side,
                price: parseFloat(row.price),
                amount: parseFloat(row.amount),
                timestamp: parseInt(row.timestamp),
                is_paper: row.is_paper,
                reason: row.reason,
                entryPrice: parseFloat(row.entry_price) || null
            })).reverse(); // Reverse to maintain chronological order

            logger.info(`Loaded ${this.trades.length} recent trades from database`);
        } catch (error) {
            logger.error(`Error loading recent trades: ${error.message}`);
        }
    }

    recordEquitySnapshot(price) {
        const equity = this.balance.usdt + (this.balance.asset * price);
        this.equityHistory.push({ time: new Date().toLocaleTimeString(), value: parseFloat(equity.toFixed(2)) });
        if (this.equityHistory.length > 50) this.equityHistory.shift();
    }

    calculateMarketHealth() {
        if (this.candles.length < 20) return { status: 'UNKNOWN', volatility: 0 };

        const historySlice = this.candles.slice(-20);
        const prices = historySlice.map(c => parseFloat(c[4]));
        const highs = historySlice.map(c => parseFloat(c[2]));
        const lows = historySlice.map(c => parseFloat(c[3]));

        const atr = TechnicalIndicators.calculateATR(highs, lows, prices, 14);
        const currentPrice = prices[prices.length - 1];

        if (!atr || !currentPrice) return { status: 'UNKNOWN', volatility: 0 };

        const volatilityPercent = (atr / currentPrice) * 100;
        const maxVol = this.strategy.maxVolatilityPercent || 1.5;

        return {
            status: volatilityPercent < maxVol ? 'SAFE' : 'VOLATILE',
            volatility: volatilityPercent.toFixed(2)
        };
    }

    sendDailySummary() {
        if (!this.trades || this.trades.length === 0) return;

        const last24h = Date.now() - (24 * 60 * 60 * 1000);
        const recentTrades = this.trades.filter(t => t.timestamp > last24h);

        if (recentTrades.length === 0) return;

        const winningTrades = recentTrades.filter(t => (t.side === 'SELL' && t.price > t.entryPrice));

        // Calculate PnL (Net change in USD value)
        const currentPrice = this.candles.length > 0 ? parseFloat(this.candles[this.candles.length - 1][4]) : 0;
        const currentEquity = this.liveTrading ? this.totalBalanceUSD : (this.balance.usdt + (this.balance.asset * currentPrice));
        const initialEquity = this.equityHistory.length > 0 ? this.equityHistory[0].value : currentEquity;
        const pnlUSD = currentEquity - initialEquity;
        const pnlPercent = initialEquity > 0 ? ((pnlUSD / initialEquity) * 100).toFixed(2) : '0.00';

        notifications.notifyDailySummary({
            totalTrades: recentTrades.length,
            winningTrades: winningTrades.length,
            winRate: ((winningTrades.length / (recentTrades.filter(t => t.side === 'SELL').length || 1)) * 100).toFixed(1),
            pnl: `${pnlUSD > 0 ? '+' : ''}${pnlUSD.toFixed(2)} USD (${pnlPercent}%)`,
            balance: currentEquity
        });
    }

    setupTelegramCommands() {
        notifications.onCommand(async (command) => {
            logger.info(`Telegram command received: ${command}`);

            switch (command) {
                case '/test':
                    await notifications.send('📡 **Prueba de Conexión Exitosa**\n\nEl bot está en línea y respondiendo correctamente.');
                    break;

                case '/status':
                    const currentPrice = this.candles.length > 0 ? this.candles[this.candles.length - 1][4] : 'Cargando...';
                    const mode = this.liveTrading ? '💰 LIVE' : '📝 PAPER';
                    const balance = this.liveTrading ?
                        `Real: $${this.totalBalanceUSD?.toFixed(2) || 0} USD` :
                        `Simu: $${(this.balance.usdt + (this.balance.asset * currentPrice)).toFixed(2)} USD`;

                    // Indicators
                    const ind = this.strategy.lastIndicators || {};
                    const market = this.calculateMarketHealth();

                    let msg = `📊 **Estado de Boosis Bot**\n\n`;
                    msg += `**Modo:** ${mode}\n`;
                    msg += `**Precio BTC:** $${currentPrice}\n`;
                    msg += `**Balance:** ${balance}\n\n`;

                    msg += `**📈 Indicadores:**\n`;
                    msg += `• RSI: ${ind.rsi || 'N/A'}\n`;
                    msg += `• SMA 200: ${ind.sma200 || 'N/A'}\n`;
                    msg += `• Volatilidad: ${market.volatility}% (${market.status})\n\n`;

                    msg += `**💡 Estrategia:** ${this.strategy.name}\n`;
                    msg += `**⏳ Uptime:** ${Math.floor(process.uptime() / 60)}m`;

                    await notifications.send(msg);
                    break;

                case '/chart':
                    if (this.equityHistory.length < 2) {
                        await notifications.send('⚠️ No hay suficientes datos para generar el gráfico aún.');
                        break;
                    }

                    await notifications.send('📊 Generando gráfico de rendimiento...');

                    // Generate QuickChart URL
                    const chartConfig = {
                        type: 'line',
                        data: {
                            labels: this.equityHistory.map(h => h.time),
                            datasets: [{
                                label: 'Equity (USD)',
                                data: this.equityHistory.map(h => h.value),
                                borderColor: 'rgb(88, 166, 255)',
                                backgroundColor: 'rgba(88, 166, 255, 0.1)',
                                fill: true,
                                tension: 0.4
                            }]
                        },
                        options: {
                            title: { display: true, text: 'Rendimiento Boosis Bot (Equity USD)' },
                            scales: {
                                yAxes: [{ ticks: { fontColor: '#8b949e' } }],
                                xAxes: [{ ticks: { fontColor: '#8b949e' } }]
                            }
                        }
                    };

                    const chartUrl = `https://quickchart.io/chart?c=${encodeURIComponent(JSON.stringify(chartConfig))}&bkg=white`;
                    await notifications.sendPhoto(chartUrl, '📈 Evolución de tu capital en las últimas horas.');
                    break;

                case '/stop':
                    await notifications.send('⚠️ Ejecutando Parada de Emergencia desde Telegram...');
                    this.liveTrading = false;
                    this.paperTrading = true;
                    this.emergencyStopped = true;
                    await this.saveTradingMode();
                    if (this.ws) {
                        this.ws.terminate();
                    }
                    logger.error('🚨 EMERGENCY STOP ACTIVATED via Telegram');
                    await notifications.notifyAlert('🚨 **STOP CONFIRMADO**\n\nEl bot se ha detenido y desconectado del mercado.');
                    break;

                case '/start':
                    await notifications.send('🔄 Reactivando sistema...');
                    this.emergencyStopped = false;
                    this.connectWebSocket();
                    await notifications.send('✅ **SISTEMA REACTIVADO**\n\nEl bot está recibiendo datos de nuevo. Modo actual: PAPER.');
                    break;

                case '/live':
                    this.liveTrading = true;
                    this.paperTrading = false;
                    await this.saveTradingMode();
                    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) this.connectWebSocket();
                    await notifications.send('⚠️ **ALERTA: MODO LIVE ACTIVADO**\n\nEl bot operará con DINERO REAL de Binance.');
                    break;

                case '/paper':
                    this.liveTrading = false;
                    this.paperTrading = true;
                    await this.saveTradingMode();
                    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) this.connectWebSocket();
                    await notifications.send('📝 **MODO PAPER ACTIVADO**\n\nEl bot operará en simulación.');
                    break;

                case '/help':
                    let help = `🕹️ **Comandos de Control:**\n\n`;
                    help += `/test   - Probar si el bot responde.\n`;
                    help += `/status - Ver indicadores, precio y balance.\n`;
                    help += `/chart  - Ver gráfico de rendimiento.\n`;
                    help += `/start  - Reactivar tras un /stop.\n`;
                    help += `/live   - Pasar a DINERO REAL.\n`;
                    help += `/paper  - Pasar a SIMULACIÓN.\n`;
                    help += `/stop   - PARADA DE EMERGENCIA.\n`;
                    help += `/help   - Ver esta lista.`;
                    await notifications.send(help);
                    break;

                default:
                    await notifications.send('❓ Comando no reconocido. Escribe /help para ver las opciones.');
            }
        });

        notifications.startPolling();
    }
}

// Start the bot
if (require.main === module) {
    const bot = new LiveTrader();
    bot.start();
}

module.exports = LiveTrader;
