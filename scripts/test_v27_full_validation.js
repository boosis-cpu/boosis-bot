#!/usr/bin/env node

/**
 * 🏆 TEST v2.7: VALIDACIÓN CUANTITATIVA TOTAL (5 AÑOS + WALK-FORWARD)
 * 
 * Genera métricas exactas para Tony:
 * - Sharpe, Calmar, CAGR, Profit Factor
 * - Walk-Forward BTC
 * - ETH y SOL (5 años)
 */

require('dotenv').config();

const db = require('../src/core/database');
const logger = require('../src/core/logger');
const HMMEngine = require('../src/core/hmm-engine');
const TurtleStrategy = require('../src/strategies/TurtleStrategy');
const fs = require('fs');

async function runFullV27Validation() {
    const symbols = ['BTCUSDT', 'ETHUSDT', 'SOLUSDT'];
    const timeframe = '1d';
    const years = 5;
    const days = 365 * years;
    const initialBalance = 10000;

    try {
        await db.init();
        logger.info(`✅ Database inicializada`);

        const finalResults = {};

        for (const symbol of symbols) {
            logger.info(`\n${'='.repeat(80)}`);
            logger.info(`🚀 PROCESANDO ASSET: ${symbol} (5 AÑOS)`);
            logger.info(`${'='.repeat(80)}`);

            const candles = await db.getRecentCandles(symbol, days + 500, timeframe);
            if (candles.length < 200) {
                logger.warn(`  ${symbol}: Datos insuficientes`);
                continue;
            }

            const testResult = await runSimulation(candles, symbol, initialBalance);
            finalResults[symbol] = testResult;

            // Guardar JSON individual
            const fileName = `test_2d_v27_${symbol.toLowerCase().split('usdt')[0]}_completo.json`;
            fs.writeFileSync(fileName, JSON.stringify(testResult, null, 2));
            logger.info(`  ✅ Guardado: ${fileName}`);
        }

        // WALK-FORWARD BTC
        logger.info(`\n${'='.repeat(80)}`);
        logger.info(`🧪 EJECUTANDO WALK-FORWARD VALIDATION (BTCUSDT)`);
        logger.info(`${'='.repeat(80)}`);

        const btcCandles = await db.getRecentCandles('BTCUSDT', days + 500, timeframe);
        const midPoint = Math.floor(btcCandles.length / 2);

        // Período 1: Inicio a Mitad
        const wf1 = await runSimulation(btcCandles.slice(0, midPoint), 'BTCUSDT', initialBalance);
        // Período 2: Mitad a Fin
        const wf2 = await runSimulation(btcCandles.slice(midPoint), 'BTCUSDT', initialBalance);

        const walkForwardReport = {
            symbol: 'BTCUSDT',
            period1: {
                name: '2019-2022 (aprox)',
                summary: wf1.summary,
                riskMetrics: wf1.riskMetrics
            },
            period2: {
                name: '2022-2024 (aprox)',
                summary: wf2.summary,
                riskMetrics: wf2.riskMetrics
            },
            conclusion: (parseFloat(wf1.summary.roi) > 0 && parseFloat(wf2.summary.roi) > 0)
                ? (parseFloat(wf1.summary.roi) > 20 && parseFloat(wf2.summary.roi) > 20 ? '✅ Robusto' : '⚠️ Marginal')
                : '❌ Falló'
        };

        fs.writeFileSync('walk_forward_v27_btc_analysis.json', JSON.stringify(walkForwardReport, null, 2));
        logger.info(`✅ Guardado: walk_forward_v27_btc_analysis.json`);

        logger.info(`\n🏆 VALIDACIÓN v2.7 COMPLETADA`);

    } catch (error) {
        logger.error(`❌ Error en Validación: ${error.message}`);
        process.exit(1);
    }
}

async function runSimulation(candles, symbol, initialBalance) {
    const turtle = new TurtleStrategy(20, 10, 55, 20);
    const hmm = new HMMEngine(8);

    // Sincronizar balance inicial en el risk manager interno de la estrategia
    turtle.riskManager.initialBalance = initialBalance;
    turtle.riskManager.currentBalance = initialBalance;

    // Entrenar HMM inicial
    await hmm.train(candles.slice(0, 500), 20);

    let balance = initialBalance;
    let peak = balance;
    let maxDD = 0;
    let activePosition = null;
    const trades = [];

    const dailyLoses = []; // Para Sharpe
    let lastEquity = initialBalance;

    let circuitBreakerActivations = 0;
    let minVolScaler = 1.0;
    let finalKelly = 0.25;

    for (let i = 500; i < candles.length; i++) {
        const candle = candles[i];
        const candleTime = candle[0];
        const close = parseFloat(candle[4]);

        // Predicción HMM con ventana adaptativa interna
        const hmmPred = hmm.predictState(candles.slice(Math.max(0, i - 200), i), symbol);

        const signal = turtle.onCandle(
            candle,
            candles.slice(Math.max(0, i - 200), i),
            !!activePosition,
            activePosition,
            balance,
            hmmPred
        );

        // Entrada
        if (!activePosition && signal && signal.action === 'BUY') {
            const entryPrice = close;
            // v2.7 Risk Manager decide el tamaño
            const size = signal.v27.positionSize;

            activePosition = {
                entryPrice: entryPrice,
                amount: size / entryPrice,
                target: signal.target || entryPrice * 1.5,
                stopLoss: signal.stopLoss || entryPrice * 0.90,
                entryTime: candleTime,
                v27: signal.v27
            };

            const commission = activePosition.amount * entryPrice * 0.0005;
            balance -= commission;
        }

        // Salida
        if (activePosition) {
            let exitPrice = null;

            if (close >= activePosition.target) {
                exitPrice = close;
            } else if (close <= activePosition.stopLoss) {
                exitPrice = close;
            } else if (signal && signal.action === 'SELL') {
                exitPrice = close;
            }

            if (exitPrice) {
                const pnl = (exitPrice - activePosition.entryPrice) / activePosition.entryPrice;
                const commission = activePosition.amount * exitPrice * 0.0005;
                const profit = (activePosition.amount * activePosition.entryPrice * pnl) - commission;

                balance += profit;

                const tradeDuration = (candleTime - activePosition.entryTime) / (24 * 60 * 60 * 1000);
                trades.push({
                    symbol,
                    entryTime: new Date(activePosition.entryTime).toISOString(),
                    exitTime: new Date(candleTime).toISOString(),
                    entryPrice: activePosition.entryPrice,
                    exitPrice: exitPrice,
                    pnl: pnl * 100,
                    profit: profit,
                    durationDays: tradeDuration.toFixed(1),
                    v27: activePosition.v27
                });

                // El RiskManager ya se actualizó dentro de turtle.onCandle() para el cierre
                // Pero capturamos métricas para el reporte
                if (turtle.riskManager.circuitBreakerActive) circuitBreakerActivations++;
                if (turtle.riskManager.volatilityScaler < minVolScaler) minVolScaler = turtle.riskManager.volatilityScaler;
                finalKelly = turtle.riskManager.kellyFraction;

                activePosition = null;
            }
        }

        const currentEquity = balance + (activePosition ? activePosition.amount * (close - activePosition.entryPrice) : 0);

        // Tracking diario para Sharpe (asumiendo que cada vela es un día)
        const dailyReturn = (currentEquity - lastEquity) / lastEquity;
        dailyLoses.push(dailyReturn);
        lastEquity = currentEquity;

        if (currentEquity > peak) peak = currentEquity;
        const dd = (peak - currentEquity) / peak;
        if (dd > maxDD) maxDD = dd;
    }

    // Cálculos finales
    const totalRoi = ((balance - initialBalance) / initialBalance) * 100;
    const wins = trades.filter(t => t.pnl > 0);
    const losses = trades.filter(t => t.pnl < 0);
    const winRate = (wins.length / (trades.length || 1)) * 100;

    const grossProfit = wins.reduce((a, b) => a + b.profit, 0);
    const grossLoss = Math.abs(losses.reduce((a, b) => a + b.profit, 0)) || 1;
    const profitFactor = grossProfit / grossLoss;

    const avgWin = wins.length > 0 ? (wins.reduce((a, b) => a + b.pnl, 0) / wins.length) : 0;
    const avgLoss = losses.length > 0 ? (losses.reduce((a, b) => a + b.pnl, 0) / losses.length) : 0;
    const avgDuration = trades.length > 0 ? (trades.reduce((a, b) => a + parseFloat(b.durationDays), 0) / trades.length) : 0;

    const yearsCount = candles.length / 365;
    const cagr = (Math.pow(Math.max(0.1, balance) / initialBalance, 1 / yearsCount) - 1) * 100;
    const calmar = maxDD > 0 ? (cagr / (maxDD * 100)) : 0;

    // Sharpe aproximado (anualizado)
    const meanReturn = dailyLoses.reduce((a, b) => a + b, 0) / dailyLoses.length;
    const stdDev = Math.sqrt(dailyLoses.reduce((a, b) => a + Math.pow(b - meanReturn, 2), 0) / dailyLoses.length);
    const sharpe = stdDev > 0 ? (meanReturn / stdDev) * Math.sqrt(365) : 0;

    return {
        summary: {
            roi: totalRoi.toFixed(2) + '%',
            maxDrawdown: (maxDD * 100).toFixed(2) + '%',
            calmarRatio: calmar.toFixed(2),
            sharpeRatio: sharpe.toFixed(2),
            profitFactor: profitFactor.toFixed(2),
            winRate: winRate.toFixed(1) + '%',
            totalTrades: trades.length,
            finalBalance: balance.toFixed(2)
        },
        riskMetrics: {
            cagr: cagr.toFixed(2) + '%',
            avgTradeWin: avgWin.toFixed(2) + '%',
            avgTradeLoss: avgLoss.toFixed(2) + '%',
            avgTradeDurationDays: avgDuration.toFixed(1),
            circuitBreakerActivations: circuitBreakerActivations,
            volatilityScalerRange: `[${minVolScaler.toFixed(2)} - 1.00]`,
            finalKelly: finalKelly.toFixed(2)
        },
        trades: trades
    };
}

runFullV27Validation();
