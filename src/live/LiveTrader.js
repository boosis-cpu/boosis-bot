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

        logger.info(`Initializing Boosis Live Trader [Symbol: ${CONFIG.symbol}, Strategy: ${this.strategy.name}]`);
        this.setupServer();
    }

    setupServer() {
        this.app.use(cors()); // Enable CORS for local development
        this.app.use(express.json());

        // Middleware protector
        const authMiddleware = (req, res, next) => {
            // Permitir login sin token
            if (req.url === '/api/login' || req.originalUrl === '/api/login') {
                return next();
            }

            const authHeader = req.headers.authorization || '';
            const token = authHeader.replace('Bearer ', '');

            if (!auth.verifyToken(token)) {
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
        this.app.post('/api/login', (req, res) => {
            const { password } = req.body;
            const token = auth.generateToken(password);

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
                const candles = this.candles.slice(-limit).map(c => ({
                    open_time: c[0],
                    open: c[1],
                    high: c[2],
                    low: c[3],
                    close: c[4],
                    volume: c[5],
                    close_time: c[6]
                }));
                res.json(candles);
            } catch (error) {
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
            const savedBalance = await db.getBotState('balance');
            if (savedBalance) {
                this.balance = savedBalance;
                logger.info(`Loaded balance from DB: ${JSON.stringify(this.balance)}`);
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
            const dbCandles = await db.getRecentCandles(CONFIG.symbol, 200);

            if (dbCandles.length >= 100) {
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
                    limit: 200
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

            // Persist balance
            db.setBotState('balance', this.balance).catch(err => logger.error(`Error saving balance: ${err.message}`));

            const trade = {
                symbol: CONFIG.symbol,
                side: 'BUY',
                price: price,
                amount: amountAsset,
                timestamp: timestamp,
                type: 'PAPER'
            };
            this.trades.push(trade);
            db.saveTrade(trade).catch(err => logger.error(`DB Trade Error: ${err.message}`));

            logger.success(`[PAPER TRADE] BOUGHT ${amountAsset.toFixed(6)} BTC @ ${price}. Portfolio Value: ~$${(amountAsset * price).toFixed(2)}`);
        } else if (signal.action === 'SELL' && this.balance.asset > 0.0001) {
            const amountAsset = this.balance.asset;
            const amountUsd = (amountAsset * price) * (1 - fee);
            this.balance.usdt += amountUsd;
            this.balance.asset = 0;

            // Persist balance
            db.setBotState('balance', this.balance).catch(err => logger.error(`Error saving balance: ${err.message}`));

            const trade = {
                symbol: CONFIG.symbol,
                side: 'SELL',
                price: price,
                amount: amountAsset,
                timestamp: timestamp,
                type: 'PAPER'
            };
            this.trades.push(trade);
            db.saveTrade(trade).catch(err => logger.error(`DB Trade Error: ${err.message}`));

            logger.success(`[PAPER TRADE] SOLD ${amountAsset.toFixed(6)} BTC @ ${price}. New Balance: $${this.balance.usdt.toFixed(2)}`);
        }
    }
}

// Start the bot
if (require.main === module) {
    const bot = new LiveTrader();
    bot.start();
}

module.exports = LiveTrader;
