/**
 * 📊 BOOSIS v2.6 "MEDALLION PROFESSIONAL" - THE REFINERY
 * Motor de Backtest Comparativo Masivo (5 Años / 1.8M+ Velas)
 */
require('dotenv').config();

const db = require('../src/core/database');
const logger = require('../src/core/logger');
const DataMiner = require('../src/core/data_miner');
const TradingPairManager = require('../src/core/trading-pair-manager');
const BoosisTrend = require('../src/strategies/BoosisTrend');
const fs = require('fs');
const path = require('path');

async function runMassiveBacktest() {
    const args = process.argv.slice(2);
    const symbolArg = args.find(a => a.startsWith('--symbol='))?.split('=')[1];
    const targetVersion = args.find(a => a.startsWith('--version='))?.split('=')[1] || null;
    const verbose = args.includes('--verbose');

    const symbols = symbolArg ? symbolArg.split(',') : ['BTCUSDT', 'ETHUSDT', 'XRPUSDT'];
    const periodStr = (args.find(a => a.startsWith('--period=')) || '--period=5y').split('=')[1];
    const outputFile = (args.find(a => a.startsWith('--output=')) || '--output=backtest_comparison.json').split('=')[1];

    if (verbose) logger.level = 'debug';

    const days = periodStr === '5y' ? 1825 : 365;

    // [INIT] Asegurar que las tablas existen
    const schema = require('../src/core/database-schema');
    await db.init();
    await schema.init(db.pool);

    logger.info(`\n🚀 INICIANDO BACKTEST MASIVO: [${symbols.join(', ')}]`);
    logger.info(`📅 PERÍODO: ${periodStr} (${days} días)`);

    const globalComparison = {};

    for (const symbol of symbols) {
        logger.info(`\n🔎 ANALIZANDO: ${symbol}...`);

        // 1. Verificar si ya tenemos datos
        const existingCount = await db.pool.query('SELECT COUNT(*) FROM candles WHERE symbol = $1', [symbol]);
        const count = parseInt(existingCount.rows[0].count);

        if (count < (days * 1440 * 0.9)) { // Si tenemos menos del 90% de las velas esperadas
            logger.info(`[Miner] Datos insuficientes (${count}). Sincronizando periodo completo (${days} días)...`);
            try {
                await DataMiner.mineToDatabase(symbol, '1m', days);
            } catch (e) {
                logger.warn(`[Miner] Error de sincronización: ${e.message}`);
            }
        } else {
            logger.info(`[DB] Encontradas ${count} velas para ${symbol}. Usando datos locales.`);
        }

        // 2. Cargar Velas (Max 3M para cubrir 5 años de datos 1m)
        const candles = await db.getRecentCandles(symbol, 3000000);
        logger.info(`[Backtest] Inyectando ${candles.length} velas al motor...`);
        if (candles.length < 1000) {
            logger.error(`[${symbol}] Datos insuficientes para backtest.`);
            continue;
        }

        // 3. Ejecutar Simulaciones
        let resultsV25 = null;
        let resultsV26 = null;

        if (!targetVersion || targetVersion === '2.5') {
            resultsV25 = await simulate(symbol, candles, '2.5', verbose);
        }

        if (!targetVersion || targetVersion === '2.6') {
            resultsV26 = await simulate(symbol, candles, '2.6', verbose);
        }

        // 4. Calcular Delta
        globalComparison[symbol] = {
            v25: resultsV25 || { roi: "0", totalTrades: 0 },
            v26: resultsV26 || { roi: "0", totalTrades: 0 },
            delta: (resultsV25 && resultsV26) ? calculateDelta(resultsV25, resultsV26) : {}
        };

        if (resultsV25 && resultsV26) {
            printSymbolReport(symbol, resultsV25, resultsV26);
        } else {
            logger.info(`[${symbol}] Resultados ${targetVersion}:`, targetVersion === '2.5' ? resultsV25 : resultsV26);
        }

        // Guardar progresivamente
        fs.writeFileSync(outputFile, JSON.stringify(globalComparison, null, 2));
    }

    // Guardar resultados
    const outputDir = path.dirname(outputFile);
    if (outputDir !== '.') fs.mkdirSync(outputDir, { recursive: true });
    fs.writeFileSync(outputFile, JSON.stringify(globalComparison, null, 2));

    logger.info(`\n✅ BACKTEST COMPLETADO. Resultados guardados en: ${outputFile}`);
}

/**
 * Simulador de Estrategia
 */
async function simulate(symbol, candles, version, verbose = false) {
    const strategy = new BoosisTrend();
    const manager = new TradingPairManager(symbol, strategy, {
        isBacktest: true,
        disableTurtle: version === '2.5',
        verbose: verbose
    });

    // Configuración según versión
    if (version === '2.5') {
        manager.hmm = new (require('../src/core/hmm-engine'))(3);
        manager.turtleMode = false;
    } else {
        // v2.6 usa 8 estados y TurtleMode dinámico
        manager.hmm = new (require('../src/core/hmm-engine'))(8);
    }

    // Bypass init manual para inyectar estado inicial
    manager.initialized = true;

    // Entrenamiento inicial del HMM para que las predicciones funcionen (Viterbi, etc.)
    logger.info(`[${symbol}] [v${version}] Entrenando HMM...`);
    const trainData = candles.slice(0, 1000);
    await manager.hmm.train(trainData, 20);

    let balance = 10000;
    const initialBalance = balance;
    let peak = balance;
    let maxDD = 0;
    const trades = [];
    const dailyReturns = [];

    // Permitir entrenamiento HMM usando el tiempo de la primera vela como referencia
    manager.lastHMMTrain = parseInt(candles[0][0]);

    const totalSteps = candles.length;
    const progressStep = Math.floor(totalSteps / 100);

    for (let i = 200; i < candles.length; i++) {
        if (i % progressStep === 0) {
            const percent = ((i / totalSteps) * 100).toFixed(0);
            logger.info(`[${symbol}] [v${version}] Progreso: ${percent}%...`);
        }
        const candle = candles[i];
        const signal = await manager.onCandleClosed(candle, balance);

        if (signal) {
            if (signal.action === 'BUY') {
                // 1. Determinar tamaño de la unidad (v2.6 usa el cálculo seguro de TurtleStrategy)
                let amount = version === '2.6' && signal.unitSize
                    ? signal.unitSize
                    : (balance * 0.98) / signal.price;

                // 2. 🛡️ VALIDACIÓN DE SEGURIDAD (PARCHE 2)
                // Apalancamiento Máximo: 5x del balance actual
                const maxLeverage = 5;
                const maxAllowedNotional = Math.max(0, balance * maxLeverage);
                const requestedNotional = amount * signal.price;

                if (requestedNotional > maxAllowedNotional) {
                    amount = maxAllowedNotional / signal.price;
                }

                // 3. Ejecutar Entrada o Piramidación
                const commission = (amount * signal.price) * 0.001;
                if (!manager.activePosition) {
                    if (amount > 0) {
                        manager.recordTrade({
                            action: 'OPEN',
                            strategy: signal.strategy,
                            position: { entryPrice: signal.price, amount: amount, units: 1 }
                        });
                        balance -= commission;
                    }
                } else if (version === '2.6' && signal.isPyramid && (manager.activePosition.units || 1) < 4) {
                    if (amount > 0) {
                        manager.recordTrade({
                            action: 'ADD',
                            amount: amount
                        });
                        balance -= commission;
                    }
                }
            } else if (signal.action === 'SELL' && manager.activePosition) {
                const pos = manager.activePosition;
                const exitRevenue = (pos.amount * signal.price);
                const entryCost = (pos.amount * pos.entryPrice);
                const pnl = exitRevenue - entryCost;
                const exitCommission = exitRevenue * 0.001;

                balance += (pnl - exitCommission);
                trades.push({ pnl: pnl - exitCommission, pnlPct: (signal.price / pos.entryPrice - 1) * 100 });
                manager.recordTrade({ action: 'CLOSE', pnlValue: pnl - exitCommission, pnl: (pnl - exitCommission) > 0 ? 1 : -1 });
            }
        }

        // Track Drawdown
        const currentEquity = balance + (manager.activePosition ? manager.activePosition.amount * candle[4] : 0);
        if (currentEquity > peak) peak = currentEquity;
        const dd = (peak - currentEquity) / peak;
        if (dd > maxDD) maxDD = dd;

        if (i % 1440 === 0) dailyReturns.push(currentEquity);
    }

    // Métricas
    const totalReturn = balance - initialBalance;
    const roi = initialBalance > 0 ? (totalReturn / initialBalance) * 100 : 0;
    const wins = trades.filter(t => t.pnl > 0).length;
    const winRate = (wins / (trades.length || 1)) * 100;

    // Sharpe Simplificado
    const returns = [];
    for (let i = 1; i < dailyReturns.length; i++) {
        if (dailyReturns[i - 1] > 0) {
            returns.push((dailyReturns[i] / dailyReturns[i - 1]) - 1);
        }
    }
    const avgReturn = returns.length > 0 ? returns.reduce((a, b) => a + b, 0) / returns.length : 0;
    const sumSqDiff = returns.reduce((a, b) => a + Math.pow(b - avgReturn, 2), 0);
    const stdDev = returns.length > 1 ? Math.sqrt(sumSqDiff / (returns.length - 1)) : 0;
    const sharpe = stdDev > 0 ? (avgReturn / stdDev) * Math.sqrt(365) : 0;

    // Profit Factor
    const grossProfit = trades.filter(t => t.pnl > 0).reduce((a, b) => a + b.pnl, 0);
    const grossLoss = Math.abs(trades.filter(t => t.pnl < 0).reduce((a, b) => a + b.pnl, 0)) || 1;

    return {
        roi: roi.toFixed(2),
        winRate: winRate.toFixed(1),
        maxDD: (maxDD * 100).toFixed(2),
        sharpe: sharpe.toFixed(2),
        profitFactor: (grossProfit / grossLoss).toFixed(2),
        totalTrades: trades.length
    };
}

function calculateDelta(v25, v26) {
    return {
        winRateImprovement: (v26.winRate - v25.winRate).toFixed(1) + "%",
        roiGain: (v26.roi - v25.roi).toFixed(1) + "%",
        drawdownReduction: (v25.maxDD - v26.maxDD).toFixed(1) + "%",
        sharpeImprovement: (v26.sharpe - v25.sharpe).toFixed(2)
    };
}

function printSymbolReport(symbol, v25, v26) {
    console.log(`\n==================================================`);
    console.log(`🏆 RESULTADOS: ${symbol}`);
    console.log(`==================================================`);
    console.log(`MÉTRICA        | v2.5     | v2.6     | Δ`);
    console.log(`--------------------------------------------------`);
    console.log(`Win Rate       | ${v25.winRate}%    | ${v26.winRate}%    | +${(v26.winRate - v25.winRate).toFixed(1)}%`);
    console.log(`ROI            | ${v25.roi}%     | ${v26.roi}%     | +${(v26.roi - v25.roi).toFixed(1)}%`);
    console.log(`Max Drawdown   | -${v25.maxDD}%    | -${v26.maxDD}%    | +${(v25.maxDD - v26.maxDD).toFixed(1)}%`);
    console.log(`Sharpe Ratio   | ${v25.sharpe}     | ${v26.sharpe}     | +${(v26.sharpe - v25.sharpe).toFixed(2)}`);
    console.log(`Profit Factor  | ${v25.profitFactor}     | ${v26.profitFactor}     | +${(v26.profitFactor - v25.profitFactor).toFixed(2)}`);
    console.log(`Total Trades   | ${v25.totalTrades}      | ${v26.totalTrades}      | +${v26.totalTrades - v25.totalTrades}`);
}

runMassiveBacktest().catch(err => {
    logger.error(`Error en el backtest masivo: ${err.message}`);
    process.exit(1);
});
