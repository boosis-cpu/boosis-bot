#!/usr/bin/env node

/**
 * 🚀 TEST 2: PATTERN SCANNER PARA CRYPTO
 * 
 * Prueba la detección de patrones en BTCUSDT
 * Compara:
 * - HMM solo (baseline)
 * - HMM + Pattern Scanner (v2.6 mejorado)
 * 
 * EJECUCIÓN:
 * node scripts/test_2_pattern_scanner.js
 */

require('dotenv').config();

const db = require('../src/core/database');
const logger = require('../src/core/logger');
const DataMiner = require('../src/core/data_miner');
const PatternScanner = require('../src/core/pattern-scanner');
const HMMEngine = require('../src/core/hmm-engine');
const fs = require('fs');
const path = require('path');

async function runTest2() {
    const symbol = 'BTCUSDT';
    const period = '1y';
    const days = 365;

    logger.info(`\n${'='.repeat(60)}`);
    logger.info(`🚀 TEST 2: PATTERN SCANNER PARA CRYPTO`);
    logger.info(`${'='.repeat(60)}`);
    logger.info(`Symbol: ${symbol}`);
    logger.info(`Período: ${period} (${days} días)`);
    logger.info(`Tipo: HMM + Pattern Scanner`);
    logger.info(`${'='.repeat(60)}\n`);

    try {
        // INIT Database
        await db.init();
        logger.info(`✅ Database inicializada`);

        // Cargar o minar datos
        const existingCount = await db.pool.query(
            'SELECT COUNT(*) FROM candles WHERE symbol = $1',
            [symbol]
        );
        const count = parseInt(existingCount.rows[0].count);

        if (count < days * 1440 * 0.9) {
            logger.info(`[DataMiner] Sincronizando ${symbol}...`);
            await DataMiner.mineToDatabase(symbol, '1m', days);
        } else {
            logger.info(`[DB] Usando ${count} candles existentes`);
        }

        // Cargar velas
        const candles = await db.getRecentCandles(symbol, 3000000);
        logger.info(`📊 Cargadas ${candles.length} velas\n`);

        if (candles.length < 1000) {
            throw new Error('Datos insuficientes');
        }

        // ═════════════════════════════════════════════════════════════
        // SIMULACIÓN: HMM + Pattern Scanner
        // ═════════════════════════════════════════════════════════════

        const hmm = new HMMEngine(8);
        const patternScanner = new PatternScanner();

        // Entrenamiento inicial del HMM
        logger.info(`🧠 Entrenando HMM (8 estados)...`);
        const trainData = candles.slice(0, 1000);
        await hmm.train(trainData, 20);
        logger.info(`✅ HMM entrenado\n`);

        // Simulación
        let balance = 10000;
        const initialBalance = balance;
        let peak = balance;
        let maxDD = 0;

        const trades = [];
        const dailyReturns = [balance];
        const patterns = {
            detected: 0,
            bullish: 0,
            bearish: 0,
            byType: {}
        };

        let activePosition = null;
        let lastHMMTrain = parseInt(candles[0][0]);
        const hmmUpdateInterval = 60 * 60 * 1000; // 60 minutos

        const totalSteps = candles.length;
        const progressStep = Math.floor(totalSteps / 100);

        logger.info(`🚀 INICIANDO SIMULACIÓN...\n`);

        for (let i = 200; i < candles.length; i++) {
            // Progress bar
            if (i % progressStep === 0) {
                const percent = ((i / totalSteps) * 100).toFixed(0);
                logger.info(`[${symbol}] Progreso: ${percent}%`);
            }

            const candle = candles[i];
            const candleTime = parseInt(candle[0]);
            const close = parseFloat(candle[4]);

            // Entrenar HMM cada 60 minutos
            if (candleTime - lastHMMTrain > hmmUpdateInterval) {
                await hmm.train(candles.slice(Math.max(0, i - 1000), i), 10);
                lastHMMTrain = candleTime;
            }

            // Predicción HMM
            const hmmPrediction = hmm.isTrained
                ? hmm.predictState(candles.slice(Math.max(0, i - 20), i))
                : null;

            // Detección de patrones
            const patternSignal = patternScanner.detect(candle, candles.slice(Math.max(0, i - 100), i));

            // ═════════════════════════════════════════════════════════════
            // LÓGICA DE TRADING
            // ═════════════════════════════════════════════════════════════

            // ENTRADA: HMM alcista + Pattern bullish
            if (!activePosition && hmmPrediction && patternSignal) {
                if (
                    (hmmPrediction.label.includes('ALCISTA') || hmmPrediction.label.includes('ACUMULACIÓN')) &&
                    patternSignal.action === 'BUY' &&
                    patternSignal.confidence >= 0.65
                ) {
                    // ENTRADA
                    const entryPrice = close;
                    const position = {
                        entryPrice: entryPrice,
                        amount: (balance * 0.98) / entryPrice,
                        pattern: patternSignal.pattern,
                        patternConfidence: patternSignal.confidence,
                        target: patternSignal.target,
                        stopLoss: patternSignal.stopLoss
                    };

                    activePosition = position;
                    balance -= position.amount * entryPrice * 1.001; // Comisión

                    logger.info(`[${symbol}] 🟢 ENTRADA Pattern: ${patternSignal.pattern} (${(patternSignal.confidence * 100).toFixed(0)}%)`);
                    logger.info(`[${symbol}]    Precio: ${entryPrice.toFixed(2)} | Target: ${patternSignal.target.toFixed(2)} | Stop: ${patternSignal.stopLoss.toFixed(2)}`);

                    patterns.detected++;
                    patterns[patternSignal.action === 'BUY' ? 'bullish' : 'bearish']++;
                    patterns.byType[patternSignal.pattern] = (patterns.byType[patternSignal.pattern] || 0) + 1;
                }
            }

            // SALIDA: Target alcanzado o Stop Loss
            if (activePosition) {
                const pnl = (close - activePosition.entryPrice) / activePosition.entryPrice;
                const pnlValue = activePosition.amount * (close - activePosition.entryPrice);

                if (close >= activePosition.target) {
                    // Target alcanzado
                    balance += activePosition.amount * close * 0.999; // Comisión
                    const gain = (close / activePosition.entryPrice - 1) * 100;

                    logger.info(`[${symbol}] 🟡 CIERRE Target: ${activePosition.pattern} | Ganancia: ${gain.toFixed(2)}%`);

                    trades.push({
                        pattern: activePosition.pattern,
                        entry: activePosition.entryPrice,
                        exit: close,
                        pnl: gain,
                        success: true
                    });

                    activePosition = null;

                } else if (close <= activePosition.stopLoss) {
                    // Stop Loss
                    balance += activePosition.amount * close * 0.999;
                    const loss = (close / activePosition.entryPrice - 1) * 100;

                    logger.info(`[${symbol}] 🔴 STOP LOSS: ${activePosition.pattern} | Pérdida: ${loss.toFixed(2)}%`);

                    trades.push({
                        pattern: activePosition.pattern,
                        entry: activePosition.entryPrice,
                        exit: close,
                        pnl: loss,
                        success: false
                    });

                    activePosition = null;
                }
            }

            // Track de equity
            const currentEquity = balance + (activePosition ? activePosition.amount * close : 0);
            if (currentEquity > peak) peak = currentEquity;
            const dd = (peak - currentEquity) / peak;
            if (dd > maxDD) maxDD = dd;

            // Daily returns
            if (i % 1440 === 0) {
                dailyReturns.push(currentEquity);
            }
        }

        // ═════════════════════════════════════════════════════════════
        // CÁLCULO DE MÉTRICAS
        // ═════════════════════════════════════════════════════════════

        logger.info(`\n${'='.repeat(60)}`);
        logger.info(`📊 TEST 2 FINAL RESULTS`);
        logger.info(`${'='.repeat(60)}\n`);

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

        const results = {
            symbol: symbol,
            version: '2.6',
            method: 'HMM + Pattern Scanner',
            period: period,

            metrics: {
                totalTrades: trades.length,
                winRate: winRate.toFixed(1),
                roi: roi.toFixed(2),
                maxDrawdown: (maxDD * 100).toFixed(2),
                sharpeRatio: sharpe.toFixed(2),
                profitFactor: profitFactor.toFixed(2),
                avgReturn: avgReturn.toFixed(6),
                grossProfit: grossProfit.toFixed(2),
                grossLoss: grossLoss.toFixed(2),
                finalBalance: balance.toFixed(2)
            },

            patterns: {
                detected: patterns.detected,
                bullish: patterns.bullish,
                bearish: patterns.bearish,
                byType: patterns.byType
            },

            trades: trades.slice(-20) // Últimos 20 trades como muestra
        };

        console.log('\n📈 MÉTRICAS FINALES:\n');
        console.log(`Total Trades:      ${results.metrics.totalTrades}`);
        console.log(`Win Rate:          ${results.metrics.winRate}%`);
        console.log(`ROI:               ${results.metrics.roi}%`);
        console.log(`Max Drawdown:      ${results.metrics.maxDrawdown}%`);
        console.log(`Sharpe Ratio:      ${results.metrics.sharpeRatio}`);
        console.log(`Profit Factor:     ${results.metrics.profitFactor}`);
        console.log(`Final Balance:     $${results.metrics.finalBalance}\n`);

        console.log(`🎯 PATRONES DETECTADOS:\n`);
        console.log(`Total Patrones:    ${results.patterns.detected}`);
        console.log(`Bullish:           ${results.patterns.bullish}`);
        console.log(`Bearish:           ${results.patterns.bearish}`);
        console.log(`Por Tipo:`, results.patterns.byType, '\n');

        // Guardar resultados
        const outputFile = 'test_2_btc_pattern_scanner.json';
        fs.writeFileSync(outputFile, JSON.stringify(results, null, 2));

        logger.info(`✅ Resultados guardados en: ${outputFile}`);
        logger.info(`\n${'='.repeat(60)}`);

        if (roi > 5) {
            logger.info(`✅ TEST 2 PASÓ - ROI positivo: ${roi.toFixed(2)}%`);
        } else if (roi > 0) {
            logger.info(`⚠️  TEST 2 MARGINAL - ROI bajo: ${roi.toFixed(2)}%`);
        } else {
            logger.info(`❌ TEST 2 FALLÓ - ROI negativo: ${roi.toFixed(2)}%`);
        }

        logger.info(`${'='.repeat(60)}\n`);

    } catch (error) {
        logger.error(`❌ Error en TEST 2: ${error.message}`);
        logger.error(error.stack);
        process.exit(1);
    }
}

// Ejecutar
runTest2().then(() => {
    logger.info('✅ TEST 2 completado');
    process.exit(0);
}).catch(error => {
    logger.error(`Fatal error: ${error.message}`);
    process.exit(1);
});
