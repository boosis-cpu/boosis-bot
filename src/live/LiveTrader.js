
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
const db = require('../core/database');
const notifications = require('../core/notifications');
const binanceService = require('../core/binance');
const TechnicalIndicators = require('../core/technical_indicators');
const HealthChecker = require('../core/health');

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
        this.balance = {
            usdt: 1000,
            asset: 0
        };
        this.realBalance = [];
        this.totalBalanceUSD = 0;
        this.equityHistory = [];
        this.emergencyStopped = false;
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

        this.app.post('/api/login', async (req, res) => {
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
            res.json({
                status: 'online',
                strategy: this.strategy.name,
                symbol: CONFIG.symbol,
                liveTrading: this.liveTrading,
                paperTrading: !this.liveTrading,
                balance: this.balance,
                realBalance: this.realBalance,
                totalBalanceUSD: this.totalBalanceUSD,
                emergencyStopped: this.emergencyStopped,
                activePosition: this.activePosition
            });
        });

        this.app.get('/api/health', (req, res) => {
            res.json(this.health.getStatus());
        });

        this.app.get('/api/candles', authMiddleware, (req, res) => {
            try {
                const limit = validators.validateLimit(req.query.limit || 100);
                const candles = this.candles.slice(-limit).map(c => ({
                    open_time: c[0], open: c[1], high: c[2], low: c[3], close: c[4], volume: c[5], close_time: c[6]
                }));
                res.json(candles);
            } catch (error) {
                res.status(400).json({ error: error.message });
            }
        });

        this.app.get('/api/trades', authMiddleware, async (req, res) => {
            const trades = await db.getRecentTrades(50);
            res.json(trades);
        });
    }

    async start() {
        try {
            logger.info('Starting Boosis Quant Bot...');
            await db.connect();
            await db.initSchema();

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

    async handleKlineMessage(kline) {
        if (kline.x) { // Candle closed
            const candle = [
                kline.t, parseFloat(kline.o), parseFloat(kline.h), parseFloat(kline.l), parseFloat(kline.c), parseFloat(kline.v), kline.T
            ];
            this.candles.push(candle);
            if (this.candles.length > 500) this.candles.shift();

            this.lastMessageTime = Date.now();
            this.sosSent = false;

            db.saveCandle(CONFIG.symbol, candle).catch(e => logger.error(`DB Save Error: ${e.message}`));

            logger.info(`Candle closed: ${candle[4]}`);
            const inPosition = this.activePosition !== null;
            await this.executeStrategy(candle, inPosition);
        }
    }

    async executeStrategy(latestCandle, inPosition) {
        const signal = this.strategy.onCandle(latestCandle, this.candles, inPosition, this.lastBuyPrice);
        if (signal) {
            logger.info(`SIGNAL: ${signal.action} @ ${signal.price} [Reason: ${signal.reason}]`);
            await this.executeTrade(signal);
        }
    }

    async executeTrade(signal) {
        if (this.liveTrading) {
            await this.executeRealTrade(signal);
        } else {
            await this.executePaperTrade(signal);
        }
    }

    async executePaperTrade(signal) {
        const fee = 0.001;
        if (signal.action === 'BUY') {
            const amount = (this.balance.usdt / signal.price) * (1 - fee);
            this.balance.asset = amount;
            this.balance.usdt = 0;
            this.lastBuyPrice = signal.price;
            this.activePosition = { symbol: CONFIG.symbol, side: 'BUY', entryPrice: signal.price, amount, isPaper: true, timestamp: Date.now() };
            await this.saveActivePosition(this.activePosition);
        } else {
            const usdtReceived = (this.balance.asset * signal.price) * (1 - fee);
            this.balance.usdt = usdtReceived;
            this.balance.asset = 0;
            this.activePosition = null;
            await this.clearActivePosition();
        }
        await this.savePaperBalance();
        db.saveTrade({ ...signal, symbol: CONFIG.symbol, type: 'PAPER', amount: this.activePosition?.amount || 0 });
        notifications.notifyTrade({ ...signal, symbol: CONFIG.symbol, type: 'PAPER', amount: 0 });
    }

    async executeRealTrade(signal) {
        logger.warn(`!!! EXECUTING REAL TRADE: ${signal.action} !!!`);
        // Implementation for real trades via binanceService.executeOrder...
    }

    connectWebSocket() {
        this.ws = new WebSocket(CONFIG.wsUrl);
        this.ws.on('open', () => logger.success('Connected to Binance WebSocket.'));
        this.ws.on('message', (data) => {
            const msg = JSON.parse(data);
            if (msg.e === 'kline') this.handleKlineMessage(msg.k);
        });
        this.ws.on('close', () => {
            logger.warn('WebSocket closed. Reconnecting...');
            setTimeout(() => this.connectWebSocket(), 5000);
        });
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

    async clearActivePosition() {
        await db.pool.query('DELETE FROM active_position WHERE symbol = $1', [CONFIG.symbol]);
        this.activePosition = null;
    }

    async loadHistoricalData() {
        // Simple fetch...
    }
}

module.exports = LiveTrader;
