require('dotenv').config();
const backtest = require('./src/core/backtest-engine');
const db = require('./src/core/database');

async function run() {
    await db.connect();

    // Parámetros estándar para el backtest
    const params = {
        rsiPeriod: 14,
        rsiOverbought: 70,
        rsiOversold: 30,
        stopLoss: 0.05,
        takeProfit: 0.10,
        strategy: 'REGIME_PORTFOLIO' // Para ver cómo se comporta con HMM que es lo más avanzado
    };

    console.log('--- Iniciando Backtest BTCUSDT 2022 ---');
    console.log('Periodo: 2022-01-01 -> 2022-12-31');

    try {
        const results = await backtest.runBacktest('BTCUSDT', params, 'custom', {
            startDate: '2022-01-01',
            endDate: '2022-12-31'
        });

        console.log('\n--- RESULTADOS GENERALES ---');
        console.log(`Win Rate: ${results.metrics.winRate}%`);
        console.log(`Profit Factor: ${results.metrics.profitFactor}`);
        console.log(`Max Drawdown: ${results.metrics.maxDrawdown}%`);
        console.log(`Sharpe Ratio: ${results.metrics.sharpeRatio}`);
        console.log(`Total Trades: ${results.metrics.totalTrades}`);
        console.log(`Final ROI: ${results.metrics.roi}%`);

        // Buscar eventos específicos (opcional, pero mejor mostramos el resumen)
        process.exit(0);
    } catch (err) {
        console.error('Error en backtest:', err);
        process.exit(1);
    }
}

run();
