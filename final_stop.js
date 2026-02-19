const { Pool } = require('pg');
require('dotenv').config();

async function finalStop() {
    const pool = new Pool({
        host: process.env.DB_HOST,
        user: process.env.DB_USER,
        password: process.env.DB_PASS,
        database: process.env.DB_NAME,
        port: parseInt(process.env.DB_PORT || '5432'),
    });

    try {
        console.log('🛑 FORZANDO PARADA TOTAL...');
        // 1. Apagar TODOS
        await pool.query('UPDATE active_trading_pairs SET is_active = false');

        // 2. Limpiar todo rastro
        await pool.query('TRUNCATE TABLE trades RESTART IDENTITY');
        await pool.query('DELETE FROM active_position');

        // 3. Balance 200
        const initialBalance = { usdt: 200.00, asset: 0 };
        await pool.query("UPDATE bot_state SET value = $1 WHERE key = 'balance'", [JSON.stringify(initialBalance)]);
        await pool.query("UPDATE trading_settings SET value = $1 WHERE key = 'paper_balance'", [JSON.stringify(initialBalance)]);
        await pool.query("UPDATE trading_settings SET value = 'false' WHERE key = 'live_trading'");

        console.log('✅ Base de Datos purificada.');
    } catch (e) {
        console.error(e);
    } finally {
        await pool.end();
    }
}
finalStop();
