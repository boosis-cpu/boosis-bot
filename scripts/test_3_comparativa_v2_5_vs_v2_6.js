#!/usr/bin/env node

/**
 * 🏆 TEST 3: COMPARATIVA FINAL v2.5 vs v2.6
 * 
 * PROPÓSITO CRÍTICO:
 * Validar científicamente que HMM v2.6 MEJORA sobre v2.5 base
 * 
 * CONTEXTO:
 * TEST 2D validó que Turtle en DAILY funciona (+116.79%)
 * TEST 3 va a probar si v2.6 (con HMM) > v2.5 (sin HMM)
 * 
 * IMPLICACIÓN:
 * Si v2.6 gana → HMM agrega valor CIENTÍFICAMENTE probado
 * → Arquitectura está CORRECTA
 * → Listo para dinero real (Marzo)
 * → Mac Mini ejecutando BOOSIS 24/7 con beneficios compartidos
 * 
 * EJECUCIÓN:
 * node scripts/test_3_comparativa_v2_5_vs_v2_6.js
 */

require('dotenv').config();

const db = require('../src/core/database');
const logger = require('../src/core/logger');
const DataMiner = require('../src/core/data_miner');
const HMMEngine = require('../src/core/hmm-engine');
const TurtleStrategy = require('../src/strategies/TurtleStrategy');
const fs = require('fs');

async function runTest3Comparativa() {
    const symbol = 'BTCUSDT';
    const timeframe = '1d';
    const period = '5y';
    const days = 365 * 5;
    const startTime = Date.now();

    logger.info(`\n${'='.repeat(80)}`);
    logger.info(`🏆 TEST 3: COMPARATIVA FINAL v2.5 vs v2.6`);
    logger.info(`${'='.repeat(80)}`);
    logger.info(`\n📊 PROPÓSITO: Validar que HMM v2.6 mejora sobre Turtle puro v2.5`);
    logger.info(`\nSímbolo:        ${symbol}`);
    logger.info(`Timeframe:      ${timeframe.toUpperCase()} (Correcto contexto)`);
    logger.info(`Período:        ${period} (${days} días)`);
    logger.info(`Estrategia v2.5: Turtle PURO (sin HMM)`);
    logger.info(`Estrategia v2.6: Turtle + HMM Shield`);
    logger.info(`\n${'-'.repeat(80)}\n`);

    try {
        // INIT Database
        await db.init();
        logger.info(`✅ Database inicializada\n`);

        // Cargar datos
        const existingCount = await db.pool.query(
            'SELECT COUNT(*) FROM candles WHERE symbol = $1 AND timeframe = $2',
            [symbol, timeframe]
        );
        const count = parseInt(existingCount.rows[0]?.count || 0);

        if (count < days * 0.8) {
            logger.info(`[DataMiner] Sincronizando ${symbol} en DAILY...`);
            await DataMiner.mineToDatabase(symbol, timeframe, days);
        }

        let candles = await db.getRecentCandles(symbol, 100000, timeframe);
        logger.info(`📊 Cargadas ${candles.length} velas DAILY\n`);

        if (candles.length < 100) {
            throw new Error('Datos insuficientes');
        }

        // ═══════════════════════════════════════════════════════════════════════
        // VERSIÓN v2.5: TURTLE PURO (Sin HMM)
        // ═══════════════════════════════════════════════════════════════════════

        logger.info(`${'='.repeat(80)}`);
        logger.info(`⚙️  SIMULACIÓN v2.5: TURTLE PURO (SIN HMM)`);
        logger.info(`${'='.repeat(80)}\n`);

        const turtleV25 = new TurtleStrategy(20, 10, 55, 20);

        let balanceV25 = 10000;
        const initialBalance = 10000;
        let peakV25 = balanceV25;
        let maxDDV25 = 0;
        const tradesV25 = [];
        const dailyReturnsV25 = [balanceV25];
        let activePositionV25 = null;

        const totalSteps = candles.length;
        const progressStep = Math.floor(totalSteps / 20);

        logger.info(`🚀 Procesando ${candles.length} velas...\n`);

        for (let i = 100; i < candles.length; i++) {
            if (i % progressStep === 0 && i % (progressStep * 5) === 0) {
                const percent = ((i / totalSteps) * 100).toFixed(0);
                logger.info(`[v2.5] Progreso: ${percent}%`);
            }

            const candle = candles[i];
            const close = parseFloat(candle[4]);

            // Turtle sin HMM = SIEMPRE compra si hay señal
            const turtleSignalV25 = turtleV25.onCandle(
                candle,
                candles.slice(Math.max(0, i - 100), i),
                !!activePositionV25,
                activePositionV25,
                10000, // Capital inicial fijo para simulación pura
                null  // Sin HMM
            );

            // ENTRADA v2.5: Turtle puro, sin filtro HMM
            if (!activePositionV25 && turtleSignalV25 && turtleSignalV25.action === 'BUY') {
                const entryPrice = close;
                const leverage = 2;
                activePositionV25 = {
                    entryPrice: entryPrice,
                    amount: (balanceV25 * leverage * 0.98) / entryPrice,
                    target: turtleSignalV25.target || (entryPrice * 1.5),
                    stopLoss: turtleSignalV25.stopLoss || (entryPrice * 0.95),
                    entryTime: parseInt(candle[0])
                };
                balanceV25 -= activePositionV25.amount * entryPrice * 0.0005;
            }

            // SALIDA v2.5
            if (activePositionV25) {
                if (close >= activePositionV25.target || (turtleSignalV25 && turtleSignalV25.action === 'SELL')) {
                    const exitPrice = close;
                    const pnl = (exitPrice - activePositionV25.entryPrice) / activePositionV25.entryPrice;
                    const commission = (activePositionV25.amount * exitPrice) * 0.0005;
                    balanceV25 += (activePositionV25.amount * activePositionV25.entryPrice * pnl) - commission;

                    tradesV25.push({
                        pnl: pnl * 100,
                        success: pnl > 0,
                        duration: (parseInt(candle[0]) - activePositionV25.entryTime) / (24 * 60 * 60 * 1000)
                    });
                    activePositionV25 = null;
                } else if (close <= activePositionV25.stopLoss) {
                    const exitPrice = close;
                    const pnl = (exitPrice - activePositionV25.entryPrice) / activePositionV25.entryPrice;
                    const commission = (activePositionV25.amount * exitPrice) * 0.0005;
                    balanceV25 += (activePositionV25.amount * activePositionV25.entryPrice * pnl) - commission;

                    tradesV25.push({
                        pnl: pnl * 100,
                        success: false,
                        duration: (parseInt(candle[0]) - activePositionV25.entryTime) / (24 * 60 * 60 * 1000)
                    });
                    activePositionV25 = null;
                }
            }

            const equityV25 = balanceV25 + (activePositionV25 ? activePositionV25.amount * (close - activePositionV25.entryPrice) : 0);
            if (equityV25 > peakV25) peakV25 = equityV25;
            const ddV25 = (peakV25 - equityV25) / Math.max(peakV25, 1);
            if (ddV25 > maxDDV25) maxDDV25 = ddV25;

            dailyReturnsV25.push(equityV25);
        }

        // ═══════════════════════════════════════════════════════════════════════
        // VERSIÓN v2.6: TURTLE + HMM SHIELD
        // ═══════════════════════════════════════════════════════════════════════

        logger.info(`\n${'='.repeat(80)}`);
        logger.info(`⚙️  SIMULACIÓN v2.6: TURTLE + HMM SHIELD`);
        logger.info(`${'='.repeat(80)}\n`);

        const hmmV26 = new HMMEngine(8);
        const turtleV26 = new TurtleStrategy(20, 10, 55, 20);

        logger.info(`🧠 Entrenando HMM (8 estados)...`);
        const trainData = candles.slice(0, Math.min(500, candles.length));
        await hmmV26.train(trainData, 20);
        logger.info(`✅ HMM entrenado\n`);

        let balanceV26 = 10000;
        let peakV26 = balanceV26;
        let maxDDV26 = 0;
        const tradesV26 = [];
        const dailyReturnsV26 = [balanceV26];
        let activePositionV26 = null;
        let lastHMMTrain = parseInt(candles[0][0]);
        const hmmUpdateInterval = 30 * 24 * 60 * 60 * 1000;

        logger.info(`🚀 Procesando ${candles.length} velas...\n`);

        for (let i = 100; i < candles.length; i++) {
            if (i % progressStep === 0 && i % (progressStep * 5) === 0) {
                const percent = ((i / totalSteps) * 100).toFixed(0);
                logger.info(`[v2.6] Progreso: ${percent}%`);
            }

            const candle = candles[i];
            const candleTime = parseInt(candle[0]);
            const close = parseFloat(candle[4]);

            // Entrenar HMM
            if (candleTime - lastHMMTrain > hmmUpdateInterval) {
                await hmmV26.train(candles.slice(Math.max(0, i - 200), i), 5);
                lastHMMTrain = candleTime;
            }

            // HMM prediction
            const hmmPrediction = hmmV26.isTrained
                ? hmmV26.predictState(candles.slice(Math.max(0, i - 20), i))
                : null;

            // Turtle signal
            const turtleSignalV26 = turtleV26.onCandle(
                candle,
                candles.slice(Math.max(0, i - 100), i),
                !!activePositionV26,
                activePositionV26,
                balanceV26,
                hmmPrediction
            );

            // ENTRADA v2.6: Turtle + HMM filter
            if (!activePositionV26 && turtleSignalV26 && hmmPrediction) {
                if (
                    turtleSignalV26.action === 'BUY' &&
                    (hmmPrediction.label.includes('ALCISTA') || hmmPrediction.label.includes('ACUMULACIÓN') || hmmPrediction.label.includes('VOLÁTIL ALCISTA'))
                ) {
                    const entryPrice = close;
                    const leverage = 2;
                    activePositionV26 = {
                        entryPrice: entryPrice,
                        amount: (balanceV26 * leverage * 0.98) / entryPrice,
                        target: turtleSignalV26.target || (entryPrice * 1.5),
                        stopLoss: turtleSignalV26.stopLoss || (entryPrice * 0.95),
                        entryTime: candleTime
                    };
                    balanceV26 -= activePositionV26.amount * entryPrice * 0.0005;
                }
            }

            // SALIDA v2.6
            if (activePositionV26) {
                if (close >= activePositionV26.target || (turtleSignalV26 && turtleSignalV26.action === 'SELL')) {
                    const exitPrice = close;
                    const pnl = (exitPrice - activePositionV26.entryPrice) / activePositionV26.entryPrice;
                    const commission = (activePositionV26.amount * exitPrice) * 0.0005;
                    balanceV26 += (activePositionV26.amount * activePositionV26.entryPrice * pnl) - commission;

                    tradesV26.push({
                        pnl: pnl * 100,
                        success: pnl > 0,
                        duration: (candleTime - activePositionV26.entryTime) / (24 * 60 * 60 * 1000)
                    });
                    activePositionV26 = null;
                } else if (close <= activePositionV26.stopLoss) {
                    const exitPrice = close;
                    const pnl = (exitPrice - activePositionV26.entryPrice) / activePositionV26.entryPrice;
                    const commission = (activePositionV26.amount * exitPrice) * 0.0005;
                    balanceV26 += (activePositionV26.amount * activePositionV26.entryPrice * pnl) - commission;

                    tradesV26.push({
                        pnl: pnl * 100,
                        success: false,
                        duration: (candleTime - activePositionV26.entryTime) / (24 * 60 * 60 * 1000)
                    });
                    activePositionV26 = null;
                }
            }

            const equityV26 = balanceV26 + (activePositionV26 ? activePositionV26.amount * (close - activePositionV26.entryPrice) : 0);
            if (equityV26 > peakV26) peakV26 = equityV26;
            const ddV26 = (peakV26 - equityV26) / Math.max(peakV26, 1);
            if (ddV26 > maxDDV26) maxDDV26 = ddV26;

            dailyReturnsV26.push(equityV26);
        }

        // ═══════════════════════════════════════════════════════════════════════
        // CÁLCULO DE MÉTRICAS
        // ═══════════════════════════════════════════════════════════════════════

        const calcMetrics = (balance, trades, dailyReturns) => {
            const roi = ((balance - initialBalance) / initialBalance) * 100;
            const wins = trades.filter(t => t.success).length;
            const winRate = (wins / (trades.length || 1)) * 100;

            const returns = [];
            for (let i = 1; i < dailyReturns.length; i++) {
                if (dailyReturns[i - 1] > 0) {
                    returns.push((dailyReturns[i] / dailyReturns[i - 1]) - 1);
                }
            }
            const avgReturn = returns.length > 0 ? returns.reduce((a, b) => a + b) / returns.length : 0;
            const variance = returns.reduce((a, b) => a + Math.pow(b - avgReturn, 2), 0) / (returns.length || 1);
            const sharpe = Math.sqrt(variance) > 0 ? (avgReturn / Math.sqrt(variance)) * Math.sqrt(252) : 0;

            const grossProfit = trades.filter(t => t.pnl > 0).reduce((a, b) => a + b.pnl, 0);
            const grossLoss = Math.abs(trades.filter(t => t.pnl < 0).reduce((a, b) => a + b.pnl, 0)) || 1;
            const profitFactor = grossProfit / Math.max(grossLoss, 0.001);

            return { roi, winRate, sharpe, profitFactor };
        };

        const metricsV25 = calcMetrics(balanceV25, tradesV25, dailyReturnsV25);
        const metricsV26 = calcMetrics(balanceV26, tradesV26, dailyReturnsV26);

        // ═══════════════════════════════════════════════════════════════════════
        // REPORTE FINAL
        // ═══════════════════════════════════════════════════════════════════════

        logger.info(`\n${'='.repeat(80)}`);
        logger.info(`📊 RESULTADOS FINALES: v2.5 vs v2.6`);
        logger.info(`${'='.repeat(80)}\n`);

        console.log(`\n${'█'.repeat(80)}`);
        console.log(`COMPARATIVA CRÍTICA - v2.5 (TURTLE PURO) vs v2.6 (TURTLE + HMM)`);
        console.log(`${'█'.repeat(80)}\n`);

        console.log(`📊 MÉTRICA                  v2.5 (Puro)      v2.6 (HMM)       GANADOR`);
        console.log(`${'─'.repeat(80)}`);
        console.log(`ROI:                        ${metricsV25.roi.toFixed(2)}%          ${metricsV26.roi.toFixed(2)}%          ${metricsV26.roi > metricsV25.roi ? '✅ v2.6' : '❌ v2.5'}`);
        console.log(`Win Rate:                   ${metricsV25.winRate.toFixed(1)}%          ${metricsV26.winRate.toFixed(1)}%          ${metricsV26.winRate > metricsV25.winRate ? '✅ v2.6' : '❌ v2.5'}`);
        console.log(`Sharpe Ratio:               ${metricsV25.sharpe.toFixed(2)}            ${metricsV26.sharpe.toFixed(2)}            ${metricsV26.sharpe > metricsV25.sharpe ? '✅ v2.6' : '❌ v2.5'}`);
        console.log(`Profit Factor:              ${metricsV25.profitFactor.toFixed(2)}            ${metricsV26.profitFactor.toFixed(2)}            ${metricsV26.profitFactor > metricsV25.profitFactor ? '✅ v2.6' : '❌ v2.5'}`);
        console.log(`Trades Ejecutados:          ${tradesV25.length}              ${tradesV26.length}              ${tradesV26.length !== tradesV25.length ? '⚠️ Diferente' : '✅ Igual'}`);
        console.log(`Max Drawdown:               ${(maxDDV25 * 100).toFixed(2)}%         ${(maxDDV26 * 100).toFixed(2)}%         ${maxDDV26 < maxDDV25 ? '✅ v2.6' : '❌ v2.5'}`);
        console.log(`${'─'.repeat(80)}\n`);

        // Cálculo de mejora
        const roiImprovement = metricsV25.roi === 0 ? 0 : ((metricsV26.roi - metricsV25.roi) / Math.abs(metricsV25.roi)) * 100;
        const winRateImprovement = metricsV26.winRate - metricsV25.winRate;

        console.log(`🎯 ANÁLISIS DE MEJORA:\n`);
        console.log(`ROI Improvement:            ${roiImprovement > 0 ? '+' : ''}${roiImprovement.toFixed(1)}%`);
        console.log(`Win Rate Delta:             ${winRateImprovement > 0 ? '+' : ''}${winRateImprovement.toFixed(1)} puntos`);
        console.log(`Drawdown Reduction:         ${((maxDDV25 - maxDDV26) * 100).toFixed(2)} puntos\n`);

        // Veredicto
        const v26Wins =
            (metricsV26.roi > metricsV25.roi ? 1 : 0) +
            (metricsV26.winRate > metricsV25.winRate ? 1 : 0) +
            (metricsV26.sharpe > metricsV25.sharpe ? 1 : 0) +
            (metricsV26.profitFactor > metricsV25.profitFactor ? 1 : 0) +
            (maxDDV26 < maxDDV25 ? 1 : 0);

        let verdict = '';
        if (v26Wins >= 4) {
            verdict = '✅✅ v2.6 ES CLARAMENTE SUPERIOR (HMM agrega valor significativo)';
        } else if (v26Wins >= 3) {
            verdict = '✅ v2.6 es mejor (HMM agrega valor)';
        } else if (v26Wins === 2) {
            verdict = '⚠️ Resultado mixto (HMM tiene pros y contras)';
        } else {
            verdict = '❌ v2.5 es mejor (HMM no ayuda)';
        }

        console.log(`${'█'.repeat(80)}`);
        console.log(`VEREDICTO FINAL: ${verdict}`);
        console.log(`${'█'.repeat(80)}\n`);

        // Guardar resultados
        const results = {
            test: 'TEST 3: Comparativa v2.5 vs v2.6',
            symbol: symbol,
            timeframe: timeframe,
            period: period,

            v25_turtle_pure: {
                roi: metricsV25.roi.toFixed(2),
                winRate: metricsV25.winRate.toFixed(1),
                sharpe: metricsV25.sharpe.toFixed(2),
                profitFactor: metricsV25.profitFactor.toFixed(2),
                trades: tradesV25.length,
                maxDrawdown: (maxDDV25 * 100).toFixed(2),
                finalBalance: balanceV25.toFixed(2)
            },

            v26_turtle_hmm: {
                roi: metricsV26.roi.toFixed(2),
                winRate: metricsV26.winRate.toFixed(1),
                sharpe: metricsV26.sharpe.toFixed(2),
                profitFactor: metricsV26.profitFactor.toFixed(2),
                trades: tradesV26.length,
                maxDrawdown: (maxDDV26 * 100).toFixed(2),
                finalBalance: balanceV26.toFixed(2)
            },

            improvement: {
                roiDelta: `${roiImprovement > 0 ? '+' : ''}${roiImprovement.toFixed(1)}%`,
                winRateDelta: `${winRateImprovement > 0 ? '+' : ''}${winRateImprovement.toFixed(1)} puntos`,
                drawdownReduction: `${((maxDDV25 - maxDDV26) * 100).toFixed(2)} puntos`,
                metricsV26WinsCount: v26Wins
            },

            conclusion: {
                verdict: verdict,
                recommendation: v26Wins >= 3
                    ? '✅ PROCEDER A DINERO REAL (v2.6 validada científicamente)'
                    : v26Wins >= 2
                        ? '⚠️ INVESTIGAR MÁS (resultados mixtos)'
                        : '❌ REVISAR ARQUITECTURA (v2.5 mejor)',
                nextStep: v26Wins >= 3
                    ? 'TEST 4 (Multi-pair) → Paper Trading → Dinero Real (Marzo)'
                    : 'Debug TEST 3 - comparativa antes de continuar'
            },

            timestamp: new Date().toISOString(),
            executionTime: ((Date.now() - startTime) / 1000).toFixed(0) + ' segundos'
        };

        const outputFile = 'test_3_comparativa_v2_5_vs_v2_6.json';
        fs.writeFileSync(outputFile, JSON.stringify(results, null, 2));

        logger.info(`✅ Resultados guardados en: ${outputFile}`);
        logger.info(`⏱️  Tiempo total: ${results.executionTime}s\n`);
        logger.info(`${'='.repeat(80)}\n`);

    } catch (error) {
        logger.error(`❌ Error en TEST 3: ${error.message}`);
        logger.error(error.stack);
        process.exit(1);
    }
}

// Ejecutar
runTest3Comparativa().then(() => {
    logger.info('✅ TEST 3 COMPLETADO EXITOSAMENTE');
    process.exit(0);
}).catch(error => {
    logger.error(`Fatal error: ${error.message}`);
    process.exit(1);
});
