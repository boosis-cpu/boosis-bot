const { Pool } = require('pg');
const logger = require('./logger');

const pool = new Pool({
    user: process.env.DB_USER,
    host: process.env.DB_HOST,
    database: process.env.DB_NAME,
    password: process.env.DB_PASS,
    port: 5432,
});

async function connect() {
    try {
        const client = await pool.connect();
        logger.success('Database connected successfully');
        client.release();
        return true;
    } catch (err) {
        logger.error(`Database connection failed: ${err.message}`);
        return false;
    }
}

async function initSchema() {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        // Create candles table
        await client.query(`
            CREATE TABLE IF NOT EXISTS candles (
                id SERIAL PRIMARY KEY,
                symbol VARCHAR(20) NOT NULL,
                interval VARCHAR(10) NOT NULL,
                open_time BIGINT NOT NULL,
                close_time BIGINT NOT NULL,
                open NUMERIC NOT NULL,
                high NUMERIC NOT NULL,
                low NUMERIC NOT NULL,
                close NUMERIC NOT NULL,
                volume NUMERIC NOT NULL,
                UNIQUE(symbol, interval, open_time)
            );
        `);

        // Create trades table
        await client.query(`
            CREATE TABLE IF NOT EXISTS trades (
                id SERIAL PRIMARY KEY,
                symbol VARCHAR(20) NOT NULL,
                strategy VARCHAR(50) NOT NULL,
                side VARCHAR(10) NOT NULL,
                price NUMERIC NOT NULL,
                amount NUMERIC NOT NULL,
                timestamp BIGINT NOT NULL,
                is_paper BOOLEAN DEFAULT FALSE
            );
        `);

        await client.query('COMMIT');
        logger.success('Database schema initialized');
    } catch (err) {
        await client.query('ROLLBACK');
        logger.error(`Failed to initialize schema: ${err.message}`);
        throw err;
    } finally {
        client.release();
    }
}

async function saveCandle(candleData) {
    const { symbol, interval, openTime, closeTime, open, high, low, close, volume } = candleData;
    try {
        await pool.query(
            `INSERT INTO candles (symbol, interval, open_time, close_time, open, high, low, close, volume)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
             ON CONFLICT (symbol, interval, open_time) DO NOTHING`,
            [symbol, interval, openTime, closeTime, open, high, low, close, volume]
        );
    } catch (err) {
        logger.error(`Error saving candle: ${err.message}`);
    }
}

async function saveTrade(tradeData) {
    const { symbol, strategy, side, price, amount, timestamp, isPaper } = tradeData;
    try {
        await pool.query(
            `INSERT INTO trades (symbol, strategy, side, price, amount, timestamp, is_paper)
             VALUES ($1, $2, $3, $4, $5, $6, $7)`,
            [symbol, strategy, side, price, amount, timestamp, isPaper]
        );
        logger.success(`Trade saved to DB: ${side} ${symbol} @ ${price}`);
    } catch (err) {
        logger.error(`Error saving trade: ${err.message}`);
    }
}

module.exports = {
    pool,
    connect,
    initSchema,
    saveCandle,
    saveTrade
};
