const { Pool } = require('pg');
require('dotenv').config();

async function checkDataRange() {
    const pool = new Pool({
        host: process.env.DB_HOST,
        user: process.env.DB_USER,
        password: process.env.DB_PASS,
        database: process.env.DB_NAME,
        port: parseInt(process.env.DB_PORT || '5432'),
    });

    try {
        const res = await pool.query(`
            SELECT 
                symbol, 
                MIN(open_time) as first_candle, 
                MAX(open_time) as last_candle, 
                COUNT(*) as total_candles
            FROM candles
            GROUP BY symbol
            ORDER BY total_candles DESC
        `);

        console.log('--- DATA AUDIT ---');
        res.rows.forEach(r => {
            const first = new Date(parseInt(r.first_candle)).toISOString();
            const last = new Date(parseInt(r.last_candle)).toISOString();
            console.log(`${r.symbol}: ${r.total_candles} candles | From: ${first} | To: ${last}`);
        });
    } catch (e) {
        console.error(e);
    } finally {
        await pool.end();
    }
}
checkDataRange();
