require('dotenv').config();
const WebSocket = require('ws');
const axios = require('axios');
const path = require('path');
const express = require('express');
const cors = require('cors');
const logger = require('../core/logger');
const BoosisTrend = require('../strategies/BoosisTrend');
const auth = require('../core/auth');
const validators = require('../core/validators');
const db = require('../core/database');
const TechnicalIndicators = require('../core/technical_indicators');
const notifications = require('../core/notifications');
const HealthChecker = require('../core/health');
const backup = require('../../backup_db');
const binanceService = require('../core/binance_service');

// Configuration
const CONFIG = {
    symbol: 'BTCUSDT',
    interval: '5m',
    wsUrl: `wss://stream.binance.us:9443/ws/btcusdt@kline_5m`,
    apiUrl: 'https://api.binance.us/api/v3',
    port: 3000
};

class LiveTrader {
    constructor() {
        this.strategy = new BoosisTrend();
        this.candles = [];
        this.trades = []; // Store trades in memory for the dashboard
        this.ws = null;
        this.app = express();

        // Simulation mode for now (Paper Trading)
        this.paperTrading = true;
        this.balance = {
            usdt: 1000,
            asset: 0
        };
        this.lastBuyPrice = 0;
        this.health = new HealthChecker(this);
        this.lastMessageTime = Date.now();
        this.sosSent = false;
        this.equityHistory = []; // Track capital growth
        this.liveTrading = process.env.LIVE_TRADING === 'true';
        this.realBalance = [];
        this.metrics = {
            apiLatency: 0,
            wsLatency: 0
        };

        logger.info(`Initializing Boosis Live Trader [Symbol: ${CONFIG.symbol}, Strategy: ${this.strategy.name}]`);
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
            const token = authHeader.replace('Bearer ', '');

            if (!(await auth.verifyToken(token))) {
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

        // ENDPOINTS PROTEGIDOS
        this.app.get('/api/status', authMiddleware, (req, res) => {
            res.json({
                status: 'online',
                bot: 'Boosis Quant Bot',
                strategy: this.strategy.name,
                symbol: CONFIG.symbol,
                paperTrading: !this.liveTrading,
                balance: this.balance,
                realBalance: this.realBalance,
                equityHistory: this.equityHistory.slice(-50)
            });
        });

        this.app.get('/api/candles', authMiddleware, (req, res) => {
            try {
                const limit = validators.validateLimit(req.query.limit || 100);

                const candles = this.candles.slice(-limit).map((c, idx) => {
                    const relativeIdx = this.candles.length - limit + idx;
                    const historySlice = this.candles.slice(0, relativeIdx + 1);
                    const slicePrices = historySlice.map(h => h[4]);

                    return {
                        open_time: c[0],
                        open: c[1],
                        high: c[2],
                        low: c[3],
                        close: c[4],
                        volume: c[5],
                        close_time: c[6],
                        indicators: {
                            rsi: TechnicalIndicators.calculateRSI(slicePrices, 14),
                            sma200: TechnicalIndicators.calculateSMA(slicePrices, 200),
                            bb: TechnicalIndicators.calculateBollingerBands(slicePrices, 20)
                        }
                    };
                });
                res.json(candles);
            } catch (error) {
                logger.error(`API Candles Error: ${error.message}`);
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

        this.app.get('/api/health', authMiddleware, (req, res) => {
            const health = this.health.getStatus();
            res.json({
                ...health,
                latency: this.metrics
            });
        });

        this.app.get('/api/metrics', authMiddleware, (req, res) => {
            const trades = this.trades;
            if (trades.length === 0) {
                return res.json({ profitFactor: 0, winRate: 0, totalTrades: 0 });
            }

            let grossProfit = 0;
            let grossLoss = 0;
            let wins = 0;

            for (let i = 1; i < trades.length; i++) {
                if (trades[i].side === 'SELL' && trades[i - 1].side === 'BUY') {
                    const profit = (trades[i].price - trades[i - 1].price) * trades[i - 1].amount;
                    if (profit > 0) {
                        grossProfit += profit;
                        wins++;
                    } else {
                        grossLoss += Math.abs(profit);
                    }
                }
            }

            const tradePairs = Math.floor(trades.length / 2);
            const winRate = tradePairs > 0 ? ((wins / tradePairs) * 100).toFixed(2) : 0;
            const profitFactor = grossLoss === 0 ? grossProfit : (grossProfit / grossLoss).toFixed(2);

            res.json({
                profitFactor,
                winRate: winRate + '%',
                totalTrades: trades.length,
                grossProfit: grossProfit.toFixed(2),
                grossLoss: grossLoss.toFixed(2)
            });
        });

        this.app.get('/', (req, res) => {
            res.sendFile(path.join(__dirname, '../../public', 'index.html'));
        });
    }

    async start() {
        try {
            await db.init();
            this.app.listen(CONFIG.port, () => {
                logger.success(`Web server listening on port ${CONFIG.port}`);
            });

            await this.loadHistoricalData();
            this.trades = await db.getRecentTrades(50);

            const savedState = await db.getBotState('balance');
            if (savedState) this.balance = savedState;

            const savedPrice = await db.getBotState('lastBuyPrice');
            if (savedPrice) this.lastBuyPrice = parseFloat(savedPrice);

            if (this.candles.length > 0) {
                this.recordEquitySnapshot(this.candles[this.candles.length - 1][4]);
            }

            this.connectWebSocket();

            // 5. Fetch Real Balance
            await this.fetchRealBalance();

            // 6. Schedule Backups and Balance Sync
            setInterval(() => backup(), 24 * 60 * 60 * 1000);
            setInterval(() => this.fetchRealBalance(), 60000); // Sync balance every minute
        } catch (err) {
            logger.error(`Fatal error starting bot: ${err.message}`);
        }
    }

    async loadHistoricalData() {
        logger.info('Fetching historical data...');
        try {
            const dbCandles = await db.getRecentCandles(CONFIG.symbol, 500);
            if (dbCandles.length >= 400) {
                this.candles = dbCandles;
                logger.success(`Loaded ${this.candles.length} historical candles from Database.`);
                return;
            }

            const response = await axios.get(`${CONFIG.apiUrl}/klines`, {
                params: { symbol: CONFIG.symbol, interval: '5m', limit: 500 }
            });

            this.candles = response.data.map(k => [
                k[0], parseFloat(k[1]), parseFloat(k[2]), parseFloat(k[3]), parseFloat(k[4]), parseFloat(k[5]), k[6]
            ]);

            for (const candle of this.candles) {
                await db.saveCandle(CONFIG.symbol, candle);
            }
            logger.success(`Loaded ${this.candles.length} historical candles from API.`);
        } catch (error) {
            logger.error(`Failed to load historical data: ${error.message}`);
        }
    }

    connectWebSocket() {
        this.ws = new WebSocket(CONFIG.wsUrl);
        let heartbeatInterval;

        this.ws.on('open', () => {
            logger.success('Connected to Binance WebSocket.');
            notifications.notifyAlert('Conectado a Binance WebSocket. Monitoreo Activo. 🚀');

            heartbeatInterval = setInterval(() => {
                if (this.ws.readyState === WebSocket.OPEN) {
                    this.metrics.pingStart = Date.now();
                    this.ws.ping();
                }
            }, 30000);

            setInterval(() => {
                const inactiveTime = (Date.now() - this.lastMessageTime) / 1000;
                if (inactiveTime > 120 && !this.sosSent) {
                    logger.error(`WATCHDOG: No data received for ${inactiveTime.toFixed(0)}s! Sending SOS.`);
                    notifications.notifyAlert(`🚨 SOS: El bot no ha recibido datos en 2 minutos.`);
                    this.sosSent = true;
                }
            }, 60000);
        });

        this.ws.on('pong', () => {
            this.lastMessageTime = Date.now();
            this.metrics.wsLatency = Date.now() - this.metrics.pingStart;
        });

        this.ws.on('message', (data) => {
            try {
                const message = JSON.parse(data);
                this.lastMessageTime = Date.now();
                if (this.sosSent) {
                    this.sosSent = false;
                    notifications.notifyAlert(`✅ SOS RESUELTO: Recibiendo datos nuevamente.`);
                }
                if (message.e === 'kline') this.handleKlineMessage(message.k);
            } catch (err) {
                logger.error(`WS Error: ${err.message}`);
            }
        });

        this.ws.on('close', () => {
            clearInterval(heartbeatInterval);
            logger.warn('WebSocket closed. Reconnecting...');
            setTimeout(() => this.connectWebSocket(), 5000);
        });

        this.ws.on('error', (err) => {
            logger.error(`WebSocket Error: ${err.message}`);
            clearInterval(heartbeatInterval);
        });
    }

    async handleKlineMessage(kline) {
        if (kline.x) {
            const candle = [
                kline.t, parseFloat(kline.o), parseFloat(kline.h), parseFloat(kline.l), parseFloat(kline.c), parseFloat(kline.v), kline.T
            ];
            this.candles.push(candle);
            if (this.candles.length > 500) this.candles.shift();

            db.saveCandle(CONFIG.symbol, candle).catch(e => logger.error(`DB Save Error: ${e.message}`));

            logger.info(`Candle closed: ${candle[4]}`);
            const inPosition = this.balance.asset > 0.0001;
            await this.executeStrategy(candle, inPosition);
            this.recordEquitySnapshot(candle[4]);
        }
    }

    async executeStrategy(latestCandle, inPosition) {
        const signal = this.strategy.onCandle(latestCandle, this.candles, inPosition, this.lastBuyPrice);
        if (signal) {
            logger.info(`SIGNAL: ${signal.action} @ ${signal.price}`);
            await this.executeTrade(signal);
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
            stone
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
        const fee = 0.001;
        const price = signal.price;
        const timestamp = Date.now();

        if (signal.action === 'BUY' && this.balance.usdt > 10) {
            const amountAsset = (this.balance.usdt / price) * (1 - fee);
            this.balance.asset = amountAsset;
            this.balance.usdt = 0;
            this.lastBuyPrice = price;

            await db.setBotState('balance', this.balance);
            await db.setBotState('lastBuyPrice', this.lastBuyPrice);

            const trade = { symbol: CONFIG.symbol, side: 'BUY', price, amount: amountAsset, timestamp, type: 'PAPER', reason: signal.reason };
            this.trades.push(trade);
            await db.saveTrade(trade);

            logger.success(`[PAPER] BOUGHT @ ${price}`);
            notifications.notifyTrade({ ...trade, balanceUsdt: this.balance.usdt, balanceAsset: this.balance.asset });
        } else if (signal.action === 'SELL' && this.balance.asset > 0.0001) {
            const amountUsd = (this.balance.asset * price) * (1 - fee);
            this.balance.usdt = amountUsd;
            this.balance.asset = 0;
            this.lastBuyPrice = 0;

            await db.setBotState('balance', this.balance);
            await db.setBotState('lastBuyPrice', 0);

            const trade = { symbol: CONFIG.symbol, side: 'SELL', price, amount: amountUsd, timestamp, type: 'PAPER', reason: signal.reason };
            this.trades.push(trade);
            await db.saveTrade(trade);

            logger.success(`[PAPER] SOLD @ ${price}`);
            notifications.notifyTrade({ ...trade, balanceUsdt: this.balance.usdt, balanceAsset: this.balance.asset });
        }

        // Persist initial state if it's the first time
        db.setBotState('balance', this.balance).catch(() => { });
    }

    recordEquitySnapshot(currentPrice) {
        const totalValue = this.balance.usdt + (this.balance.asset * currentPrice);
        this.equityHistory.push({
            time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            value: parseFloat(totalValue.toFixed(2))
        });
        if (this.equityHistory.length > 100) this.equityHistory.shift();
    }

    async fetchRealBalance() {
        try {
            const start = Date.now();
            const balances = await binanceService.getAccountBalance();
            this.metrics.apiLatency = Date.now() - start;

            if (balances) {
                this.realBalance = balances;
                logger.info('Balance real de Binance sincronizado.');
            }
        } catch (error) {
            logger.error(`Error sincronizando balance real: ${error.message}`);
        }
    }
}

if (require.main === module) {
    const bot = new LiveTrader();
    bot.start();
}

module.exports = LiveTrader;
