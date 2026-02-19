const { Pool } = require('pg');
require('dotenv').config();

async function checkPairs() {
    const pool = new Pool({
        host: process.env.DB_HOST,
        user: process.env.DB_USER,
        password: process.env.DB_PASS,
        database: process.env.DB_NAME,
        port: parseInt(process.env.DB_PORT || '5432'),
    });

    try {
        const res = await pool.query('SELECT symbol, is_active FROM active_trading_pairs');
        console.log('Pairs in DB:', res.rows);
    } catch (e) {
        console.error(e);
    } finally {
        await pool.end();
    }
}
checkPairs();
