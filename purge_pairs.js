require('dotenv').config();
const { Pool } = require('pg');

async function purgeAndFix() {
    const pool = new Pool({
        host: process.env.DB_HOST,
        user: process.env.DB_USER,
        password: process.env.DB_PASS,
        database: process.env.DB_NAME,
        port: parseInt(process.env.DB_PORT || '5432'),
    });

    try {
        console.log('🧹 Limpiando base de datos de pares extra...');

        // 1. Desactivar absolutamente TODO
        await pool.query('UPDATE active_trading_pairs SET is_active = false');

        // 2. Activar SOLO las 4 potencias
        const targetPairs = ['BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'XRPUSDT'];
        for (const symbol of targetPairs) {
            await pool.query(`
                INSERT INTO active_trading_pairs (symbol, strategy_name, is_active)
                VALUES ($1, 'BoosisTrend', true)
                ON CONFLICT (symbol) DO UPDATE SET is_active = true
            `, [symbol]);
        }

        // 3. Re-confirmar el BLOQUEO de trading automático por seguridad
        await pool.query(`
            INSERT INTO bot_state (key, value) 
            VALUES ('trading_locked', 'true')
            ON CONFLICT (key) DO UPDATE SET value = 'true'
        `);

        console.log('✅ Radar ajustado: Solo BTC, ETH, SOL y XRP.');
        console.log('✅ Candado de Seguridad: RE-CONFIRMADO (No habrá trades automáticos).');

    } catch (e) {
        console.error('❌ Error:', e.message);
    } finally {
        await pool.end();
    }
}

purgeAndFix();
