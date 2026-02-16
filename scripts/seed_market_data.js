
require('dotenv').config();
const db = require('../src/core/database');
const axios = require('axios');
const logger = require('../src/core/logger');

// Configuración
const SYMBOLS = ['BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'XRPUSDT'];
const INTERVAL = '5m';
const DAYS_TO_FETCH = 90; // 3 meses de historia para pruebas robustas

async function fetchAndSeed(symbol) {
    logger.info(`[Seed] Iniciando descarga para ${symbol}...`);

    // Calcular timestamps
    const endTime = Date.now();
    const startTime = endTime - (DAYS_TO_FETCH * 24 * 60 * 60 * 1000);
    let currentStartTime = startTime;

    let totalImported = 0;

    while (currentStartTime < endTime) {
        try {
            const url = `https://api.binance.com/api/v3/klines`;
            const params = {
                symbol: symbol,
                interval: INTERVAL,
                startTime: currentStartTime,
                limit: 1000
            };

            const response = await axios.get(url, { params });
            const candles = response.data;

            if (candles.length === 0) break;

            // Procesar y guardar en DB
            for (const k of candles) {
                // k = [openTime, open, high, low, close, volume, closeTime, ...]
                const candle = [
                    k[0], // open_time
                    parseFloat(k[1]), // open
                    parseFloat(k[2]), // high
                    parseFloat(k[3]), // low
                    parseFloat(k[4]), // close
                    parseFloat(k[5]), // volume
                    k[6]  // close_time
                ];

                await db.saveCandle(symbol, candle);
            }

            totalImported += candles.length;
            process.stdout.write(`.`); // Progreso visual

            // Actualizar tiempo para siguiente lote
            currentStartTime = candles[candles.length - 1][6] + 1;

            // Respetar rate limits
            await new Promise(r => setTimeout(r, 100));

        } catch (error) {
            logger.error(`Error en lote: ${error.message}`);
            await new Promise(r => setTimeout(r, 2000)); // Esperar si hay error
        }
    }

    console.log(""); // Nueva línea
    logger.success(`[Seed] ✅ Completado ${symbol}: ${totalImported} velas importadas.`);
}

async function run() {
    try {
        await db.connect();
        logger.info('Conectado a DB. Iniciando proceso de seed...');

        for (const symbol of SYMBOLS) {
            await fetchAndSeed(symbol);
        }

        logger.success('🚀 Todo el historial ha sido importado exitosamente.');
        process.exit(0);
    } catch (error) {
        logger.error(`Falló el script: ${error.message}`);
        process.exit(1);
    }
}

run();
