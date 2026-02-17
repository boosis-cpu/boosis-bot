const DataMiner = require('../src/core/data_miner');
const db = require('../src/core/database');
const logger = require('../src/core/logger');

async function mineAll() {
    try {
        logger.info('🚀 Iniciando inyección masiva de historial para Boosis Ant Army...');

        // Obtener pares activos de la base de datos
        const res = await db.pool.query('SELECT symbol FROM active_trading_pairs');
        const symbols = res.rows.map(r => r.symbol);

        if (symbols.length === 0) {
            logger.warn('⚠️ No hay pares activos registrados en la base de datos.');
            return;
        }

        const days = 30; // 30 días es suficiente para que el dashboard se vea genial y cargue rápido
        const interval = '1m';

        for (const symbol of symbols) {
            logger.info(`\n⛏️ Minando ${symbol} (${days} días)...`);
            try {
                // Usamos la lógica interna del miner pero sin el estado de la UI
                // para que sea síncrono uno tras otro en la consola
                await DataMiner._runMiningLoop(symbol, interval, days);
                logger.success(`✅ ${symbol} inyectado correctamente.`);
            } catch (err) {
                logger.error(`❌ Error minando ${symbol}: ${err.message}`);
            }
        }

        logger.success('\n✨ ¡Proceso completado! Actualiza tu dashboard para ver el historial.');
        process.exit(0);
    } catch (err) {
        logger.error(`Error fatal: ${err.message}`);
        process.exit(1);
    }
}

mineAll();
