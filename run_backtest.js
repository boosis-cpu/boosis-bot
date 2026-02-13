const fs = require('fs');
const path = require('path');
const DataMiner = require('./src/core/data_miner');
const BoosisTrend = require('./src/strategies/BoosisTrend');
const BacktestEngine = require('./src/backtest/engine');
const logger = require('./src/core/logger');

const CONFIG = {
    symbol: 'BTCUSDT',
    interval: '5m',
    limit: 1000,
    dataDir: './data'
};

async function main() {
    logger.info('=== Starting Boosis Quant Bot System check ===');

    // 1. Data Acquisition
    const dataFile = path.join(CONFIG.dataDir, `${CONFIG.symbol}_${CONFIG.interval}.json`);
    let candles = [];

    if (fs.existsSync(dataFile)) {
        logger.info(`Loading data from ${dataFile}...`);
        const rawData = fs.readFileSync(dataFile, 'utf8');
        candles = JSON.parse(rawData);
    } else {
        logger.info(`Data file not found. Fetching fresh data for ${CONFIG.symbol}...`);
        await DataMiner.harvest(CONFIG.symbol, CONFIG.interval, CONFIG.limit);
        // Reload to ensure format consistency
        if (fs.existsSync(dataFile)) {
            const rawData = fs.readFileSync(dataFile, 'utf8');
            candles = JSON.parse(rawData);
        } else {
            logger.error('Failed to acquire data.');
            return;
        }
    }

    if (!candles || candles.length === 0) {
        logger.error('No candle data available to run backtest.');
        return;
    }

    logger.success(`Loaded ${candles.length} candles.`);

    // 2. Strategy Initialization
    const trendStrategy = new BoosisTrend({
        trendWindow: 48,  // 48 * 5m = 4 hours
        signalWindow: 12, // 12 * 5m = 1 hour
        threshold: 0.002 // 0.2%
    });

    // 3. Backtest Execution
    const engine = new BacktestEngine(1000, 0.001); // $1000 start, 0.1% fees
    const results = engine.run(trendStrategy, candles);

    // 4. Report
    console.log('\n==========================================');
    console.log(` RESULTADOS DEL BACKTEST: ${trendStrategy.name}`);
    console.log('==========================================');
    console.log(`Capital Inicial:   $${results.initialCapital.toFixed(2)}`);
    console.log(`Balance Final:     $${results.finalBalance.toFixed(2)}`);
    console.log(`Beneficio Total:   ${results.profitPercent.toFixed(2)}%`);
    console.log(`Max Drawdown:      ${results.maxDrawdown.toFixed(2)}%`);
    console.log(`Total Operaciones: ${results.totalTrades}`);
    console.log('==========================================\n');

    // Optional: Log last 5 trades
    if (results.operations.length > 0) {
        console.log('Últimas 5 operaciones:');
        results.operations.slice(-5).forEach(op => {
            console.log(`[${op.time}] ${op.type} @ ${op.price} | Balance: ${op.balance.toFixed(2)} (${op.reason})`);
        });
    }
}

main().catch(err => {
    console.error(err);
});
