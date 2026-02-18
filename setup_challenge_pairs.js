require('dotenv').config();
const db = require('./src/core/database');

async function setupChallengePairs() {
    try {
        console.log('--- REINICIANDO PARES PARA EL CHALLENGE ---');

        // 1. Desactivar todos los pares actuales
        await db.pool.query('UPDATE active_trading_pairs SET is_active = false');

        // 2. Activar LINKUSDT para el challenge
        await db.pool.query(`
            INSERT INTO active_trading_pairs (symbol, strategy_name, is_active)
            VALUES ('LINKUSDT', 'BoosisTrend', true)
            ON CONFLICT (symbol) DO UPDATE SET is_active = true, strategy_name = 'BoosisTrend'
        `);

        console.log('✅ Pares purgados. LINKUSDT activo para el challenge.');
        process.exit(0);
    } catch (error) {
        console.error(error);
        process.exit(1);
    }
}

setupChallengePairs();
