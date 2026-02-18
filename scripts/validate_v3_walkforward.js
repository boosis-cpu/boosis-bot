#!/usr/bin/env node

/**
 * 🧪 VALIDACIÓN WALK-FORWARD v3.0 (BTCUSDT)
 * 
 * Divide el historial en 2 períodos para asegurar que la estrategia no está sobre-optimizada.
 */

require('dotenv').config();
const db = require('../src/core/database');
const BOOSISv3 = require('../src/core/boosis_v3_crypto_native');
const fs = require('fs');

async function runWalkForward() {
    const symbol = 'BTCUSDT';
    const timeframe = '1d';
    const initialBalance = 10000;

    try {
        await db.init();
        const candles = await db.getRecentCandles(symbol, 2000, timeframe);

        const midPoint = Math.floor(candles.length / 2);
        const period1 = candles.slice(0, midPoint);
        const period2 = candles.slice(midPoint);

        console.log(`\n${'═'.repeat(80)}`);
        console.log(`🧪 VALIDACIÓN WALK-FORWARD v3.0 - ${symbol}`);
        console.log(`${'═'.repeat(80)}\n`);

        const results1 = await simulatePeriod(period1, symbol, initialBalance);
        const results2 = await simulatePeriod(period2, symbol, initialBalance);

        console.log(`📅 Período 1: ROI ${results1.roi}% | DD ${results1.maxDrawdown}% | Calmar ${results1.calmarRatio}`);
        console.log(`📅 Período 2: ROI ${results2.roi}% | DD ${results2.maxDrawdown}% | Calmar ${results2.calmarRatio}`);

        const isRobust = parseFloat(results1.roi) > 5 && parseFloat(results2.roi) > 5;

        console.log(`\n${'█'.repeat(80)}`);
        console.log(`VEREDICTO: ${isRobust ? '✅ ROBUSTO (Gana en ambos períodos)' : '⚠️ MARGINAL'}`);
        console.log(`${'█'.repeat(80)}\n`);

        const report = {
            p1: results1,
            p2: results2,
            robust: isRobust
        };
        fs.writeFileSync('walk_forward_v3_results.json', JSON.stringify(report, null, 2));

    } catch (err) {
        console.error(`❌ Error en Walk-Forward:`, err.message);
    }
}

async function simulatePeriod(candles, symbol, initialBalance) {
    const bot = new BOOSISv3(symbol, initialBalance);
    let balance = initialBalance;
    let peak = initialBalance;
    let maxDD = 0;
    const trades = [];
    let activePosition = null;

    for (let i = 50; i < candles.length; i++) {
        const slice = candles.slice(Math.max(0, i - 50), i);
        const closes = slice.map(c => parseFloat(c[4]));
        const highs = slice.map(c => parseFloat(c[2]));
        const lows = slice.map(c => parseFloat(c[3]));
        const close = parseFloat(candles[i][4]);

        const regime = bot.detectRegime(closes, highs, lows);

        if (!activePosition && regime) {
            const entryVal = bot.evaluateEntry(regime, close, parseFloat(candles[i - 1][4]));
            if (entryVal) {
                const riskAmount = balance * 0.02;
                activePosition = {
                    entryPrice: entryVal.entryPrice,
                    amount: (riskAmount * 0.98) / entryVal.entryPrice,
                    stopLoss: entryVal.stopLoss,
                    target: entryVal.target,
                    atr: entryVal.atr,
                    highestPrice: close,
                    entryTime: candles[i][0]
                };
                balance -= activePosition.amount * entryVal.entryPrice * 0.0005;
            }
        }

        if (activePosition) {
            const exitVal = bot.evaluateExit(activePosition, close, regime);
            if (exitVal) {
                balance += activePosition.amount * exitVal.exitPrice * 0.9995;
                trades.push({ pnl: exitVal.pnl * 100 });
                activePosition = null;
            }
        }

        const equity = balance + (activePosition ? activePosition.amount * (close - activePosition.entryPrice) : 0);
        if (equity > peak) peak = equity;
        const dd = (peak - equity) / peak;
        if (dd > maxDD) maxDD = dd;
        if (activePosition && close > activePosition.highestPrice) activePosition.highestPrice = close;
    }

    const roi = ((balance - initialBalance) / initialBalance) * 100;
    const years = candles.length / 365;
    const cagr = (Math.pow(Math.max(0.1, balance) / initialBalance, 1 / years) - 1) * 100;
    const calmar = maxDD > 0 ? (cagr / (maxDD * 100)) : 0;

    return {
        roi: roi.toFixed(2),
        maxDrawdown: (maxDD * 100).toFixed(2),
        calmarRatio: calmar.toFixed(2)
    };
}

runWalkForward();
