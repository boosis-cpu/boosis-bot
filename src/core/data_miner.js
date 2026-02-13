
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const config = require('./config');
const logger = require('./logger');

class DataMiner {
    constructor() {
        this.baseUrl = config.BINANCE.REST_API_URL;
        this.dataDir = config.SYSTEM.DATA_DIR;
    }

    async fetchKlines(symbol, interval, limit = 500, startTime = null) {
        try {
            const url = `${this.baseUrl}/klines`;
            const params = { symbol, interval, limit };
            if (startTime) params.startTime = startTime;

            const response = await axios.get(url, { params });
            return response.data;
        } catch (error) {
            logger.error(`Failed to fetch klines: ${error.message}`);
            return null;
        }
    }

    async fetchLongHistory(symbol, interval, totalLimit = 5000) {
        let allData = [];
        const chunkLimit = 1000;

        // Calculate approx interval in ms
        const intervalMsMap = {
            '1m': 60000, '3m': 180000, '5m': 300000, '15m': 900000,
            '30m': 1800000, '1h': 3600000, '4h': 14400000, '1d': 86400000
        };
        const intervalMs = intervalMsMap[interval] || 300000;

        // Start from (Now - Total Duration)
        let lastTimestamp = Date.now() - (totalLimit * intervalMs);

        logger.info(`Starting MASSIVE harvest for ${symbol} (${interval}). Target: ${totalLimit} records.`);
        logger.info(`Fetching from: ${new Date(lastTimestamp).toLocaleString()}`);

        while (allData.length < totalLimit) {
            const remaining = totalLimit - allData.length;
            const currentLimit = Math.min(remaining, chunkLimit);

            const data = await this.fetchKlines(symbol, interval, currentLimit, lastTimestamp);

            if (!data || data.length === 0) break;

            allData = allData.concat(data);
            // Next start time is the end of the last record + 1ms
            lastTimestamp = data[data.length - 1][0] + 1;

            logger.info(`Progress: ${allData.length}/${totalLimit} records fetched...`);

            if (allData.length < totalLimit) {
                await new Promise(r => setTimeout(r, 200)); // Rate limit protection
            }
        }

        logger.success(`Finished harvest: ${allData.length} records retrieved.`);
        return allData;
    }

    async saveToFile(symbol, interval, data) {
        if (!data || data.length === 0) return;

        const filename = `${symbol}_${interval}.json`;
        const filePath = path.join(this.dataDir, filename);

        try {
            // Ensure directory exists
            if (!fs.existsSync(this.dataDir)) {
                fs.mkdirSync(this.dataDir, { recursive: true });
            }

            fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
            logger.success(`Data saved to ${filePath}`);
            return filePath;
        } catch (error) {
            logger.error(`Failed to save data: ${error.message}`);
        }
    }

    // Helper to fetch AND save in one go
    async harvest(symbol, interval, limit) {
        const data = limit > 1000
            ? await this.fetchLongHistory(symbol, interval, limit)
            : await this.fetchKlines(symbol, interval, limit);

        if (data) {
            return await this.saveToFile(symbol, interval, data);
        }
        return null;
    }
}

module.exports = new DataMiner();
