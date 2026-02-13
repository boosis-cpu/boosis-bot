
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

    async fetchKlines(symbol, interval, limit = 500) {
        try {
            const url = `${this.baseUrl}/klines`;
            const params = { symbol, interval, limit };

            logger.info(`Fetching ${limit} klines for ${symbol} (${interval})...`);

            const response = await axios.get(url, { params });
            const data = response.data;

            if (!data || !Array.isArray(data)) {
                throw new Error('Invalid data format received from Binance');
            }

            logger.success(`Successfully fetched ${data.length} records.`);
            return data; // Raw data: [openTime, open, high, low, close, volume, ...]
        } catch (error) {
            logger.error(`Failed to fetch klines: ${error.message}`);
            return null;
        }
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
        const data = await this.fetchKlines(symbol, interval, limit);
        if (data) {
            return await this.saveToFile(symbol, interval, data);
        }
        return null;
    }
}

module.exports = new DataMiner();
