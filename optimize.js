const BacktestEngine = require('./src/backtest/BacktestEngine');
const BoosisTrend = require('./src/strategies/BoosisTrend');
const logger = require('./src/core/logger');

/**
 * Script de Optimización de Parámetros
 * Prueba múltiples combinaciones para encontrar la más rentable
 */
async function main() {
    logger.info('🧪 Iniciando Optimización de Parámetros...');

    const rsiLowerRange = [20, 25, 30, 35];
    const rsiUpperRange = [65, 70, 75, 80];
    const bbStdRange = [1.5, 2.0, 2.5];

    let bestResult = {
        profit: -999,
        params: {}
    };

    const config = {
        symbol: 'BTCUSDT',
        interval: '5m',
        initialBalance: 1000
    };

    for (const rsiL of rsiLowerRange) {
        for (const rsiU of rsiUpperRange) {
            for (const bbStd of bbStdRange) {
                logger.debug(`Probando: RSI(${rsiL}/${rsiU}) BB(${bbStd})...`);

                const strategy = new BoosisTrend();
                // Overwrite params manually for testing
                strategy.rsiBuyBound = rsiL;
                strategy.rsiSellBound = rsiU;
                strategy.bbStdDev = bbStd;

                const backtest = new BacktestEngine(strategy, config);
                const report = await backtest.run();

                if (report.summary.totalReturn > bestResult.profit) {
                    bestResult = {
                        profit: report.summary.totalReturn,
                        params: { rsiL, rsiU, bbStd },
                        report: report.performance
                    };
                }
            }
        }
    }

    console.log('\n');
    console.log('═══════════════════════════════════════════════════════');
    console.log('           🏆 MEJOR CONFIGURACIÓN ENCONTRADA');
    console.log('═══════════════════════════════════════════════════════');
    console.log(`💰 Retorno: ${bestResult.profit}%`);
    console.log(`🎯 RSI: ${bestResult.params.rsiL} (Compra) / ${bestResult.params.rsiU} (Venta)`);
    console.log(`📊 BB Std: ${bestResult.params.bbStd}`);
    console.log(`📈 Win Rate: ${bestResult.report.winRate}%`);
    console.log(`💵 Profit Factor: ${bestResult.report.profitFactor}`);
    console.log('═══════════════════════════════════════════════════════\n');
}

main();
