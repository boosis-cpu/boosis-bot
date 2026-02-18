require('dotenv').config();
const db = require('./src/core/database');
const logger = require('./src/core/logger');

async function migrate() {
    await db.init();
    try {
        logger.info('Migrating candles table...');
        // Add timeframe column if it doesn't exist
        await db.pool.query(`
            ALTER TABLE candles 
            ADD COLUMN IF NOT EXISTS timeframe VARCHAR(10) NOT NULL DEFAULT '1m';
        `);

        // Update UNIQUE constraint
        // First, drop old one if it exists. Postman UNIQUE constraint names vary, usually symbol_open_time_key or candles_symbol_open_time_key
        try {
            await db.pool.query('ALTER TABLE candles DROP CONSTRAINT IF EXISTS candles_symbol_open_time_key');
            await db.pool.query('ALTER TABLE candles DROP CONSTRAINT IF EXISTS candles_symbol_open_time_timeframe_key'); // Just in case
        } catch (e) { }

        await db.pool.query(`
            ALTER TABLE candles 
            ADD CONSTRAINT candles_symbol_open_time_timeframe_key UNIQUE (symbol, open_time, timeframe);
        `);

        logger.info('Migration successful');
    } catch (e) {
        logger.error('Migration failed:', e);
    } finally {
        process.exit();
    }
}

migrate();
