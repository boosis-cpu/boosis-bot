#!/usr/bin/env node

/**
 * 🚀 TEST 3D v3.0 - CRIPTO NATIVE
 * 
 * Validación del reset total de la estrategia. 
 * Aplica BOOSIS v3.0 sobre datos históricos de 5 años.
 */

require('dotenv').config();
const db = require('../src/core/database');
const BOOSISv3 = require('../src/core/boosis_v3_crypto_native');
const fs = require('fs');

async function runTest3Dv3() {
    const symbols = ['BTCUSDT', 'ETHUSDT', 'SOLUSDT'];
    const timeframe = '1d';
    const initialBalance = 10000;

    try {
        await db.init();
        console.log(`\n${'═'.repeat(80)}`);
        console.log(`🚀 INICIANDO TEST 3D v3.0 (CRIPTO NATIVE)`);
        console.log(`${'═'.repeat(80)}\n`);

        const globalResults = {};

        for (const symbol of symbols) {
            console.log(`📊 PROCESANDO: ${symbol}`);

            const candles = await db.getRecentCandles(symbol, 2000, timeframe);
            if (candles.length < 200) {
                console.warn(`   ⚠️ Datos insuficientes para ${symbol}`);
                continue;
            }

            const bot = new BOOSISv3(symbol, initialBalance);
            let balance = initialBalance;
            let peak = initialBalance;
            let maxDD = 0;
            const trades = [];
            let activePosition = null;

            for (let i = 100; i < candles.length; i++) {
                const slice = candles.slice(Math.max(0, i - 100), i);
                const closes = slice.map(c => parseFloat(c[4]));
                const highs = slice.map(c => parseFloat(c[2]));
                const lows = slice.map(c => parseFloat(c[3]));

                const candle = candles[i];
                const close = parseFloat(candle[4]);
                const candleTime = candle[0];

                // 1. Detección de Régimen
                const regime = bot.detectRegime(closes, highs, lows);

                // 2. Evaluar Entrada
                if (!activePosition && regime) {
                    const entryVal = bot.evaluateEntry(regime, close, parseFloat(candles[i - 1][4]));
                    if (entryVal) {
                        const riskAmount = balance * 0.02; // 2% Capital base por trade
                        const amount = (riskAmount * 0.98) / entryVal.entryPrice;

                        activePosition = {
                            entryPrice: entryVal.entryPrice,
                            amount: amount,
                            stopLoss: entryVal.stopLoss,
                            target: entryVal.target,
                            atr: entryVal.atr,
                            highestPrice: close,
                            entryTime: candleTime
                        };

                        balance -= amount * entryVal.entryPrice * 0.0005; // Comisión
                    }
                }

                // 3. Evaluar Salida
                if (activePosition) {
                    const exitVal = bot.evaluateExit(activePosition, close, regime);
                    if (exitVal) {
                        const exitPrice = exitVal.exitPrice;
                        const pnlAmount = activePosition.amount * (exitPrice - activePosition.entryPrice);
                        balance += (activePosition.amount * activePosition.entryPrice) + pnlAmount;
                        balance -= (activePosition.amount * exitPrice) * 0.0005; // Comisión salida

                        trades.push({
                            entryPrice: activePosition.entryPrice,
                            exitPrice: exitPrice,
                            pnl: exitVal.pnl * 100,
                            reason: exitVal.reason,
                            duration: (candleTime - activePosition.entryTime) / (1000 * 60 * 60 * 24)
                        });

                        activePosition = null;
                    }
                }

                // Tracking Drawdown
                const currentEquity = balance + (activePosition ? activePosition.amount * (close - activePosition.entryPrice) : 0);
                if (currentEquity > peak) peak = currentEquity;
                const dd = (peak - currentEquity) / peak;
                if (dd > maxDD) maxDD = dd;

                // Actualizar highest price
                if (activePosition && close > activePosition.highestPrice) {
                    activePosition.highestPrice = close;
                }
            }

            // Cálculo de Métricas Finales
            const roi = ((balance - initialBalance) / initialBalance) * 100;
            const wins = trades.filter(t => t.pnl > 0).length;
            const wr = (wins / (trades.length || 1)) * 100;
            const cagr = (Math.pow(Math.max(0.1, balance) / initialBalance, 1 / (candles.length / 365)) - 1) * 100;
            const calmar = maxDD > 0 ? (cagr / (maxDD * 100)) : 0;

            globalResults[symbol] = {
                roi: roi.toFixed(2),
                trades: trades.length,
                winRate: wr.toFixed(1),
                maxDrawdown: (maxDD * 100).toFixed(2),
                cagr: cagr.toFixed(2),
                calmarRatio: calmar.toFixed(2)
            };

            console.log(`   ✅ ROI: ${roi.toFixed(2)}% | Trades: ${trades.length} | WR: ${wr.toFixed(1)}% | DD: ${(maxDD * 100).toFixed(2)}% | Calmar: ${calmar.toFixed(2)}`);
        }

        // Reporte Final
        console.log(`\n${'═'.repeat(80)}`);
        console.log(`📊 RESULTADOS FINALES v3.0`);
        console.log(`${'═'.repeat(80)}\n`);
        console.log(`Símbolo      ROI         Trades    WR        DD        Calmar`);
        console.log(`${'─'.repeat(80)}`);
        for (const [sym, r] of Object.entries(globalResults)) {
            console.log(`${sym.padEnd(12)} ${r.roi.padEnd(11)} ${r.trades.toString().padEnd(9)} ${r.winRate.padEnd(9)} ${r.maxDrawdown.padEnd(9)} ${r.calmarRatio}`);
        }
        console.log(`${'─'.repeat(80)}\n`);

        fs.writeFileSync('test_3d_v3_results.json', JSON.stringify(globalResults, null, 2));
        console.log(`📁 Resultados guardados: test_3d_v3_results.json\n`);

    } catch (err) {
        console.error(`❌ Error en Test 3D v3.0:`, err.message);
        process.exit(1);
    }
}

runTest3Dv3();
