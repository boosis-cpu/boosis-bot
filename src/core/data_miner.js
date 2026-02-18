const axios = require('axios');
const fs = require('fs');
const path = require('path');
const config = require('./config');
const logger = require('./logger');
const db = require('./database');

class DataMiner {
    constructor() {
        this.baseUrl = config.BINANCE.REST_API_URL || 'https://api.binance.com/api/v3';
        this.dataDir = config.SYSTEM.DATA_DIR;
        this.currentJob = {
            status: 'idle', // idle, mining, completed, error
            symbol: null,
            progress: 0,
            imported: 0,
            totalDays: 0,
            startTime: null,
            error: null
        };
    }

    getStatus() {
        return this.currentJob;
    }

    stopMining() {
        if (this.currentJob.status === 'mining') {
            this.currentJob.status = 'idle';
            this.currentJob.stopRequested = true;
            logger.warn(`[Miner] Stop signal received for ${this.currentJob.symbol}`);
        }
    }

    async mineToDatabase(symbol, interval, days) {
        if (this.currentJob.status === 'mining') {
            throw new Error('A mining job is already in progress');
        }

        this.currentJob = {
            status: 'mining',
            symbol,
            days,
            progress: 0,
            imported: 0,
            totalDays: days,
            startTime: Date.now(),
            error: null,
            stopRequested: false
        };

        logger.info(`[Miner] Starting job: ${symbol} for ${days} days`);

        try {
            await this._runMiningLoop(symbol, interval, days);
            if (this.currentJob.stopRequested) {
                this.currentJob.status = 'cancelled';
                logger.warn(`[Miner] Job cancelled: ${symbol}`);
            } else {
                this.currentJob.status = 'completed';
                this.currentJob.progress = 100;
                logger.success(`[Miner] Job completed: ${symbol}`);
            }
        } catch (error) {
            this.currentJob.status = 'error';
            this.currentJob.error = error.message;
            logger.error(`[Miner] Job failed: ${error.message}`);
        }
    }

    async _runMiningLoop(symbol, interval, days) {
        const intervalMsMap = {
            '1m': 60000, '3m': 180000, '5m': 300000, '15m': 900000,
            '30m': 1800000, '1h': 3600000
        };
        const intervalMs = intervalMsMap[interval] || 300000;

        const endTime = Date.now();
        const startTime = endTime - (days * 24 * 60 * 60 * 1000);
        let currentStartTime = startTime;

        // Estimation of total candles
        const estimatedTotal = Math.ceil((endTime - startTime) / intervalMs);
        let totalImported = 0;

        while (currentStartTime < endTime) {
            if (this.currentJob.stopRequested) break;

            const url = `${this.baseUrl}/klines`;
            const params = {
                symbol: symbol,
                interval: interval,
                startTime: currentStartTime,
                limit: 1000
            };

            const response = await axios.get(url, { params });
            const candles = response.data;

            if (!candles || candles.length === 0) break;

            // Batch Save to DB
            const candleArray = candles.map(k => [
                k[0], // open_time
                parseFloat(k[1]), // open
                parseFloat(k[2]), // high
                parseFloat(k[3]), // low
                parseFloat(k[4]), // close
                parseFloat(k[5]), // volume
                k[6]  // close_time
            ]);

            await db.saveCandlesBatch(symbol, candleArray);

            totalImported += candles.length;

            // Update Progress
            const progress = Math.min(Math.round((totalImported / estimatedTotal) * 100), 99);
            this.currentJob.progress = progress;
            this.currentJob.imported = totalImported;

            // Next batch
            currentStartTime = candles[candles.length - 1][6] + 1;

            // Rate Limit
            await new Promise(r => setTimeout(r, 100));
        }
    }

    // Legacy File methods (kept for compatibility)
    async fetchKlines(symbol, interval, limit = 500, startTime = null) {
        // ... implementation existing ...
        return [];
    }
}

module.exports = new DataMiner();
