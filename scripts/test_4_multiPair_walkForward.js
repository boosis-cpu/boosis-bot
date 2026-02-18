#!/usr/bin/env node

/**
 * 🏆 TEST 4: MULTI-PAIR + WALK-FORWARD VALIDATION
 * 
 * BREVE Y SÓLIDO
 * 
 * Valida:
 * 1. ¿Sistema +280% BTC se replica en ETH/SOL?
 * 2. ¿Es robusto en diferentes períodos?
 */

require('dotenv').config();

const db = require('../src/core/database');
const logger = require('../src/core/logger');
const DataMiner = require('../src/core/data_miner');
const HMMEngine = require('../src/core/hmm-engine');
const TurtleStrategy = require('../src/strategies/TurtleStrategy');
const fs = require('fs');

async function runTest4MultiPair() {
    const symbols = ['BTCUSDT', 'ETHUSDT', 'SOLUSDT'];
    const timeframe = '1d';
    const period = '5y';
    const days = 365 * 5;
    const startTime = Date.now();

    logger.info(`\n${'='.repeat(80)}`);
    logger.info(`🏆 TEST 4: MULTI-PAIR VALIDATION + WALK-FORWARD`);
    logger.info(`${'='.repeat(80)}`);
    logger.info(`\nSymbols: ${symbols.join(', ')}`);
    logger.info(`Timeframe: ${timeframe}`);
    logger.info(`Período: ${period}\n`);

    const results = {};

    try {
        await db.init();
        logger.info(`✅ Database inicializada\n`);

        // ═══════════════════════════════════════════════════════════════════════
        // TEST 4A: MULTI-PAIR STANDARD (5 AÑOS)
        // ═══════════════════════════════════════════════════════════════════════

        logger.info(`${'='.repeat(80)}`);
        logger.info(`TEST 4A: MULTI-PAIR STANDARD (5 años)`);
        logger.info(`${'='.repeat(80)}\n`);

        for (const symbol of symbols) {
            logger.info(`\n[${symbol}] Procesando...`);

            // Cargar datos
            const existingCount = await db.pool.query(
                'SELECT COUNT(*) FROM candles WHERE symbol = $1 AND timeframe = $2',
                [symbol, timeframe]
            );
            const count = parseInt(existingCount.rows[0]?.count || 0);

            if (count < days * 0.8) {
                logger.info(`  Sincronizando ${symbol}...`);
                await DataMiner.mineToDatabase(symbol, timeframe, days);
            }

            const candles = await db.getRecentCandles(symbol, 100000, timeframe);
            logger.info(`  Cargadas ${candles.length} velas`);

            if (candles.length < 100) {
                logger.warn(`  ${symbol}: Datos insuficientes`);
                results[symbol] = { error: 'Datos insuficientes' };
                continue;
            }

            // HMM + Turtle
            const hmm = new HMMEngine(8);
            const turtle = new TurtleStrategy(20, 10, 55, 20);

            const trainData = candles.slice(0, Math.min(500, candles.length));
            await hmm.train(trainData, 10);

            // Simulación
            let balance = 10000;
            let peak = balance;
            let maxDD = 0;
            const trades = [];
            let activePosition = null;
            let lastHMMTrain = parseInt(candles[0][0]);
            const hmmUpdateInterval = 30 * 24 * 60 * 60 * 1000;

            const totalSteps = candles.length;
            const progressStep = Math.max(1, Math.floor(totalSteps / 10));

            for (let i = 100; i < candles.length; i++) {
                if (i % progressStep === 0) {
                    const percent = ((i / totalSteps) * 100).toFixed(0);
                    logger.info(`  [${symbol}] ${percent}%`);
                }

                const candle = candles[i];
                const candleTime = parseInt(candle[0]);
                const close = parseFloat(candle[4]);

                if (candleTime - lastHMMTrain > hmmUpdateInterval) {
                    await hmm.train(candles.slice(Math.max(0, i - 100), i), 5);
                    lastHMMTrain = candleTime;
                }

                const hmmPrediction = hmm.isTrained
                    ? hmm.predictState(candles.slice(Math.max(0, i - 20), i))
                    : null;

                const turtleSignal = turtle.onCandle(
                    candle,
                    candles.slice(Math.max(0, i - 100), i),
                    !!activePosition,
                    activePosition,
                    balance,
                    hmmPrediction
                );

                // Entrada
                if (!activePosition && turtleSignal && hmmPrediction) {
                    if (
                        turtleSignal.action === 'BUY' &&
                        (hmmPrediction.label.includes('ALCISTA') || hmmPrediction.label.includes('ACUMULACIÓN') || hmmPrediction.label.includes('VOLÁTIL ALCISTA'))
                    ) {
                        const entryPrice = close;
                        const leverage = 2;
                        activePosition = {
                            entryPrice: entryPrice,
                            amount: (balance * leverage * 0.98) / entryPrice,
                            target: turtleSignal.target || (entryPrice * 1.5),
                            stopLoss: turtleSignal.stopLoss || (entryPrice * 0.95),
                            entryTime: candleTime
                        };
                        balance -= activePosition.amount * entryPrice * 0.0005;
                    }
                }

                // Salida
                if (activePosition) {
                    if (close >= activePosition.target || (turtleSignal && turtleSignal.action === 'SELL')) {
                        const exitPrice = close;
                        const pnl = (exitPrice - activePosition.entryPrice) / activePosition.entryPrice;
                        const commission = (activePosition.amount * exitPrice) * 0.0005;
                        balance += (activePosition.amount * activePosition.entryPrice * pnl) - commission;
                        trades.push({
                            pnl: pnl * 100,
                            success: pnl > 0,
                            duration: (candleTime - activePosition.entryTime) / (24 * 60 * 60 * 1000)
                        });
                        activePosition = null;
                    } else if (close <= activePosition.stopLoss) {
                        const exitPrice = close;
                        const pnl = (exitPrice - activePosition.entryPrice) / activePosition.entryPrice;
                        const commission = (activePosition.amount * exitPrice) * 0.0005;
                        balance += (activePosition.amount * activePosition.entryPrice * pnl) - commission;
                        trades.push({
                            pnl: pnl * 100,
                            success: false,
                            duration: (candleTime - activePosition.entryTime) / (24 * 60 * 60 * 1000)
                        });
                        activePosition = null;
                    }
                }

                const equity = balance + (activePosition ? activePosition.amount * (close - activePosition.entryPrice) : 0);
                if (equity > peak) peak = equity;
                const dd = (peak - equity) / Math.max(peak, 1);
                if (dd > maxDD) maxDD = dd;
            }

            // Métricas
            const roi = ((balance - 10000) / 10000) * 100;
            const wins = trades.filter(t => t.success).length;
            const winRate = (wins / (trades.length || 1)) * 100;
            const grossProfit = trades.filter(t => t.pnl > 0).reduce((a, b) => a + b.pnl, 0);
            const grossLoss = Math.abs(trades.filter(t => t.pnl < 0).reduce((a, b) => a + b.pnl, 0)) || 1;
            const profitFactor = grossProfit / Math.max(grossLoss, 0.001);

            results[symbol] = {
                roi: roi.toFixed(2),
                trades: trades.length,
                winRate: winRate.toFixed(1),
                maxDrawdown: (maxDD * 100).toFixed(2),
                profitFactor: profitFactor.toFixed(2),
                finalBalance: balance.toFixed(2)
            };

            logger.info(`  ✅ ROI: ${roi.toFixed(2)}% | Trades: ${trades.length} | WR: ${winRate.toFixed(1)}%\n`);
        }

        // ═══════════════════════════════════════════════════════════════════════
        // TEST 4B: WALK-FORWARD (Dividiendo el histórico en dos)
        // ═══════════════════════════════════════════════════════════════════════

        logger.info(`\n${'='.repeat(80)}`);
        logger.info(`TEST 4B: WALK-FORWARD VALIDATION (Robustez)`);
        logger.info(`${'='.repeat(80)}\n`);

        const walkForwardResults = {};

        for (const symbol of ['BTCUSDT']) {
            logger.info(`[${symbol}] Walk-Forward Analysis...`);

            const candles = await db.getRecentCandles(symbol, 100000, timeframe);
            if (candles.length < 100) continue;

            const midPoint = Math.floor(candles.length / 2);
            const period1 = candles.slice(0, midPoint);
            const period2 = candles.slice(midPoint);

            for (const [periodName, periodCandles] of [['Period 1', period1], ['Period 2', period2]]) {
                const hmm = new HMMEngine(8);
                const turtle = new TurtleStrategy(20, 10, 55, 20);

                const trainData = periodCandles.slice(0, Math.min(500, periodCandles.length));
                await hmm.train(trainData, 10);

                let balance = 10000;
                let peak = balance;
                let maxDD = 0;
                const trades = [];
                let activePosition = null;
                let lastHMMTrain = parseInt(periodCandles[0][0]);
                const hmmUpdateInterval = 30 * 24 * 60 * 60 * 1000;

                for (let i = 100; i < periodCandles.length; i++) {
                    const candle = periodCandles[i];
                    const candleTime = parseInt(candle[0]);
                    const close = parseFloat(candle[4]);

                    if (candleTime - lastHMMTrain > hmmUpdateInterval) {
                        await hmm.train(periodCandles.slice(Math.max(0, i - 100), i), 5);
                        lastHMMTrain = candleTime;
                    }

                    const hmmPrediction = hmm.isTrained
                        ? hmm.predictState(periodCandles.slice(Math.max(0, i - 20), i))
                        : null;

                    const turtleSignal = turtle.onCandle(
                        candle,
                        periodCandles.slice(Math.max(0, i - 100), i),
                        !!activePosition,
                        activePosition,
                        balance,
                        hmmPrediction
                    );

                    if (!activePosition && turtleSignal && hmmPrediction) {
                        if (
                            turtleSignal.action === 'BUY' &&
                            (hmmPrediction.label.includes('ALCISTA') || hmmPrediction.label.includes('ACUMULACIÓN') || hmmPrediction.label.includes('VOLÁTIL ALCISTA'))
                        ) {
                            const entryPrice = close;
                            const leverage = 2;
                            activePosition = {
                                entryPrice: entryPrice,
                                amount: (balance * leverage * 0.98) / entryPrice,
                                target: turtleSignal.target || (entryPrice * 1.5),
                                stopLoss: turtleSignal.stopLoss || (entryPrice * 0.95),
                                entryTime: candleTime
                            };
                            balance -= activePosition.amount * entryPrice * 0.0005;
                        }
                    }

                    if (activePosition) {
                        if (close >= activePosition.target || (turtleSignal && turtleSignal.action === 'SELL')) {
                            const exitPrice = close;
                            const pnl = (exitPrice - activePosition.entryPrice) / activePosition.entryPrice;
                            const commission = (activePosition.amount * exitPrice) * 0.0005;
                            balance += (activePosition.amount * activePosition.entryPrice * pnl) - commission;
                            trades.push({ pnl: pnl * 100, success: pnl > 0 });
                            activePosition = null;
                        } else if (close <= activePosition.stopLoss) {
                            const exitPrice = close;
                            const pnl = (exitPrice - activePosition.entryPrice) / activePosition.entryPrice;
                            const commission = (activePosition.amount * exitPrice) * 0.0005;
                            balance += (activePosition.amount * activePosition.entryPrice * pnl) - commission;
                            trades.push({ pnl: pnl * 100, success: false });
                            activePosition = null;
                        }
                    }

                    const equity = balance + (activePosition ? activePosition.amount * (close - activePosition.entryPrice) : 0);
                    if (equity > peak) peak = equity;
                    const dd = (peak - equity) / Math.max(peak, 1);
                    if (dd > maxDD) maxDD = dd;
                }

                const roi = ((balance - 10000) / 10000) * 100;
                const wins = trades.filter(t => t.success).length;
                const winRate = (wins / (trades.length || 1)) * 100;

                walkForwardResults[periodName] = {
                    roi: roi.toFixed(2),
                    trades: trades.length,
                    winRate: winRate.toFixed(1),
                    maxDrawdown: (maxDD * 100).toFixed(2)
                };

                logger.info(`  ${periodName}: ROI ${roi.toFixed(2)}% | ${trades.length} trades\n`);
            }
        }

        // ═══════════════════════════════════════════════════════════════════════
        // REPORTE FINAL
        // ═══════════════════════════════════════════════════════════════════════

        logger.info(`\n${'='.repeat(80)}`);
        logger.info(`📊 RESULTADOS TEST 4`);
        logger.info(`${'='.repeat(80)}\n`);

        console.log(`\n${'█'.repeat(80)}`);
        console.log(`TEST 4A: MULTI-PAIR (5 AÑOS)`);
        console.log(`${'█'.repeat(80)}\n`);

        console.log(`Symbol      ROI         Trades      Win Rate    Drawdown    Status`);
        console.log(`${'─'.repeat(80)}`);
        for (const [symbol, data] of Object.entries(results)) {
            const status = parseFloat(data.roi) > 100 ? '✅ EXCELENTE' : parseFloat(data.roi) > 50 ? '✅ BUENO' : '⚠️ MARGINAL';
            console.log(`${symbol.padEnd(11)} ${data.roi.padEnd(11)} ${data.trades.toString().padEnd(10)} ${data.winRate.padEnd(11)} ${data.maxDrawdown.padEnd(11)} ${status}`);
        }

        console.log(`\n${'█'.repeat(80)}`);
        console.log(`TEST 4B: WALK-FORWARD VALIDATION`);
        console.log(`${'█'.repeat(80)}\n`);

        for (const [period, data] of Object.entries(walkForwardResults)) {
            console.log(`${period.padEnd(15)}: ROI ${data.roi.padEnd(10)} | ${data.trades.toString().padEnd(5)} trades | WR ${data.winRate}%`);
        }

        const btcMulti = results['BTCUSDT'] ? parseFloat(results['BTCUSDT'].roi) : 0;
        const ethMulti = results['ETHUSDT'] ? parseFloat(results['ETHUSDT'].roi) : 0;
        const solMulti = results['SOLUSDT'] ? parseFloat(results['SOLUSDT'].roi) : 0;

        const allPositive = btcMulti > 50 && ethMulti > 50 && solMulti > 50;
        const p1 = walkForwardResults['Period 1'] ? parseFloat(walkForwardResults['Period 1'].roi) : 0;
        const p2 = walkForwardResults['Period 2'] ? parseFloat(walkForwardResults['Period 2'].roi) : 0;

        const consistente = p1 > 20 && p2 > 20;

        console.log(`\n${'█'.repeat(80)}`);
        if (allPositive && consistente) {
            console.log(`✅✅ SISTEMA VALIDADO: Multi-pair + Robusto en diferentes períodos`);
        } else if (allPositive) {
            console.log(`✅ SISTEMA VIABLE: Multi-pair ganador, walk-forward mixto`);
        } else {
            console.log(`⚠️ VALIDACIÓN PARCIAL: Necesita revisión de activos específicos`);
        }
        console.log(`${'█'.repeat(80)}\n`);

        const finalResults = {
            test: 'TEST 4: Multi-pair + Walk-Forward',
            multiPair: results,
            walkForward: walkForwardResults,
            timestamp: new Date().toISOString()
        };

        fs.writeFileSync('test_4_multiPair_walkForward.json', JSON.stringify(finalResults, null, 2));
        logger.info(`✅ Resultados: test_4_multiPair_walkForward.json`);
        logger.info(`⏱️  Tiempo total: ${((Date.now() - startTime) / 1000).toFixed(0)}s\n`);

    } catch (error) {
        logger.error(`❌ Error: ${error.message}`);
        process.exit(1);
    }
}

runTest4MultiPair().then(() => {
    logger.info('✅ TEST 4 COMPLETADO');
    process.exit(0);
}).catch(error => {
    logger.error(`Fatal: ${error.message}`);
    process.exit(1);
});
