#!/usr/bin/env node

/**
 * 🚀 TEST 2B: TURTLE STRATEGY PARA FOREX
 * 
 * Características:
 * - Par: EURUSD (Forex)
 * - Timeframe: 1h (Turtle diseñada para esto)
 * - Período: 1 año
 * - Estrategia: Turtle puro (sin Pattern Scanner)
 * 
 * EJECUCIÓN:
 * node scripts/test_2b_forex_turtle.js
 */

require('dotenv').config();

const db = require('../src/core/database');
const logger = require('../src/core/logger');
const DataMiner = require('../src/core/data_miner');
const HMMEngine = require('../src/core/hmm-engine');
const TurtleStrategy = require('../src/strategies/TurtleStrategy');
const fs = require('fs');

async function runTest2BForexTurtle() {
    const symbol = 'EURUSDT';
    const timeframe = '1h';
    const period = '1y';
    const days = 365;
    const startTime = Date.now();

    logger.info(`\n${'='.repeat(70)}`);
    logger.info(`🚀 TEST 2B: TURTLE STRATEGY PARA FOREX`);
    logger.info(`${'='.repeat(70)}`);
    logger.info(`Symbol: ${symbol}`);
    logger.info(`Timeframe: ${timeframe}`);
    logger.info(`Período: ${period} (${days} días)`);
    logger.info(`Estrategia: Turtle (Donchian Breakouts)`);
    logger.info(`${'='.repeat(70)}\n`);

    try {
        // INIT Database
        await db.init();
        logger.info(`✅ Database inicializada`);

        // Cargar o minar datos FOREX
        const existingCount = await db.pool.query(
            'SELECT COUNT(*) FROM candles WHERE symbol = $1',
            [symbol]
        );
        const count = parseInt(existingCount.rows[0].count);

        // Para Forex 1H: 365 días = 365 * 24 = 8,760 velas
        const expectedCandles = days * 24;

        if (count < expectedCandles * 0.9) {
            logger.info(`[DataMiner] Sincronizando ${symbol} en ${timeframe}...`);
            await DataMiner.mineToDatabase(symbol, timeframe, days);
        } else {
            logger.info(`[DB] Usando ${count} candles existentes`);
        }

        // Cargar candles
        let candles = await db.getRecentCandles(symbol, 10000);
        logger.info(`📊 Cargadas ${candles.length} velas (${timeframe})\n`);

        if (candles.length < 1000) {
            throw new Error('Datos insuficientes para Forex');
        }

        // ═══════════════════════════════════════════════════════════
        // INICIALIZACIÓN: HMM + Turtle
        // ═══════════════════════════════════════════════════════════

        const hmm = new HMMEngine(8);

        // Turtle Strategy (parámetros para 1H)
        // S1: 20 velas 1H = 20 horas
        // S2: 55 velas 1H = 55 horas (2.3 días)
        const turtle = new TurtleStrategy(20, 10, 55, 20);

        // Entrenamiento HMM
        logger.info(`🧠 Entrenando HMM (8 estados)...`);
        const trainData = candles.slice(0, Math.min(500, candles.length));
        await hmm.train(trainData, 10);
        logger.info(`✅ HMM entrenado\n`);

        // ═══════════════════════════════════════════════════════════
        // SIMULACIÓN TURTLE
        // ═══════════════════════════════════════════════════════════

        let balance = 10000;
        const initialBalance = balance;
        let peak = balance;
        let maxDD = 0;

        const trades = [];
        const dailyReturns = [balance];

        let activePosition = null;
        let lastHMMTrain = parseInt(candles[0][0]);
        const hmmUpdateInterval = 4 * 60 * 60 * 1000;  // 4 horas para Forex

        const totalSteps = candles.length;
        const progressStep = Math.floor(totalSteps / 20);

        logger.info(`🚀 INICIANDO SIMULACIÓN TURTLE...\n`);

        for (let i = 100; i < candles.length; i++) {
            // Progress
            if (i % progressStep === 0 && i % (progressStep * 5) === 0) {
                const percent = ((i / totalSteps) * 100).toFixed(0);
                const elapsed = ((Date.now() - startTime) / 1000).toFixed(0);
                logger.info(`[${symbol}] Progreso: ${percent}% | Elapsed: ${elapsed}s`);
            }

            const candle = candles[i];
            const candleTime = parseInt(candle[0]);
            const close = parseFloat(candle[4]);

            // Entrenar HMM cada 4 horas (Forex)
            if (candleTime - lastHMMTrain > hmmUpdateInterval) {
                await hmm.train(candles.slice(Math.max(0, i - 100), i), 5);
                lastHMMTrain = candleTime;
            }

            // Predicción HMM
            const hmmPrediction = hmm.isTrained
                ? hmm.predictState(candles.slice(Math.max(0, i - 20), i))
                : null;

            // Turtle Signal
            const turtleSignal = turtle.onCandle(
                candle,
                candles.slice(Math.max(0, i - 100), i),
                !!activePosition,
                activePosition,
                balance, // capital
                hmmPrediction
            );

            // ═════════════════════════════════════════════════════════════
            // LÓGICA: Turtle + HMM confirmation
            // ═════════════════════════════════════════════════════════════

            // SALIDA: Turtle exit o Stop Loss (PRIMERO SALIDA)
            if (activePosition) {
                if (turtleSignal && turtleSignal.action === 'SELL') {
                    // Donchian exit
                    const pnl = activePosition.amount * (close - activePosition.entryPrice);
                    const commission = (activePosition.amount * close) * 0.0005;
                    balance += (pnl - commission);

                    const gain = (close / activePosition.entryPrice - 1) * 100;

                    trades.push({
                        strategy: 'TURTLE',
                        entry: activePosition.entryPrice,
                        exit: close,
                        pnl: gain - 0.05,
                        success: true,
                        durationHours: (candleTime - activePosition.entryTime) / 3600000
                    });

                    logger.info(`[${symbol}] 🟠 SALIDA TURTLE: ${close.toFixed(5)} | Gain: ${gain.toFixed(2)}% | Bal: $${balance.toFixed(2)} [${new Date(candleTime).toISOString()}]`);
                    activePosition = null;

                } else if (close <= activePosition.stopLoss) {
                    // Stop Loss 2N
                    const pnl = activePosition.amount * (close - activePosition.entryPrice);
                    const commission = (activePosition.amount * close) * 0.0005;
                    balance += (pnl - commission);

                    const loss = (close / activePosition.entryPrice - 1) * 100;

                    trades.push({
                        strategy: 'TURTLE',
                        entry: activePosition.entryPrice,
                        exit: close,
                        pnl: loss - 0.05,
                        success: false,
                        durationHours: (candleTime - activePosition.entryTime) / 3600000
                    });

                    logger.info(`[${symbol}] 🔴 STOP LOSS TURTLE: ${close.toFixed(5)} | Loss: ${loss.toFixed(2)}% | Bal: $${balance.toFixed(2)} [${new Date(candleTime).toISOString()}]`);
                    activePosition = null;
                }
            }

            // ENTRADA: Turtle breakout + HMM alcista (LUEGO ENTRADA)
            if (!activePosition && turtleSignal && hmmPrediction) {
                if (
                    turtleSignal.action === 'BUY' &&
                    (hmmPrediction.label.includes('ALCISTA') || hmmPrediction.label.includes('ACUMULACIÓN'))
                ) {
                    const entryPrice = close;
                    const commission = (balance * 0.99) * 0.0005;

                    const position = {
                        entryPrice: entryPrice,
                        amount: (balance * 0.99) / entryPrice,
                        strategy: 'TURTLE',
                        factorN: turtleSignal.riskFactor || 0,
                        target: turtleSignal.target,
                        stopLoss: turtleSignal.stopLoss,
                        entryTime: candleTime
                    };

                    activePosition = position;
                    balance -= commission; // Solo comisión inicial

                    logger.info(`[${symbol}] 🐢 ENTRADA TURTLE S1: ${entryPrice.toFixed(5)} [${new Date(candleTime).toISOString()}]`);
                }
            }

            // Track equity
            const currentEquity = balance + (activePosition ? activePosition.amount * close : 0);
            if (currentEquity > peak) peak = currentEquity;
            const dd = (peak - currentEquity) / peak;
            if (dd > maxDD) maxDD = dd;

            // Daily returns
            if (i % 24 === 0) {
                dailyReturns.push(currentEquity);
            }
        }

        // ═════════════════════════════════════════════════════════════
        // MÉTRICAS
        // ═════════════════════════════════════════════════════════════

        logger.info(`\n${'='.repeat(70)}`);
        logger.info(`📊 TEST 2B - TURTLE FOREX RESULTADOS`);
        logger.info(`${'='.repeat(70)}\n`);

        const totalReturn = balance - initialBalance;
        const roi = (totalReturn / initialBalance) * 100;
        const wins = trades.filter(t => t.success).length;
        const winRate = (wins / (trades.length || 1)) * 100;

        // Sharpe
        const returns = [];
        for (let i = 1; i < dailyReturns.length; i++) {
            if (dailyReturns[i - 1] > 0) {
                returns.push((dailyReturns[i] / dailyReturns[i - 1]) - 1);
            }
        }
        const avgReturn = returns.length > 0 ? returns.reduce((a, b) => a + b) / returns.length : 0;
        const variance = returns.reduce((a, b) => a + Math.pow(b - avgReturn, 2), 0) / returns.length;
        const sharpe = Math.sqrt(variance) > 0 ? (avgReturn / Math.sqrt(variance)) * Math.sqrt(365) : 0;

        // Profit Factor
        const grossProfit = trades.filter(t => t.pnl > 0).reduce((a, b) => a + b.pnl, 0);
        const grossLoss = Math.abs(trades.filter(t => t.pnl < 0).reduce((a, b) => a + b.pnl, 0)) || 1;
        const profitFactor = grossProfit / Math.max(grossLoss, 0.001);

        const avgDuration = trades.length > 0
            ? trades.reduce((a, b) => a + b.durationHours, 0) / trades.length
            : 0;

        const results = {
            symbol: symbol,
            version: '2.6',
            method: 'Turtle Strategy (Donchian Breakouts)',
            timeframe: timeframe,
            period: period,

            parameters: {
                s1_period: 20,
                s2_period: 55,
                atr_period: 20,
                hmmStates: 8,
                hmmConfidence: 0.70
            },

            metrics: {
                totalTrades: trades.length,
                winRate: winRate.toFixed(1),
                roi: roi.toFixed(2),
                maxDrawdown: (maxDD * 100).toFixed(2),
                sharpeRatio: sharpe.toFixed(2),
                profitFactor: profitFactor.toFixed(2),
                avgReturn: avgReturn.toFixed(6),
                avgTradeDuration: avgDuration.toFixed(1),
                grossProfit: grossProfit.toFixed(2),
                grossLoss: grossLoss.toFixed(2),
                finalBalance: balance.toFixed(2)
            },

            evaluation: {
                passed: roi > 5,
                verdict: roi > 10 ? '✅ EXCELENTE' : roi > 5 ? '✅ PASÓ' : roi > 0 ? '⚠️ MARGINAL' : '❌ FALLÓ',
                recommendation: roi > 8 ? 'Turtle funciona en Forex' : 'Necesita ajuste de parámetros'
            },

            trades: trades.slice(-20),
            timestamp: new Date().toISOString(),
            executionTime: ((Date.now() - startTime) / 1000).toFixed(0) + ' segundos'
        };

        // MOSTRAR RESULTADOS
        console.log('\n📈 MÉTRICAS FINALES:\n');
        console.log(`Total Trades:       ${results.metrics.totalTrades}`);
        console.log(`Win Rate:           ${results.metrics.winRate}%`);
        console.log(`ROI:                ${results.metrics.roi}%`);
        console.log(`Max Drawdown:       ${results.metrics.maxDrawdown}%`);
        console.log(`Sharpe Ratio:       ${results.metrics.sharpeRatio}`);
        console.log(`Profit Factor:      ${results.metrics.profitFactor}`);
        console.log(`Avg Duration:       ${results.metrics.avgTradeDuration} horas\n`);

        console.log(`📊 VEREDICTO:       ${results.evaluation.verdict}`);
        console.log(`Recomendación:      ${results.evaluation.recommendation}\n`);

        // Guardar
        const outputFile = 'test_2b_eurusd_turtle.json';
        fs.writeFileSync(outputFile, JSON.stringify(results, null, 2));

        logger.info(`✅ Resultados guardados en: ${outputFile}`);
        logger.info(`⏱️  Tiempo total: ${results.executionTime}s`);
        logger.info(`${'='.repeat(70)}\n`);

    } catch (error) {
        logger.error(`❌ Error en TEST 2B: ${error.message}`);
        logger.error(error.stack);
        process.exit(1);
    }
}

// Ejecutar
runTest2BForexTurtle().then(() => {
    logger.info('✅ TEST 2B completado');
    process.exit(0);
}).catch(error => {
    logger.error(`Fatal error: ${error.message}`);
    process.exit(1);
});
