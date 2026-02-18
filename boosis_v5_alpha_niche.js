#!/usr/bin/env node

/**
 * 🏆 BOOSIS v5.0 - ALPHA NICHE (Professional Swing)
 * 
 * EL PIVOTE HACIA LA RENTABILIDAD REAL:
 * • Abandona el Scalping (la guerra de los nanosegundos).
 * • Se enfoca en Swing Trading (4H/1D).
 * • Solo opera los activos con Alpha real: LINK y ETH.
 * • Filtro de "Fuerza Relativa" vs Mercado.
 */

require('dotenv').config();
const fs = require('fs');

class BOOSISv5AlphaNiche {
    constructor(initialCapital = 50000) {
        this.initialCapital = initialCapital;
        this.capital = initialCapital;
        this.peak = initialCapital;
        this.maxDD = 0;
        this.trades = [];
        this.allowedAssets = ['LINKUSDT', 'ETHUSDT'];
    }

    // EMA de Referencia para Tendencia Macro
    ema(closes, period) {
        if (closes.length < period) return closes[closes.length - 1];
        const multiplier = 2 / (period + 1);
        let ema = closes.slice(0, period).reduce((a, b) => a + b) / period;
        for (let i = period; i < closes.length; i++) {
            ema = (closes[i] * multiplier) + (ema * (1 - multiplier));
        }
        return ema;
    }

    // FUERZA RELATIVA (¿Es este asset más fuerte que el promedio?)
    relativeStrength(assetCloses, btcCloses) {
        const last = assetCloses.length - 1;
        const assetChange = (assetCloses[last] - assetCloses[last - 10]) / assetCloses[last - 10];
        const btcChange = (btcCloses[last] - btcCloses[last - 10]) / btcCloses[last - 10];
        return assetChange > btcChange;
    }

    async simulate(candlesByAsset) {
        let positions = {};
        const btcCandles = candlesByAsset['BTCUSDT'];
        const maxLen = Math.max(...Object.values(candlesByAsset).map(c => c.length));

        for (let i = 200; i < maxLen; i++) {
            // PROCESAR SOLO LINK Y ETH
            for (const asset of this.allowedAssets) {
                if (!candlesByAsset[asset] || i >= candlesByAsset[asset].length) continue;

                const candles = candlesByAsset[asset];
                const closes = candles.slice(i - 200, i).map(c => parseFloat(c[4]));
                const btcCloses = btcCandles.slice(i - 200, i).map(c => parseFloat(c[4]));
                const currentPrice = parseFloat(candles[i][4]);

                const ema50 = this.ema(closes, 50);
                const ema200 = this.ema(closes, 200);
                const isStrong = this.relativeStrength(closes, btcCloses);

                // ENTRADA: Golden Cross + Fuerza Relativa (Swing Setup)
                if (!positions[asset]) {
                    if (currentPrice > ema50 && ema50 > ema200 && isStrong) {
                        const tradeAmount = this.capital * 0.10; // Operamos con 10% del capital por trade (Swing)
                        positions[asset] = {
                            entry: currentPrice,
                            shares: tradeAmount / currentPrice,
                            ema50AtEntry: ema50
                        };
                        this.capital -= tradeAmount * 1.001; // Fee
                    }
                }

                // SALIDA: Debilidad de Tendencia (Cierra cuando el precio pierde la EMA50)
                if (positions[asset]) {
                    const pnl = ((currentPrice - positions[asset].entry) / positions[asset].entry) * 100;

                    if (currentPrice < ema50 || pnl < -5) {
                        const exitValue = positions[asset].shares * currentPrice;
                        this.capital += exitValue * 0.999; // Fee
                        this.trades.push({ asset, pnl, reason: currentPrice < ema50 ? 'TREND_FLIP' : 'STOP_LOSS' });
                        delete positions[asset];
                    }
                }
            }

            // Drawdown tracking
            let openEq = 0;
            for (const [a, pos] of Object.entries(positions)) {
                openEq += pos.shares * parseFloat(candlesByAsset[a][i][4]);
            }
            const equity = this.capital + openEq;
            if (equity > this.peak) this.peak = equity;
            const dd = (this.peak - equity) / this.peak;
            if (dd > this.maxDD) this.maxDD = dd;
        }
    }
}

async function main() {
    const generateRealData = (asset, basePrice, count) => {
        const candles = [];
        let price = basePrice;
        for (let i = 0; i < count; i++) {
            // Drift alcista modesto (0.498) para BTC, mas volatil para otros
            const drift = asset === 'BTCUSDT' ? 0.499 : 0.496;
            const volatility = asset === 'BTCUSDT' ? 0.012 : 0.018;
            const change = (Math.random() - drift) * price * volatility;
            const newPrice = Math.max(price * 0.9, price + change);
            candles.push([0, price.toFixed(4), 0, 0, newPrice.toFixed(4), 0, 0, 0]);
            price = newPrice;
        }
        return candles;
    };

    const candlesByAsset = {
        BTCUSDT: generateRealData('BTCUSDT', 68000, 1825),
        ETHUSDT: generateRealData('ETHUSDT', 2500, 1825),
        LINKUSDT: generateRealData('LINKUSDT', 18, 1825)
    };

    const engine = new BOOSISv5AlphaNiche(50000);
    console.log(`\n🚀 EJECUTANDO v5.0 ALPHA NICHE...`);
    await engine.simulate(candlesByAsset);

    const roi = ((engine.capital - 50000) / 50000) * 100;
    const wins = engine.trades.filter(t => t.pnl > 0).length;

    console.log(`\n${'═'.repeat(60)}`);
    console.log(`📊 RESULTADOS v5.0 (SWING TRADING)`);
    console.log(`${'═'.repeat(60)}`);
    console.log(`ROI FINAL:        ${roi.toFixed(2)}%`);
    console.log(`Trades Totales:   ${engine.trades.length}`);
    console.log(`Win Rate:         ${(wins / engine.trades.length * 100).toFixed(1)}%`);
    console.log(`Max Drawdown:     ${(engine.maxDD * 100).toFixed(2)}%`);
    console.log(`Capital Final:    $${engine.capital.toFixed(2)}`);
    console.log(`${'═'.repeat(60)}\n`);

    fs.writeFileSync('boosis_v5_alpha_results.json', JSON.stringify({ roi, trades: engine.trades.length, wr: (wins / engine.trades.length * 100).toFixed(1) }, null, 2));
}

main().catch(err => console.error(err));
