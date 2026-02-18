#!/usr/bin/env node

/**
 * 🚀 TEST 2D: TURTLE STRATEGY EN DAILY TIMEFRAME
 * 
 * PROPÓSITO:
 * Validar que Turtle FUNCIONA correctamente en su contexto original (DAILY)
 * No en 1H como TEST 2C que produjo -46.49%
 */

require('dotenv').config();

const db = require('../src/core/database');
const logger = require('../src/core/logger');
const DataMiner = require('../src/core/data_miner');
const HMMEngine = require('../src/core/hmm-engine');
const TurtleStrategy = require('../src/strategies/TurtleStrategy');
const fs = require('fs');

async function runTest2DTurtleDaily() {
    const symbol = 'BTCUSDT';
    const timeframe = '1d';  // DAILY - CORRECTO
    const period = '5y';     // 5 años para validación robusta
    const days = 365 * 5;    // 1825 días
    const startTime = Date.now();

    logger.info(`\n${'='.repeat(75)}`);
    logger.info(`🚀 TEST 2D: TURTLE STRATEGY EN DAILY TIMEFRAME (CORRECTO CONTEXTO)`);
    logger.info(`${'='.repeat(75)}`);
    logger.info(`\nSímbolo:        ${symbol}`);
    logger.info(`Timeframe:      ${timeframe} (DAILY)`);
    logger.info(`Período:        ${period} (${days} días)`);
    logger.info(`Estrategia:     Turtle (S1=20 DAYS, S2=55 DAYS)`);
    logger.info(`HMM Filter:     Activado (regímenes)`);
    logger.info(`${'='.repeat(75)}\n`);

    try {
        await db.init();
        logger.info(`✅ Database inicializada\n`);

        // Check for daily data
        const existingCount = await db.pool.query(
            'SELECT COUNT(*) FROM candles WHERE symbol = $1 AND timeframe = $2',
            [symbol, timeframe]
        );
        const count = parseInt(existingCount.rows[0]?.count || 0);

        const expectedCandles = days;

        if (count < expectedCandles * 0.9) {
            logger.info(`[DataMiner] Sincronizando ${symbol} en DAILY (${days} días)...`);
            await DataMiner.mineToDatabase(symbol, timeframe, days);
        } else {
            logger.info(`[DB] Usando ${count} candles DAILY existentes\n`);
        }

        // Get DAILY candles
        let candles = await db.getRecentCandles(symbol, 10000, timeframe);
        logger.info(`📊 Cargadas ${candles.length} velas DAILY\n`);

        if (candles.length < 100) {
            throw new Error(`Datos insuficientes: ${candles.length} velas. Se necesitan mínimo 100.`);
        }

        const hmm = new HMMEngine(8);

        // Turtle Strategy - CORRECT PARAMETERS (Richard Dennis standard)
        // constructor(s1Period = 20, s1Exit = 10, s2Period = 55, s2Exit = 20)
        const turtle = new TurtleStrategy(20, 10, 55, 20);

        logger.info(`🧠 Entrenando HMM (8 estados)...`);
        const trainData = candles.slice(0, Math.min(500, candles.length));
        await hmm.train(trainData, 20);
        logger.info(`✅ HMM entrenado\n`);

        let balance = 10000;
        const initialBalance = balance;
        let peak = balance;
        let maxDD = 0;

        const trades = [];
        const dailyReturns = [balance];

        let activePosition = null;
        let lastHMMTrain = candles[0][0];
        const hmmUpdateInterval = 30 * 24 * 60 * 60 * 1000; // 30 days

        const totalSteps = candles.length;
        const progressStep = Math.max(1, Math.floor(totalSteps / 10));

        logger.info(`🚀 INICIANDO SIMULACIÓN DAILY...\n`);

        for (let i = 100; i < candles.length; i++) {
            const candle = candles[i];
            const candleTime = candle[0];
            const close = candle[4];

            // Retrain HMM
            if (candleTime - lastHMMTrain > hmmUpdateInterval) {
                await hmm.train(candles.slice(Math.max(0, i - 200), i), 5);
                lastHMMTrain = candleTime;
            }

            const hmmPrediction = hmm.isTrained
                ? hmm.predictState(candles.slice(Math.max(0, i - 20), i))
                : null;

            if (i % progressStep === 0) {
                const label = hmmPrediction ? hmmPrediction.label : 'N/A';
                logger.info(`[${symbol}] ${new Date(candleTime).toISOString().split('T')[0]} | HMM: ${label} | Bal: $${balance.toFixed(2)}`);
            }

            // Turtle Signal (onCandle(candle, candles, hasPosition, activePosition, capital, hmmState))
            const turtleSignal = turtle.onCandle(
                candle,
                candles.slice(Math.max(0, i - 100), i),
                !!activePosition,
                activePosition,
                balance,
                hmmPrediction
            );

            // Simulation Logic (Simulating Margin)
            if (activePosition) {
                if (turtleSignal && turtleSignal.action === 'SELL') {
                    const exitPrice = close;
                    const pnl = (exitPrice - activePosition.entryPrice) / activePosition.entryPrice;
                    const commission = (activePosition.amount * exitPrice) * 0.0005;
                    const netPnL = (activePosition.amount * activePosition.entryPrice * pnl) - commission;

                    balance += netPnL;
                    const gain = pnl * 100;

                    trades.push({
                        entry: activePosition.entryPrice,
                        exit: exitPrice,
                        pnl: gain,
                        success: gain > 0,
                        durationDays: (candleTime - activePosition.entryTime) / (24 * 60 * 60 * 1000)
                    });

                    logger.info(`[${symbol}] 🟡 SALIDA: ${gain.toFixed(2)}% | Bal: $${balance.toFixed(2)} [${new Date(candleTime).toISOString().split('T')[0]}]`);
                    activePosition = null;
                }
            } else if (turtleSignal && turtleSignal.action === 'BUY') {
                const entryPrice = close;
                const leverage = 2;
                const positionSize = (balance * leverage * 0.98) / entryPrice;
                const entryCommission = (positionSize * entryPrice) * 0.0005;

                activePosition = {
                    entryPrice: entryPrice,
                    amount: positionSize,
                    entryTime: candleTime,
                    stopLoss: turtleSignal.stopLoss || (entryPrice * 0.95), // Fallback
                    target: turtleSignal.target || (entryPrice * 1.5) // Fallback
                };
                balance -= entryCommission;

                logger.info(`[${symbol}] 🟢 ENTRADA: $${entryPrice.toFixed(2)} [${new Date(candleTime).toISOString().split('T')[0]}]`);
            }

            const currentEquity = balance + (activePosition ? (activePosition.amount * (close - activePosition.entryPrice)) : 0);
            if (currentEquity > peak) peak = currentEquity;
            maxDD = Math.max(maxDD, (peak - currentEquity) / peak);
            dailyReturns.push(currentEquity);
        }

        // Metrics... (rest derived from trades and dailyReturns)
        const roi = ((balance - initialBalance) / initialBalance) * 100;
        const wins = trades.filter(t => t.success).length;
        const winRate = (wins / (trades.length || 1)) * 100;

        const results = {
            symbol,
            roi: roi.toFixed(2),
            winRate: winRate.toFixed(1),
            totalTrades: trades.length,
            maxDrawdown: (maxDD * 100).toFixed(2),
            finalBalance: balance.toFixed(2),
            trades: trades.slice(-20)
        };

        fs.writeFileSync('test_2d_btc_turtle_daily.json', JSON.stringify(results, null, 2));
        logger.info(`\n📈 MÉTRICAS FINALES:\n`);
        logger.info(`ROI: ${results.roi}% | Win Rate: ${results.winRate}% | Trades: ${results.totalTrades}`);
        logger.info(`Final Balance: $${results.finalBalance}\n`);

    } catch (error) {
        logger.error(`❌ Error en TEST 2D: ${error.message}`);
        process.exit(1);
    }
}

runTest2DTurtleDaily();
