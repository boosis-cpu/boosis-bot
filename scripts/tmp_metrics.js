#!/usr/bin/env node
require('dotenv').config();
const db = require('../src/core/database');
const BOOSISv3 = require('../src/core/boosis_v3_crypto_native');

async function getDetailedMetrics() {
    const symbols = ['BTCUSDT', 'ETHUSDT', 'SOLUSDT'];
    await db.init();

    for (const symbol of symbols) {
        const candles = await db.getRecentCandles(symbol, 2000, '1d');
        const bot = new BOOSISv3(symbol, 10000);
        let balance = 10000;
        const trades = [];
        let activePosition = null;

        for (let i = 100; i < candles.length; i++) {
            const slice = candles.slice(Math.max(0, i - 100), i);
            const closes = slice.map(c => parseFloat(c[4]));
            const highs = slice.map(c => parseFloat(c[2]));
            const lows = slice.map(c => parseFloat(c[3]));
            const close = parseFloat(candles[i][4]);

            const regime = bot.detectRegime(closes, highs, lows);
            if (!activePosition && regime.confidence > 0.80) {
                const entryVal = bot.evaluateEntry(regime, close, closes[closes.length - 2]);
                if (entryVal) {
                    activePosition = { entryPrice: entryVal.entryPrice, amount: (balance * 0.02 * 0.98) / entryVal.entryPrice, stopLoss: entryVal.stopLoss, target: entryVal.target, atr: entryVal.atr, highestPrice: close, entryTime: candles[i][0] };
                    balance -= activePosition.amount * entryVal.entryPrice * 0.0005;
                }
            }
            if (activePosition) {
                const exitVal = bot.evaluateExit(activePosition, close, regime);
                if (exitVal) {
                    balance += activePosition.amount * exitVal.exitPrice * 0.9995;
                    trades.push({ pnl: exitVal.pnl * 100, duration: (candles[i][0] - activePosition.entryTime) / (1000 * 60 * 60 * 24) });
                    activePosition = null;
                }
            }
        }

        const wins = trades.filter(t => t.pnl > 0);
        const losses = trades.filter(t => t.pnl < 0);
        const avgWin = wins.length > 0 ? (wins.reduce((a, b) => a + b.pnl, 0) / wins.length) : 0;
        const avgLoss = losses.length > 0 ? (losses.reduce((a, b) => a + b.pnl, 0) / losses.length) : 0;
        const avgDur = trades.length > 0 ? (trades.reduce((a, b) => a + b.duration, 0) / trades.length) : 0;

        console.log(`METRICS_${symbol}:`, JSON.stringify({ avgWin: avgWin.toFixed(2), avgLoss: avgLoss.toFixed(2), avgDur: avgDur.toFixed(1) }));
    }
}
getDetailedMetrics();
