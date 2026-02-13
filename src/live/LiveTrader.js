const WebSocket = require('ws');
const axios = require('axios');
const path = require('path');
const express = require('express');
const logger = require('../core/logger');
const BoosisTrend = require('../strategies/BoosisTrend');

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
        this.app.get('/', (req, res) => {
            res.json({
                status: 'online',
                bot: 'Boosis Quant Bot',
                strategy: this.strategy.name,
                symbol: CONFIG.symbol,
                paperTrading: this.paperTrading,
                balance: this.balance
            });
        });
    }

    async start() {
        try {
            // Start Web Server for Traefik
            this.app.listen(CONFIG.port, () => {
                logger.success(`Web server listening on port ${CONFIG.port}`);
            });

            // 1. Initial Data Load (Bootstrap)
            await this.loadHistoricalData();

            // 2. Connect to WebSocket
            this.connectWebSocket();
        } catch (err) {
            logger.error(`Fatal error starting bot: ${err.message}`);
        }
    }

    async loadHistoricalData() {
        logger.info('Fetching historical data to warm up indicators...');
        try {
            const response = await axios.get(`${CONFIG.apiUrl}/klines`, {
                params: {
                    symbol: CONFIG.symbol,
                    interval: '5m',
                    limit: 100 // Enough for our strategy windows
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
            if (this.candles.length > 200) this.candles.shift(); // Keep size manageable

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

        if (signal.action === 'BUY' && this.balance.usdt > 10) {
            const amountUsd = this.balance.usdt;
            const amountAsset = (amountUsd / price) * (1 - fee);
            this.balance.asset += amountAsset;
            this.balance.usdt = 0;
            logger.success(`[PAPER TRADE] BOUGHT ${amountAsset.toFixed(6)} BTC @ ${price}. Portfolio Value: ~$${(amountAsset * price).toFixed(2)}`);
        } else if (signal.action === 'SELL' && this.balance.asset > 0.0001) {
            const amountAsset = this.balance.asset;
            const amountUsd = (amountAsset * price) * (1 - fee);
            this.balance.usdt += amountUsd;
            this.balance.asset = 0;
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
