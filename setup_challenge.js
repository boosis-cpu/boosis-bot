require('dotenv').config();
const db = require('./src/core/database');

async function setChallengeBalance() {
    try {
        console.log('--- CONFIGURANDO EL CHALLENGE: 2,000 MXN (Simulados) ---');
        const newState = { usdt: 2000, asset: 0 };

        // 1. Actualizar bot_state (Usado por algunos módulos)
        await db.setBotState('balance', newState);

        // 2. Actualizar trading_settings (Usado por LiveTrader.js)
        await db.pool.query(
            'INSERT INTO trading_settings (key, value) VALUES ($1, $2) ON CONFLICT (key) DO UPDATE SET value = $2',
            ['paper_balance', JSON.stringify(newState)]
        );

        console.log('✅ Balance de Paper Trading actualizado en ambas tablas.');
        console.log('🚀 Objetivo: Llegar a 4,000 unidades operando con estrategia Sniper.');
        process.exit(0);
    } catch (error) {
        console.error('❌ Error configurando el balance:', error);
        process.exit(1);
    }
}

setChallengeBalance();
