const DataMiner = require('./src/core/data_miner');
const logger = require('./src/core/logger');

async function run() {
    const symbol = 'BTCUSDT';
    const interval = '5m';
    const limit = 10000; // ~35 días de historia

    logger.info(`Iniciando descarga masiva de ${limit} velas para ${symbol}...`);

    try {
        const filePath = await DataMiner.harvest(symbol, interval, limit);
        if (filePath) {
            logger.success(`¡Cosecha completada! Datos listos en: ${filePath}`);
        } else {
            logger.error('La cosecha falló.');
        }
    } catch (err) {
        logger.error(`Error durante la cosecha: ${err.message}`);
    }
}

run();
