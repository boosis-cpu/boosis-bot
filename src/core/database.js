const { Pool } = require('pg');

class DatabaseManager {
    constructor() {
        this.pool = new Pool({
            host: process.env.DB_HOST || 'localhost',
            user: process.env.DB_USER || 'boosis_admin',
            password: process.env.DB_PASS || 'boosis_secure_pass_2024',
            database: process.env.DB_NAME || 'boosis_db',
            port: parseInt(process.env.DB_PORT || '5432'),
            // SSL is usually needed for remote connections, but within Docker it's not strictly necessary
            // unless configured. For now we keep it simple since we're in the same network.
        });

        this.pool.on('error', (err) => {
            console.error('[DB] Unexpected error on idle client', err);
        });
    }

    async init() {
        const client = await this.pool.connect();
        try {
            console.log('[DB] Initializing database tables...');

            // 1. Candles Table
            await client.query(`
                CREATE TABLE IF NOT EXISTS candles (
                    symbol VARCHAR(20) NOT NULL,
                    open_time BIGINT NOT NULL,
                    open NUMERIC NOT NULL,
                    high NUMERIC NOT NULL,
                    low NUMERIC NOT NULL,
                    close NUMERIC NOT NULL,
                    volume NUMERIC NOT NULL,
                    close_time BIGINT NOT NULL,
                    PRIMARY KEY (symbol, open_time)
                );
            `);

            // 2. Trades Table
            await client.query(`
                CREATE TABLE IF NOT EXISTS trades (
                    id SERIAL PRIMARY KEY,
                    symbol VARCHAR(20) NOT NULL,
                    side VARCHAR(10) NOT NULL,
                    price NUMERIC NOT NULL,
                    amount NUMERIC NOT NULL,
                    timestamp BIGINT NOT NULL,
                    type VARCHAR(20) NOT NULL -- PAPER or LIVE
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

            console.log('[DB] Database ready.');
        } catch (err) {
            console.error('[DB] Error initializing database:', err);
            throw err;
        } finally {
            client.release();
        }
    }

    async saveCandle(symbol, candle) {
        const query = `
            INSERT INTO candles (symbol, open_time, open, high, low, close, volume, close_time)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
            ON CONFLICT (symbol, open_time) DO UPDATE SET
                open = EXCLUDED.open,
                high = EXCLUDED.high,
                low = EXCLUDED.low,
                close = EXCLUDED.close,
                volume = EXCLUDED.volume,
                close_time = EXCLUDED.close_time;
        `;
        const values = [symbol, ...candle];
        return this.pool.query(query, values);
    }

    async saveTrade(trade) {
        const query = `
            INSERT INTO trades (symbol, side, price, amount, timestamp, type)
            VALUES ($1, $2, $3, $4, $5, $6);
        `;
        const values = [
            trade.symbol,
            trade.side,
            trade.price,
            trade.amount,
            trade.timestamp,
            trade.type || 'PAPER'
        ];
        return this.pool.query(query, values);
    }

    async getRecentCandles(symbol, limit = 500) {
        const query = `
            SELECT open_time, open, high, low, close, volume, close_time
            FROM candles
            WHERE symbol = $1
            ORDER BY open_time DESC
            LIMIT $2;
        `;
        const res = await this.pool.query(query, [symbol, limit]);
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
