require('dotenv').config();
const db = require('./src/core/database');

async function clearTradeHistory() {
    try {
        console.log('--- LIMPIANDO HISTORIAL DE TRADES (BASURA) ---');

        // 1. Limpiar tabla de trades para empezar de cero el reto
        await db.pool.query('TRUNCATE TABLE trades');

        // 2. También limpiar posiciones activas por seguridad
        await db.pool.query('TRUNCATE TABLE active_position');

        console.log('✅ Historial de trades y posiciones limpiado con éxito.');
        console.log('🚀 El Dashboard ahora debería mostrar la sección de Trades vacía.');
        process.exit(0);
    } catch (error) {
        console.error('❌ Error al limpiar el historial:', error);
        process.exit(1);
    }
}

clearTradeHistory();
