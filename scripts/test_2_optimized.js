#!/usr/bin/env node

/**
 * 🚀 TEST 2 OPTIMIZADO: PATTERN SCANNER PARA BTC
 * 
 * Cambios vs original:
 * - Período: 5 años → 1 año (15 min vs 60 min)
 * - Candles: 3M → 500k
 * - HMM iteraciones: 20 → 10
 * - Parámetros Pattern Scanner: AJUSTADOS
 * 
 * EJECUCIÓN:
 * node scripts/test_2_optimized.js
 */

require('dotenv').config();

const db = require('../src/core/database');
const logger = require('../src/core/logger');
const DataMiner = require('../src/core/data_miner');
const PatternScanner = require('../src/core/pattern-scanner');
const HMMEngine = require('../src/core/hmm-engine');
const fs = require('fs');

async function runTest2Optimized() {
    const symbol = 'BTCUSDT';
    const period = '1y';  // OPTIMIZADO: 1 año
    const days = 365;
    const startTime = Date.now();

    logger.info(`\n${'='.repeat(70)}`);
    logger.info(`🚀 TEST 2 OPTIMIZADO: PATTERN SCANNER PARA CRYPTO`);
    logger.info(`${'='.repeat(70)}`);
    logger.info(`Symbol: ${symbol}`);
    logger.info(`Período: ${period} (${days} días) - OPTIMIZADO`);
    logger.info(`Tipo: HMM + Pattern Scanner`);
    logger.info(`Max Candles: 500,000 (optimizado)`);
    logger.info(`${'='.repeat(70)}\n`);

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

        // OPTIMIZADO: Limitar candles a 500k
        let candles = await db.getRecentCandles(symbol, 500000);
        logger.info(`📊 Cargadas ${candles.length} velas (optimizado)\n`);

        if (candles.length < 1000) {
            throw new Error('Datos insuficientes');
        }

        // ═══════════════════════════════════════════════════════════
        // INICIALIZACIÓN: HMM + Pattern Scanner AJUSTADO
        // ═══════════════════════════════════════════════════════════

        const hmm = new HMMEngine(8);
        const patternScanner = new PatternScanner();

        // AJUSTE: Aumentar sensibilidad de minConfidence
        patternScanner.historicalData.TRIANGLES.minConfidence = 0.80;  // Era 0.65
        patternScanner.historicalData.HEAD_AND_SHOULDERS.minConfidence = 0.75;
        patternScanner.historicalData.DOUBLE_TOP_BOTTOM.minConfidence = 0.75;
        patternScanner.historicalData.WEDGES.minConfidence = 0.70;

        // Entrenamiento inicial del HMM - OPTIMIZADO
        logger.info(`🧠 Entrenando HMM (8 estados, 10 iteraciones)...`);
        const trainData = candles.slice(0, Math.min(500, candles.length));
        await hmm.train(trainData, 10);  // OPTIMIZADO: 20 → 10
        logger.info(`✅ HMM entrenado\n`);

        // ═══════════════════════════════════════════════════════════
        // SIMULACIÓN
        // ═══════════════════════════════════════════════════════════

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
        const hmmUpdateInterval = 60 * 60 * 1000;

        // NUEVO: Cool-down entre trades
        let lastTradeTime = 0;
        const cooldownMs = 60 * 60 * 1000;  // 60 minutos

        const totalSteps = candles.length;
        const progressStep = Math.floor(totalSteps / 20);  // Menos logs

        logger.info(`🚀 INICIANDO SIMULACIÓN...\n`);

        for (let i = 200; i < candles.length; i++) {
            // Progress bar (reducido)
            if (i % progressStep === 0 && i % (progressStep * 5) === 0) {
                const percent = ((i / totalSteps) * 100).toFixed(0);
                const elapsed = ((Date.now() - startTime) / 1000).toFixed(0);
                logger.info(`[${symbol}] Progreso: ${percent}% | Elapsed: ${elapsed}s`);
            }

            const candle = candles[i];
            const candleTime = parseInt(candle[0]);
            const close = parseFloat(candle[4]);

            // Entrenar HMM cada 60 minutos
            if (candleTime - lastHMMTrain > hmmUpdateInterval) {
                await hmm.train(candles.slice(Math.max(0, i - 500), i), 5);
                lastHMMTrain = candleTime;
            }

            // Predicción HMM
            const hmmPrediction = hmm.isTrained
                ? hmm.predictState(candles.slice(Math.max(0, i - 20), i))
                : null;

            // Detección de patrones
            const patternSignal = patternScanner.detect(candle, candles.slice(Math.max(0, i - 100), i));

            // ═════════════════════════════════════════════════════════════
            // LÓGICA DE TRADING CON COOL-DOWN
            // ═════════════════════════════════════════════════════════════

            // SALIDA: Target alcanzado o Stop Loss (PRIMERO SALIDA)
            if (activePosition) {
                if (close >= activePosition.target) {
                    // Target alcanzado
                    const pnl = activePosition.amount * (close - activePosition.entryPrice);
                    const commission = (activePosition.amount * close) * 0.001;
                    balance += (pnl - commission);

                    const gain = (close / activePosition.entryPrice - 1) * 100;

                    trades.push({
                        pattern: activePosition.pattern,
                        entry: activePosition.entryPrice,
                        exit: close,
                        pnl: gain - 0.1, // Net after commissions approx
                        success: true,
                        durationMinutes: (candleTime - activePosition.entryTime) / 60000
                    });

                    logger.info(`[${symbol}] 🟡 CIERRE Target: ${activePosition.pattern} | Gain: ${gain.toFixed(2)}% | Bal: $${balance.toFixed(2)} [${new Date(candleTime).toISOString()}]`);
                    activePosition = null;

                } else if (close <= activePosition.stopLoss) {
                    // Stop Loss
                    const pnl = activePosition.amount * (close - activePosition.entryPrice);
                    const commission = (activePosition.amount * close) * 0.001;
                    balance += (pnl - commission);

                    const loss = (close / activePosition.entryPrice - 1) * 100;

                    trades.push({
                        pattern: activePosition.pattern,
                        entry: activePosition.entryPrice,
                        exit: close,
                        pnl: loss - 0.1,
                        success: false,
                        durationMinutes: (candleTime - activePosition.entryTime) / 60000
                    });

                    logger.info(`[${symbol}] 🔴 STOP LOSS: ${activePosition.pattern} | Loss: ${loss.toFixed(2)}% | Bal: $${balance.toFixed(2)} [${new Date(candleTime).toISOString()}]`);
                    activePosition = null;
                }
            }

            const timeSinceLastTrade = candleTime - lastTradeTime;
            const cooldownActive = timeSinceLastTrade < cooldownMs;

            // ENTRADA: HMM alcista + Pattern bullish + Cool-down respetado (LUEGO ENTRADA)
            if (!activePosition && hmmPrediction && patternSignal && !cooldownActive) {
                if (
                    (hmmPrediction.label.includes('ALCISTA') || hmmPrediction.label.includes('ACUMULACIÓN')) &&
                    patternSignal.action === 'BUY' &&
                    patternSignal.confidence >= 0.75  // MÁS EXIGENTE
                ) {
                    // ENTRADA
                    const entryPrice = close;
                    const commission = (balance * 0.98) * 0.001;

                    const position = {
                        entryPrice: entryPrice,
                        amount: (balance * 0.98) / entryPrice,
                        pattern: patternSignal.pattern,
                        patternConfidence: patternSignal.confidence,
                        target: patternSignal.target,
                        stopLoss: patternSignal.stopLoss,
                        entryTime: candleTime
                    };

                    activePosition = position;
                    lastTradeTime = candleTime;
                    balance -= commission; // Solo restamos comisión inicial

                    logger.info(`[${symbol}] 🟢 ENTRADA: ${patternSignal.pattern} (${(patternSignal.confidence * 100).toFixed(0)}%) @ ${entryPrice.toFixed(2)} [${new Date(candleTime).toISOString()}]`);

                    patterns.detected++;
                    patterns.bullish++;
                    patterns.byType[patternSignal.pattern] = (patterns.byType[patternSignal.pattern] || 0) + 1;
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

        logger.info(`\n${'='.repeat(70)}`);
        logger.info(`📊 TEST 2 OPTIMIZADO - RESULTADOS FINALES`);
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
            ? trades.reduce((a, b) => a + b.durationMinutes, 0) / trades.length
            : 0;

        const results = {
            symbol: symbol,
            version: '2.6',
            method: 'HMM + Pattern Scanner (Optimizado)',
            period: period,
            optimizations: {
                candles_limited: '500k (vs 3M)',
                hmmIterations: '10 (vs 20)',
                patternMinConfidence: '0.70-0.80 (vs 0.60-0.65)',
                cooldownMinutes: 60,
                lookbackPeriod: 100
            },

            metrics: {
                totalTrades: trades.length,
                winRate: winRate.toFixed(1),
                roi: roi.toFixed(2),
                maxDrawdown: (maxDD * 100).toFixed(2),
                sharpeRatio: sharpe.toFixed(2),
                profitFactor: profitFactor.toFixed(2),
                avgReturn: avgReturn.toFixed(6),
                avgTradeDuration: avgDuration.toFixed(0),
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

            evaluation: {
                passed: roi > 5,
                verdict: roi > 10 ? '✅ EXCELENTE' : roi > 5 ? '✅ PASÓ' : roi > 0 ? '⚠️ MARGINAL' : '❌ FALLÓ',
                recommendation: roi > 8 ? 'Proceder a TEST 3' : 'Ajustar parámetros'
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
        console.log(`Avg Duration:       ${results.metrics.avgTradeDuration} min`);
        console.log(`Final Balance:      $${results.metrics.finalBalance}\n`);

        console.log(`🎯 PATRONES:\n`);
        console.log(`Detected:           ${results.patterns.detected}`);
        console.log(`By Type:            ${JSON.stringify(results.patterns.byType)}\n`);

        console.log(`📊 VEREDICTO:       ${results.evaluation.verdict}`);
        console.log(`Recomendación:      ${results.evaluation.recommendation}\n`);

        // Guardar resultados
        const outputFile = 'test_2_btc_pattern_scanner_optimized.json';
        fs.writeFileSync(outputFile, JSON.stringify(results, null, 2));

        logger.info(`✅ Resultados guardados en: ${outputFile}`);
        logger.info(`⏱️  Tiempo total: ${results.executionTime}s`);
        logger.info(`${'='.repeat(70)}\n`);

    } catch (error) {
        logger.error(`❌ Error en TEST 2: ${error.message}`);
        logger.error(error.stack);
        process.exit(1);
    }
}

// Ejecutar
runTest2Optimized().then(() => {
    logger.info('✅ TEST 2 OPTIMIZADO completado');
    process.exit(0);
}).catch(error => {
    logger.error(`Fatal error: ${error.message}`);
    process.exit(1);
});
