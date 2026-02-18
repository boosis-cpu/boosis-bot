require('dotenv').config();
const db = require('./src/core/database');

async function checkPairs() {
    try {
        const res = await db.pool.query('SELECT symbol, strategy_name FROM active_trading_pairs WHERE is_active = true');
        console.log('--- PARES ACTIVOS ---');
        console.table(res.rows);
        process.exit(0);
    } catch (error) {
        console.error(error);
        process.exit(1);
    }
}

checkPairs();
