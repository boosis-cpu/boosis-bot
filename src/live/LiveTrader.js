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

        // Trading State
        this.liveTrading = process.env.LIVE_TRADING === 'true'; // Controlled by ENV
        this.paperTrading = !this.liveTrading; // Default to paper if live is false

        this.balance = {
            usdt: 1000,
            asset: 0
        };

        // Real Balance (cached)
        this.realBalance = [];
        this.equityHistory = [];

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

        // Endpoint to toggle trading mode (protected)
        this.app.post('/api/settings/trading-mode', authMiddleware, async (req, res) => {
            const { live } = req.body;

            // Update runtime state
            this.liveTrading = live;
            this.paperTrading = !live;

            // In a real app, you might also update .env file or DB here
            // For now, runtime switch is enough for the session

            logger.warn(`TRADING MODE CHANGED: ${live ? 'LIVE (REAL MONEY)' : 'PAPER (SIMULATION)'}`);

            res.json({
                success: true,
                mode: live ? 'LIVE' : 'PAPER',
                message: `Bot switched to ${live ? 'LIVE' : 'PAPER'} trading mode.`
            });
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
                equityHistory: this.equityHistory.slice(-50),
                marketStatus: this.calculateMarketHealth()
            });
        });

        this.app.get('/api/health', (req, res) => {
            const health = {
                status: 'ACTIVE',
                uptime: process.uptime(),
                bot: {
                    wsConnected: this.ws && this.ws.readyState === WebSocket.OPEN,
                    candlesCount: this.candles.length,
                    lastCandleTime: this.candles.length > 0 ? this.candles[this.candles.length - 1][6] : null
                },
                latency: {
                    apiLatency: 45, // Placeholder or calculate real
                    wsLatency: 28   // Placeholder
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
                const rsi = TechnicalIndicators.calculateRSI(historyPrices, 14);
                const sma200 = TechnicalIndicators.calculateSMA(historyPrices, 200);
                const bb = TechnicalIndicators.calculateBollingerBands(historyPrices, 20, 2);

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
            // Start Web Server
            this.app.listen(CONFIG.port, () => {
                logger.success(`Web server listening on port ${CONFIG.port}`);
            });

            // Initialize Database
            await db.connect();
            await db.initSchema();

            // 1. Initial Data Load (Bootstrap)
            await this.loadHistoricalData();

            // 2. Fetch Initial Balance (Real)
            this.fetchRealBalance();
            setInterval(() => this.fetchRealBalance(), 60000); // Refresh every minute

            // 3. Connect to WebSocket
            this.connectWebSocket();
        } catch (err) {
            logger.error(`Fatal error starting bot: ${err.message}`);
        }
    }

    async fetchRealBalance() {
        try {
            const balances = await binanceService.getAccountBalance();
            this.realBalance = balances;
        } catch (error) {
            logger.error(`Error obteniendo balance de Binance: ${error.message}`);
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
            logger.warn('WebSocket connection closed. Reconnecting in 5s...');
            setTimeout(() => this.connectWebSocket(), 5000);
        });

        this.ws.on('error', (err) => {
            logger.error(`WebSocket Error: ${err.message}`);
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
            this.executePaperTrade(signal);
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

    executePaperTrade(signal) {
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

            logger.success(`[PAPER TRADE] BOUGHT ${amountAsset.toFixed(6)} BTC @ ${price}. Portfolio Value: ~$${(amountAsset * price).toFixed(2)}`);
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

            logger.success(`[PAPER TRADE] SOLD ${amountAsset.toFixed(6)} BTC @ ${price}. New Balance: $${this.balance.usdt.toFixed(2)}`);
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
}

// Start the bot
if (require.main === module) {
    const bot = new LiveTrader();
    bot.start();
}

module.exports = LiveTrader;
