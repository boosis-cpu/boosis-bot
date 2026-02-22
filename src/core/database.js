const { Pool } = require('pg');
const logger = require('./logger');

class DatabaseManager {
    constructor() {
        const requiredVars = ['DB_HOST', 'DB_USER', 'DB_PASS', 'DB_NAME'];
        const missing = requiredVars.filter(v => !process.env[v]);
        if (missing.length > 0) {
            throw new Error(`Missing required database environment variables: ${missing.join(', ')}`);
        }

        this.pool = new Pool({
            host: process.env.DB_HOST,
            user: process.env.DB_USER,
            password: process.env.DB_PASS,
            database: process.env.DB_NAME,
            port: parseInt(process.env.DB_PORT || '5432'),
        });

        this.pool.on('error', (err) => {
            logger.error('[DB] Unexpected error on idle client', err);
        });
    }

    async connect() {
        return this.pool.connect();
    }

    async init() {
        const client = await this.pool.connect();
        try {
            logger.info('[DB] Initializing database tables...');

            // 1. Candles Table
            await client.query(`
                CREATE TABLE IF NOT EXISTS candles (
                    id SERIAL PRIMARY KEY,
                    symbol VARCHAR(20) NOT NULL,
                    timeframe VARCHAR(10) NOT NULL DEFAULT '1m',
                    open_time BIGINT NOT NULL,
                    open NUMERIC NOT NULL,
                    high NUMERIC NOT NULL,
                    low NUMERIC NOT NULL,
                    close NUMERIC NOT NULL,
                    volume NUMERIC NOT NULL,
                    close_time BIGINT NOT NULL,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    UNIQUE(symbol, open_time, timeframe)
                );
            `);

            // Migración: agregar columna timeframe si no existe (DB antigua)
            await client.query(`
                ALTER TABLE candles ADD COLUMN IF NOT EXISTS timeframe VARCHAR(10) NOT NULL DEFAULT '1m';
            `);

            // Migración: crear índice único compuesto si no existe
            await client.query(`
                DO $$
                BEGIN
                    IF NOT EXISTS (
                        SELECT 1 FROM pg_constraint
                        WHERE conname = 'candles_symbol_open_time_timeframe_key'
                    ) THEN
                        ALTER TABLE candles DROP CONSTRAINT IF EXISTS candles_symbol_open_time_key;
                        ALTER TABLE candles ADD CONSTRAINT candles_symbol_open_time_timeframe_key 
                            UNIQUE (symbol, open_time, timeframe);
                    END IF;
                END $$;
            `);

            // 2. Trades Table
            await client.query(`
                CREATE TABLE IF NOT EXISTS trades (
                    id SERIAL PRIMARY KEY,
                    symbol VARCHAR(20) NOT NULL,
                    side VARCHAR(10) NOT NULL,
                    price DECIMAL(20,8) NOT NULL,
                    amount DECIMAL(20,8) NOT NULL,
                    timestamp BIGINT NOT NULL,
                    type VARCHAR(20) NOT NULL,
                    reason TEXT
                );
            `);

            // 3. Bot State Table (Balance, Config)
            await client.query(`
                CREATE TABLE IF NOT EXISTS bot_state (
                    key VARCHAR(50) PRIMARY KEY,
                    value JSONB NOT NULL
                );

                -- Initial balance if not exists
                INSERT INTO bot_state (key, value) 
                VALUES ('balance', '{"usdt": 1000, "asset": 0}'::jsonb)
                ON CONFLICT (key) DO NOTHING;
            `);

            // 4. Sessions Table
            await client.query(`
                CREATE TABLE IF NOT EXISTS sessions (
                    token TEXT PRIMARY KEY,
                    expiry BIGINT NOT NULL
                );
            `);

            // Cleanup expired sessions
            await client.query('DELETE FROM sessions WHERE expiry < $1', [Date.now()]);

            logger.info('[DB] Database ready.');
        } catch (err) {
            logger.error('[DB] Error initializing database:', err);
            throw err;
        } finally {
            client.release();
        }
    }

    async saveCandle(symbol, candle, timeframe = '1m') {
        const query = `
            INSERT INTO candles (symbol, timeframe, open_time, open, high, low, close, volume, close_time)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
            ON CONFLICT (symbol, open_time, timeframe) DO UPDATE SET
                open = EXCLUDED.open,
                high = EXCLUDED.high,
                low = EXCLUDED.low,
                close = EXCLUDED.close,
                volume = EXCLUDED.volume,
                close_time = EXCLUDED.close_time;
        `;
        const values = [symbol, timeframe, ...candle];
        return this.pool.query(query, values);
    }

    /**
     * Guarda múltiples velas de una sola vez (Batch Insert)
     * Altamente eficiente para backtesting y minería masiva.
     */
    async saveCandlesBatch(symbol, candles, timeframe = '1m') {
        if (!candles || candles.length === 0) return;

        const client = await this.pool.connect();
        try {
            await client.query('BEGIN');
            const query = `
                INSERT INTO candles (symbol, timeframe, open_time, open, high, low, close, volume, close_time)
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
                ON CONFLICT (symbol, open_time, timeframe) DO UPDATE SET
                    open = EXCLUDED.open,
                    high = EXCLUDED.high,
                    low = EXCLUDED.low,
                    close = EXCLUDED.close,
                    volume = EXCLUDED.volume,
                    close_time = EXCLUDED.close_time;
            `;

            for (const candle of candles) {
                await client.query(query, [symbol, timeframe, ...candle]);
            }
            await client.query('COMMIT');
        } catch (e) {
            await client.query('ROLLBACK');
            throw e;
        } finally {
            client.release();
        }
    }

    async saveTrade(trade) {
        const query = `
            INSERT INTO trades (symbol, side, price, amount, timestamp, type, reason)
            VALUES ($1, $2, $3, $4, $5, $6, $7);
        `;
        const values = [
            trade.symbol,
            trade.side,
            trade.price,
            trade.amount,
            trade.timestamp,
            trade.type || 'PAPER',
            trade.reason || null
        ];
        return this.pool.query(query, values);
    }

    async getRecentCandles(symbol, limit = 500, timeframe = '1m') {
        const query = `
            SELECT open_time, open, high, low, close, volume, close_time
            FROM candles
            WHERE symbol = $1 AND timeframe = $2
            ORDER BY open_time DESC
            LIMIT $3;
        `;
        const res = await this.pool.query(query, [symbol, timeframe, limit]);
        // Convert back to array format used by indicators
        return res.rows.reverse().map(r => [
            parseInt(r.open_time),
            parseFloat(r.open),
            parseFloat(r.high),
            parseFloat(r.low),
            parseFloat(r.close),
            parseFloat(r.volume),
            parseInt(r.close_time)
        ]);
    }

    async getRecentTrades(limit = 50) {
        const query = `
            SELECT * FROM trades
            ORDER BY timestamp DESC
            LIMIT $1;
        `;
        const res = await this.pool.query(query, [limit]);
        return res.rows;
    }

    async getBotState(key) {
        const res = await this.pool.query('SELECT value FROM bot_state WHERE key = $1', [key]);
        return res.rows.length ? res.rows[0].value : null;
    }

    async setBotState(key, value) {
        return this.pool.query(
            'INSERT INTO bot_state (key, value) VALUES ($1, $2) ON CONFLICT (key) DO UPDATE SET value = $2',
            [key, JSON.stringify(value)]
        );
    }
}

module.exports = new DatabaseManager();
