#!/usr/bin/env node

/**
 * 🚀 TEST 3D v3.1 AGGRESSIVE - FINE-TUNED PARA DINERO DIARIO
 * 
 * Validación del enfoque agresivo de Boosis. 
 * A diferencia de v3.0, busca capturar ganancias rápidas y maximizar trades.
 */

require('dotenv').config();
const db = require('../src/core/database');
const BOOSISv31 = require('../src/core/boosis_v3_1_aggressive');
const fs = require('fs');

async function runTest3Dv31() {
    const symbols = ['BTCUSDT', 'ETHUSDT', 'SOLUSDT'];
    const timeframe = '1d';
    const initialBalance = 10000;

    try {
        await db.init();
        console.log(`\n${'═'.repeat(80)}`);
        console.log(`🚀 INICIANDO TEST 3D v3.1 AGGRESSIVE (FLUJO DIARIO)`);
        console.log(`${'═'.repeat(80)}\n`);

        const globalResults = {};

        for (const symbol of symbols) {
            console.log(`📊 PROCESANDO: ${symbol} v3.1...`);

            const candles = await db.getRecentCandles(symbol, 2000, timeframe);
            if (candles.length < 200) {
                console.warn(`   ⚠️ Datos insuficientes para ${symbol}`);
                continue;
            }

            const bot = new BOOSISv31(symbol, initialBalance);
            let balance = initialBalance;
            let peak = initialBalance;
            let maxDD = 0;
            const trades = [];
            let activePosition = null;
            let dailyStats = { gains: 0, losses: 0, count: 0 };
            const dailySummaries = [];

            for (let i = 100; i < candles.length; i++) {
                const slice = candles.slice(Math.max(0, i - 100), i);
                const closes = slice.map(c => parseFloat(c[4]));
                const highs = slice.map(c => parseFloat(c[2]));
                const lows = slice.map(c => parseFloat(c[3]));

                const candle = candles[i];
                const close = parseFloat(candle[4]);
                const candleTime = candle[0];

                // 1. Detección de Régimen (v3.1)
                const regime = bot.detectRegime(closes, highs, lows);

                // 2. Evaluar Entrada (v3.1)
                if (!activePosition) {
                    const entryVal = bot.evaluateEntry(regime, close, parseFloat(candles[i - 1][4]));
                    if (entryVal) {
                        const riskAmount = balance * entryVal.riskPct;
                        const amount = (riskAmount * 0.98) / entryVal.entryPrice;

                        activePosition = {
                            entryPrice: entryVal.entryPrice,
                            amount: amount,
                            stopLoss: entryVal.stopLoss,
                            target: entryVal.target,
                            atr: entryVal.atr,
                            highestPrice: close,
                            entryTime: candleTime,
                            type: entryVal.type
                        };

                        balance -= amount * entryVal.entryPrice * 0.0005; // Comisión
                    }
                }

                // 3. Evaluar Salida (v3.1)
                if (activePosition) {
                    const exitVal = bot.evaluateExit(activePosition, close, regime, dailyStats);
                    if (exitVal) {
                        const exitPrice = exitVal.exitPrice;
                        const pnlVal = activePosition.amount * (exitPrice - activePosition.entryPrice);
                        balance += (activePosition.amount * activePosition.entryPrice) + pnlVal;
                        balance -= (activePosition.amount * exitPrice) * 0.0005; // Comisión salida

                        const pnlPct = exitVal.pnl * 100;
                        trades.push({
                            pnl: pnlPct,
                            reason: exitVal.reason,
                            type: activePosition.type
                        });

                        if (pnlPct > 0) dailyStats.gains += pnlPct; else dailyStats.losses += Math.abs(pnlPct);

                        activePosition = null;
                    }
                }

                // Monitoring
                const currentEquity = balance + (activePosition ? activePosition.amount * (close - activePosition.entryPrice) : 0);
                if (currentEquity > peak) peak = currentEquity;
                const dd = (peak - currentEquity) / peak;
                if (dd > maxDD) maxDD = dd;

                if (activePosition && close > activePosition.highestPrice) {
                    activePosition.highestPrice = close;
                }

                // Registro diario
                dailySummaries.push(currentEquity);
            }

            // Cálculos
            const roi = ((balance - initialBalance) / initialBalance) * 100;
            const wins = trades.filter(t => t.pnl > 0).length;
            const wr = (wins / (trades.length || 1)) * 100;

            const totalDays = candles.length;
            const dailyAvgPnL = roi / totalDays;

            const cagr = (Math.pow(Math.max(0.1, balance) / initialBalance, 1 / (totalDays / 365)) - 1) * 100;
            const calmar = maxDD > 0 ? (cagr / (maxDD * 100)) : 0;

            globalResults[symbol] = {
                roi: roi.toFixed(1),
                trades: trades.length,
                winRate: wr.toFixed(1),
                maxDrawdown: (maxDD * 100).toFixed(2),
                calmarRatio: calmar.toFixed(2),
                dailyAvgPercent: dailyAvgPnL.toFixed(3)
            };

            console.log(`   ✅ ROI: ${roi.toFixed(1)}% | Trades: ${trades.length} | Daily Avg: ${dailyAvgPnL.toFixed(3)}% | Calmar: ${calmar.toFixed(2)}`);
        }

        // Reporte Final
        console.log(`\n${'═'.repeat(90)}`);
        console.log(`📊 RESULTADOS FINALES v3.1 AGGRESSIVE (FINE-TUNED)`);
        console.log(`${'═'.repeat(90)}\n`);
        console.log(`Símbolo      ROI         Trades    WR%       DD%       Calmar    Daily%`);
        console.log(`${'─'.repeat(90)}`);
        for (const [sym, r] of Object.entries(globalResults)) {
            console.log(`${sym.padEnd(12)} ${r.roi.padEnd(11)} ${r.trades.toString().padEnd(9)} ${r.winRate.padEnd(9)} ${r.maxDrawdown.padEnd(9)} ${r.calmarRatio.padEnd(9)} ${r.dailyAvgPercent}`);
        }
        console.log(`${'─'.repeat(90)}\n`);

        fs.writeFileSync('test_3d_v3_1_results.json', JSON.stringify(globalResults, null, 2));

    } catch (err) {
        console.error(`❌ Error en Test:`, err.message);
    }
}

runTest3Dv31();
