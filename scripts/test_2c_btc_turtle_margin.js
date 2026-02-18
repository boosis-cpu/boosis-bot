#!/usr/bin/env node

/**
 * 🚀 TEST 2C: TURTLE STRATEGY EN BTCUSDT CON MARGIN
 * 
 * PROPÓSITO:
 * Validar si TEST 2B falló por comisión Spot (0.1%) o por estrategia
 * 
 * CAMBIOS vs TEST 2B:
 * - Symbol: EURUSD → BTCUSDT
 * - Mode: MARGIN/FUTURES (comisión 0.025% vs 0.1% Spot)
 * - Timeframe: 1H (igual)
 * - Strategy: Turtle (igual)
 * 
 * HIPÓTESIS:
 * Si ROI pasa de -0.56% (TEST 2B) a +5-10%
 * → Problema fue comisión, no estrategia
 * → Turtle + HMM es GANADOR
 * 
 * EJECUCIÓN:
 * node scripts/test_2c_btc_turtle_margin.js
 */

require('dotenv').config();

const db = require('../src/core/database');
const logger = require('../src/core/logger');
const DataMiner = require('../src/core/data_miner');
const HMMEngine = require('../src/core/hmm-engine');
const TurtleStrategy = require('../src/strategies/TurtleStrategy');
const fs = require('fs');

async function runTest2CTurtleMargin() {
    const symbol = 'BTCUSDT';
    const timeframe = '1h';
    const period = '1y';
    const days = 365;
    const tradingMode = 'MARGIN';  // CAMBIO: MARGIN en lugar de SPOT
    const commissionRate = 0.00025; // CAMBIO: 0.025% vs 0.1% Spot
    const startTime = Date.now();

    logger.info(`\n${'='.repeat(70)}`);
    logger.info(`🚀 TEST 2C: TURTLE BTCUSDT CON MARGIN`);
    logger.info(`${'='.repeat(70)}`);
    logger.info(`Symbol: ${symbol}`);
    logger.info(`Timeframe: ${timeframe}`);
    logger.info(`Período: ${period} (${days} días)`);
    logger.info(`Trading Mode: ${tradingMode}`);
    logger.info(`Commission: ${(commissionRate * 100).toFixed(3)}% (vs 0.1% Spot)`);
    logger.info(`Estrategia: Turtle (Donchian) + HMM Filter`);
    logger.info(`${'='.repeat(70)}\n`);

    try {
        // INIT Database
        await db.init();
        logger.info(`✅ Database inicializada`);

        // Cargar datos BTC 1H (pueden ser 1m agregados o 1h directamente si existen)
        // Usamos el DataMiner si faltan datos
        const existingCount = await db.pool.query(
            'SELECT COUNT(*) FROM candles WHERE symbol = $1',
            [symbol]
        );
        const count = parseInt(existingCount.rows[0].count);

        const expectedCandles = days * 24;  // 1H = 24 velas/día

        if (count < expectedCandles * 0.9) {
            logger.info(`[DataMiner] Sincronizando ${symbol} en ${timeframe}...`);
            await DataMiner.mineToDatabase(symbol, timeframe, days);
        } else {
            logger.info(`[DB] Usando ${count} candles existentes`);
        }

        // Cargar candles (1m)
        let rawCandles = await db.getRecentCandles(symbol, 500000);
        logger.info(`📊 Cargadas ${rawCandles.length} velas de 1m. Agregando a 1H...`);

        // AGREGACIÓN A 1H
        let candles = [];
        for (let i = 0; i < rawCandles.length; i += 60) {
            const batch = rawCandles.slice(i, i + 60);
            if (batch.length < 60) break;

            const open = parseFloat(batch[0][1]);
            const high = Math.max(...batch.map(c => parseFloat(c[2])));
            const low = Math.min(...batch.map(c => parseFloat(c[3])));
            const close = parseFloat(batch[batch.length - 1][4]);
            const volume = batch.reduce((sum, c) => sum + parseFloat(c[5]), 0);

            candles.push([
                batch[0][0], // open_time
                open, high, low, close, volume,
                batch[batch.length - 1][6] // close_time
            ]);
        }

        logger.info(`📈 Simulación con ${candles.length} velas de 1H\n`);

        if (candles.length < 500) {
            throw new Error('Datos insuficientes para Turtle (necesita al menos 500 velas de 1H)');
        }

        // ═══════════════════════════════════════════════════════════
        // INICIALIZACIÓN: HMM + Turtle
        // ═══════════════════════════════════════════════════════════

        const hmm = new HMMEngine(8);

        // Turtle Strategy
        // S1, ExitS1, S2, ExitS2
        const turtle = new TurtleStrategy(20, 10, 55, 20);

        // Entrenamiento HMM
        logger.info(`🧠 Entrenando HMM (8 estados)...`);
        const trainData = candles.slice(0, Math.min(500, candles.length));
        await hmm.train(trainData, 10);
        logger.info(`✅ HMM entrenado\n`);

        // ═══════════════════════════════════════════════════════════
        // SIMULACIÓN TURTLE CON MARGIN
        // ═══════════════════════════════════════════════════════════

        let balance = 10000;
        const initialBalance = balance;
        let peak = balance;
        let maxDD = 0;

        const trades = [];
        const dailyReturns = [balance];

        let activePosition = null;
        let lastHMMTrain = parseInt(candles[0][0]);
        const hmmUpdateInterval = 4 * 60 * 60 * 1000;

        const totalSteps = candles.length;
        const progressStep = Math.floor(totalSteps / 20);

        logger.info(`🚀 INICIANDO SIMULACIÓN MARGIN...\n`);

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

            // Entrenar HMM cada 4 horas
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
                balance,
                hmmPrediction
            );

            // ═════════════════════════════════════════════════════════════
            // LÓGICA: Turtle + HMM confirmation (Simulación Margen)
            // ═════════════════════════════════════════════════════════════

            // SALIDA: Primero procesamos salidas
            if (activePosition) {
                if (turtleSignal && turtleSignal.action === 'SELL') {
                    const exitPrice = close;
                    const pnl = (exitPrice - activePosition.entryPrice) / activePosition.entryPrice;
                    const grossProfit = (activePosition.amount * activePosition.entryPrice) * pnl;
                    const commission = (activePosition.amount * exitPrice) * commissionRate;

                    balance += (grossProfit - commission);
                    const gain = pnl * 100;

                    trades.push({
                        strategy: 'TURTLE',
                        entry: activePosition.entryPrice,
                        exit: exitPrice,
                        pnl: gain - (commissionRate * 100 * 2), // Net approx
                        success: gain > 0,
                        durationHours: (candleTime - activePosition.entryTime) / 3600000,
                        leverage: activePosition.leverage,
                        reason: 'STRATEGY_EXIT'
                    });

                    logger.info(`[${symbol}] 🟠 SALIDA: ${gain.toFixed(2)}% | Net Bal: $${balance.toFixed(2)} [${new Date(candleTime).toISOString()}]`);
                    activePosition = null;

                } else if (close <= activePosition.stopLoss) {
                    const exitPrice = close;
                    const pnl = (exitPrice - activePosition.entryPrice) / activePosition.entryPrice;
                    const grossLoss = (activePosition.amount * activePosition.entryPrice) * pnl;
                    const commission = (activePosition.amount * exitPrice) * commissionRate;

                    balance += (grossLoss - commission);
                    const loss = pnl * 100;

                    trades.push({
                        strategy: 'TURTLE',
                        entry: activePosition.entryPrice,
                        exit: exitPrice,
                        pnl: loss - (commissionRate * 100 * 2),
                        success: false,
                        durationHours: (candleTime - activePosition.entryTime) / 3600000,
                        leverage: activePosition.leverage,
                        reason: 'STOP_LOSS'
                    });

                    logger.info(`[${symbol}] 🔴 STOP LOSS: ${loss.toFixed(2)}% | Net Bal: $${balance.toFixed(2)} [${new Date(candleTime).toISOString()}]`);
                    activePosition = null;
                }
            }

            // ENTRADA: Luego procesamos entradas
            if (!activePosition && turtleSignal && hmmPrediction) {
                if (
                    turtleSignal.action === 'BUY' &&
                    (hmmPrediction.label.includes('ALCISTA') || hmmPrediction.label.includes('ACUMULACIÓN'))
                ) {
                    const entryPrice = close;
                    const leverage = 2; // Apalancamiento ficticio para simulación margen
                    const commission = (balance * leverage * 0.98) * commissionRate;

                    const position = {
                        entryPrice: entryPrice,
                        amount: (balance * leverage * 0.98) / entryPrice,
                        strategy: 'TURTLE',
                        leverage: leverage,
                        target: turtleSignal.target,
                        stopLoss: turtleSignal.stopLoss,
                        entryTime: candleTime
                    };

                    activePosition = position;
                    balance -= commission;

                    logger.info(`[${symbol}] 🐢 ENTRADA MARGIN (${leverage}x): ${entryPrice.toFixed(2)} [${new Date(candleTime).toISOString()}]`);
                }
            }

            // Track equity
            const currentEquity = balance + (activePosition ? (activePosition.amount * (close - activePosition.entryPrice)) : 0);
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
        logger.info(`📊 TEST 2C - TURTLE MARGIN RESULTADOS`);
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
            method: 'Turtle Strategy (MARGIN Simulation)',
            timeframe: timeframe,
            period: period,

            parameters: {
                s1_period: 20,
                s2_period: 55,
                atr_period: 20,
                leverage: 2,
                hmmStates: 8,
                tradingMode: tradingMode,
                commissionRate: (commissionRate * 100).toFixed(3) + '%'
            },

            comparison: {
                test2b_roi_spot_ref: '-0.56%',
                test2c_roi_margin: roi.toFixed(2) + '%',
                commission_difference: '0.075%',
                hypothesis: 'Comisión era el problema principal'
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
                finalBalance: balance.toFixed(2)
            },

            evaluation: {
                passed: roi > 5,
                hypothesis_confirmed: roi > 0,
                verdict:
                    roi > 10 ? '✅ EXCELENTE - Turtle en Margen es el camino' :
                        roi > 5 ? '✅ CONFIRMADO - Turtle + HMM FUNCIONA' :
                            roi > 0 ? '⚠️ POSITIVO MARGINAL' :
                                '❌ FALLÓ - La estrategia necesita revisión profunda',
                recommendation:
                    roi > 5 ? 'Turtle + HMM es ganador en MARGIN. Proceder a deployment.' :
                        'Analizar otros factores (volatilidad, SL/TP)'
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
        console.log(`Final Balance:      $${results.metrics.finalBalance}\n`);

        console.log(`🎯 VEREDICTO:       ${results.evaluation.verdict}`);
        console.log(`Hipótesis:          ${results.evaluation.hypothesis_confirmed ? '✅ CONFIRMADA' : '❌ RECHAZADA'}`);

        // Guardar
        const outputFile = 'test_2c_btc_turtle_margin.json';
        fs.writeFileSync(outputFile, JSON.stringify(results, null, 2));

        logger.info(`✅ Resultados guardados en: ${outputFile}`);
        logger.info(`⏱️  Tiempo total: ${results.executionTime}s`);
        logger.info(`${'='.repeat(70)}\n`);

    } catch (error) {
        logger.error(`❌ Error en TEST 2C: ${error.message}`);
        logger.error(error.stack);
        process.exit(1);
    }
}

// Ejecutar
runTest2CTurtleMargin().then(() => {
    logger.info('✅ TEST 2C completado');
    process.exit(0);
}).catch(error => {
    logger.error(`Fatal error: ${error.message}`);
    process.exit(1);
});
