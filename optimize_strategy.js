const fs = require('fs');
const path = require('path');
const BoosisTrend = require('./src/strategies/BoosisTrend');
const BacktestEngine = require('./src/backtest/engine');
const logger = require('./src/core/logger');

const DATA_FILE = './data/BTCUSDT_5m.json';

async function optimize() {
    if (!fs.existsSync(DATA_FILE)) {
        logger.error('No se encontró el archivo de datos masivo. Ejecuta primero harvest_big_data.js');
        return;
    }

    const candles = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
    logger.info(`Iniciando optimización sobre ${candles.length} velas...`);

    const results = [];

    // RANGOS DE OPTIMIZACIÓN
    const rsiLowerBounds = [30, 40, 50];
    const trailingStopPercents = [0.015, 0.02, 0.03];
    const stopLossPercents = [0.02, 0.03];

    for (const rsiLower of rsiLowerBounds) {
        for (const tsl of trailingStopPercents) {
            for (const sl of stopLossPercents) {
                const strategy = new BoosisTrend({
                    rsiPeriod: 14,
                    stopLossPercent: sl,
                    trailingStopPercent: tsl,
                    rsiBuyBound: rsiLower
                });

                const engine = new BacktestEngine(1000, 0.001);
                const report = engine.run(strategy, candles);

                results.push({
                    rsiLower,
                    tsl: (tsl * 100).toFixed(1) + '%',
                    sl: (sl * 100).toFixed(1) + '%',
                    profit: report.profitPercent.toFixed(2) + '%',
                    trades: report.totalTrades,
                    finalBalance: report.finalBalance
                });
            }
        }
    }

    // Sort results by profit
    results.sort((a, b) => parseFloat(b.profit) - parseFloat(a.profit));

    console.log('\n🏆 TOP 5 CONFIGURACIONES ENCONTRADAS:');
    console.table(results.slice(0, 5));
}

optimize();
