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
                paperTrading: this.paperTrading,
                balance: this.balance
            });
        });

        this.app.get('/api/candles', authMiddleware, (req, res) => {
            try {
                const limit = validators.validateLimit(req.query.limit || 100);
                const prices = this.candles.map(c => c[4]);

                // Calculate indicators for the full history to ensure accuracy
                const rsiValues = [];
                const smaValues = [];
                const bbValues = [];

                // We use the professional TI library via our wrapper

                // This is a bit heavy for a GET, ideally we'd cache these.
                // For now, let's just send the last N candles with their indicators.
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
            res.json(this.health.getStatus());
        });

        this.app.get('/api/metrics', authMiddleware, (req, res) => {
            const trades = this.trades;
            if (trades.length === 0) {
                return res.json({ profitFactor: 0, winRate: 0, totalTrades: 0 });
            }

            let grossProfit = 0;
            let grossLoss = 0;
            let wins = 0;

            // Simplified metric calculation from paper trades
            // In a real system, we'd compare sequential BUY/SELL pairs
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

            const winRate = ((wins / (trades.length / 2)) * 100).toFixed(2);
            const profitFactor = grossLoss === 0 ? grossProfit : (grossProfit / grossLoss).toFixed(2);

            res.json({
                profitFactor,
                winRate: winRate + '%',
                totalTrades: trades.length,
                grossProfit: grossProfit.toFixed(2),
                grossLoss: grossLoss.toFixed(2)
            });
        });

        // Serve React App for root
        this.app.get('/', (req, res) => {
            res.sendFile(path.join(__dirname, '../../public', 'index.html'));
        });
    }

    async start() {
        try {
            // 1. Initialize Database
            await db.init();

            // 2. Start Web Server
            this.app.listen(CONFIG.port, () => {
                logger.success(`Web server listening on port ${CONFIG.port}`);
            });

            // 3. Initial Data Load (Bootstrap)
            await this.loadHistoricalData();
            this.trades = await db.getRecentTrades(50);
            const savedState = await db.getBotState('balance');
            if (savedState) {
                this.balance = savedState;
                logger.info(`Loaded balance from DB: ${JSON.stringify(this.balance)}`);
            }

            const savedPrice = await db.getBotState('lastBuyPrice');
            if (savedPrice) {
                this.lastBuyPrice = parseFloat(savedPrice);
                logger.info(`Loaded lastBuyPrice from DB: ${this.lastBuyPrice}`);
            }
            logger.info(`Loaded ${this.trades.length} historical trades from Database.`);

            // 4. Connect to WebSocket
            this.connectWebSocket();
        } catch (err) {
            logger.error(`Fatal error starting bot: ${err.message}`);
        }
    }

    async loadHistoricalData() {
        logger.info('Fetching historical data...');
        try {
            // First, try loading from DB
            const dbCandles = await db.getRecentCandles(CONFIG.symbol, 500);

            if (dbCandles.length >= 400) {
                this.candles = dbCandles;
                logger.success(`Loaded ${this.candles.length} historical candles from Database.`);
                return;
            }

            // If not enough in DB, fetch from API
            logger.info('Not enough data in DB. Fetching from Binance API...');
            const response = await axios.get(`${CONFIG.apiUrl}/klines`, {
                params: {
                    symbol: CONFIG.symbol,
                    interval: '5m',
                    limit: 500
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

            // Save fetched candles to DB for future starts
            for (const candle of this.candles) {
                await db.saveCandle(CONFIG.symbol, candle);
            }

            logger.success(`Loaded ${this.candles.length} historical candles from API and saved to DB.`);
        } catch (error) {
            logger.error(`Failed to load historical data: ${error.message}`);
            // Don't throw, try to continue with empty history
        }
    }

    connectWebSocket() {
        this.ws = new WebSocket(CONFIG.wsUrl);
        let heartbeatInterval;

        this.ws.on('open', () => {
            logger.success('Connected to Binance WebSocket.');
            notifications.notifyAlert('Conectado a Binance WebSocket. Monitoreo Activo. 🚀');

            // Start heartbeat
            heartbeatInterval = setInterval(() => {
                if (this.ws.readyState === WebSocket.OPEN) {
                    this.ws.ping();
                }
            }, 30000); // Every 30s
        });

        this.ws.on('pong', () => {
            // Receipt of pong confirms connection health
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
            logger.warn('WebSocket connection closed. Reconnecting in 5s...');
            clearInterval(heartbeatInterval);
            setTimeout(() => this.connectWebSocket(), 5000);
        });

        this.ws.on('error', (err) => {
            logger.error(`WebSocket Error: ${err.message}`);
            clearInterval(heartbeatInterval);
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

        // Only process strategy logic when candle closes to avoid repainting
        if (isCandleClosed) {
            // Add new candle to history and remove oldest
            this.candles.push(candle);
            if (this.candles.length > 500) this.candles.shift(); // Keep size manageable in memory

            // Persist closed candle to DB
            db.saveCandle(CONFIG.symbol, candle).catch(err => {
                logger.error(`Failed to persist candle to DB: ${err.message}`);
            });

            logger.info(`Candle closed: ${candle[4]} (Volume: ${candle[5]})`);
            const inPosition = this.balance.asset > 0.0001;
            this.executeStrategy(candle, inPosition);
        }
    }

    executeStrategy(latestCandle, inPosition) {
        const signal = this.strategy.onCandle(latestCandle, this.candles, inPosition, this.lastBuyPrice);

        if (signal) {
            logger.info(`SIGNAL DETECTED: ${signal.action} @ ${signal.price} | ${signal.reason}`);
            this.executeTrade(signal);
        }
    }

    executeTrade(signal) {
        if (this.paperTrading) {
            this.executePaperTrade(signal);
        } else {
            logger.warn('Real trading execution not implemented yet.');
        }
    }

    executePaperTrade(signal) {
        const fee = 0.001; // 0.1% fee
        const price = signal.price;
        const timestamp = Date.now();

        if (signal.action === 'BUY' && this.balance.usdt > 10) {
            const amountUsd = this.balance.usdt;
            const amountAsset = (amountUsd / price) * (1 - fee);
            this.balance.asset += amountAsset;
            this.balance.usdt = 0;
            this.lastBuyPrice = price;

            // Persist balance and price
            db.setBotState('balance', this.balance).catch(err => logger.error(`Error saving balance: ${err.message}`));
            db.setBotState('lastBuyPrice', this.lastBuyPrice).catch(err => logger.error(`Error saving lastBuyPrice: ${err.message}`));

            const trade = {
                symbol: CONFIG.symbol,
                side: 'BUY',
                price: price,
                amount: amountAsset,
                timestamp: timestamp,
                type: 'PAPER',
                reason: signal.reason
            };
            this.trades.push(trade);
            db.saveTrade(trade).catch(err => logger.error(`DB Trade Error: ${err.message}`));

            logger.success(`[PAPER TRADE] BOUGHT ${amountAsset.toFixed(6)} BTC @ ${price}. Portfolio Value: ~$${(amountAsset * price).toFixed(2)}`);

            notifications.notifyTrade({
                ...trade,
                balanceUsdt: this.balance.usdt,
                balanceAsset: this.balance.asset
            });
        } else if (signal.action === 'SELL' && this.balance.asset > 0.0001) {
            const amountAsset = this.balance.asset;
            const amountUsd = (amountAsset * price) * (1 - fee);
            this.balance.usdt += amountUsd;
            this.balance.asset = 0;
            this.lastBuyPrice = 0;

            // Persist balance and price
            db.setBotState('balance', this.balance).catch(err => logger.error(`Error saving balance: ${err.message}`));
            db.setBotState('lastBuyPrice', 0).catch(err => logger.error(`Error saving lastBuyPrice: ${err.message}`));

            const trade = {
                symbol: CONFIG.symbol,
                side: 'SELL',
                price: price,
                amount: amountAsset,
                timestamp: timestamp,
                type: 'PAPER',
                reason: signal.reason
            };
            this.trades.push(trade);
            db.saveTrade(trade).catch(err => logger.error(`DB Trade Error: ${err.message}`));

            logger.success(`[PAPER TRADE] SOLD ${amountAsset.toFixed(6)} BTC @ ${price}. New Balance: $${this.balance.usdt.toFixed(2)}`);

            notifications.notifyTrade({
                ...trade,
                balanceUsdt: this.balance.usdt,
                balanceAsset: this.balance.asset
            });
        }
    }
}

// Start the bot
if (require.main === module) {
    const bot = new LiveTrader();
    bot.start();
}

module.exports = LiveTrader;
