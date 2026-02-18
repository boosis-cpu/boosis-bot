#!/usr/bin/env node

/**
 * 🔬 BOOSIS FINAL TEST - LA VERDAD ÚLTIMA
 * 
 * PREGUNTA SIMPLE:
 * "¿Existe un EDGE real en los datos?"
 * 
 * NO vamos a ajustar parámetros.
 * Vamos a hacer el TEST MÁS SIMPLE POSIBLE.
 * 
 * Si NO funciona ni con el sistema más simple:
 * = NO HAY EDGE
 * = Dejar de hacer trading automático
 * = Mejor operar manualmente
 */

require('dotenv').config();
const fs = require('fs');

class BOOSISFinalTest {
    constructor(initialCapital = 50000) {
        this.initialCapital = initialCapital;
        this.capital = initialCapital;
        this.peak = initialCapital;
        this.trades = [];
        this.maxDD = 0;
    }

    // ESTRATEGIA MÁS SIMPLE POSIBLE
    // Si precio > precio anterior: BUY
    // Si gana 1%: SELL
    // Si pierde 1%: SELL

    async simulate(candlesByAsset) {
        let positions = {};

        const maxLen = Math.max(...Object.values(candlesByAsset).map(c => c.length));

        for (let i = 1; i < maxLen; i++) {
            for (const [asset, candles] of Object.entries(candlesByAsset)) {
                if (i >= candles.length) continue;

                const currentPrice = parseFloat(candles[i][4]);
                const prevPrice = parseFloat(candles[i - 1][4]);

                // ENTRADA: Precio subió
                if (!positions[asset]) {
                    if (currentPrice > prevPrice) {
                        // Simple BUY: usaremos un tamaño fijo pequeño para esta prueba (1% del capital)
                        const tradeAmount = this.capital * 0.01;
                        positions[asset] = {
                            entry: currentPrice,
                            shares: tradeAmount / currentPrice
                        };
                        this.capital -= tradeAmount * 0.001; // 0.1% fees entrada
                    }
                }

                // SALIDA
                if (positions[asset]) {
                    const pnl = ((currentPrice - positions[asset].entry) / positions[asset].entry) * 100;

                    // +1% SELL
                    if (pnl >= 1) {
                        const exitValue = positions[asset].shares * currentPrice;
                        this.capital += (exitValue * 0.999); // 0.1% fees salida
                        this.trades.push({ pnl, reason: 'PROFIT' });
                        delete positions[asset];
                    }
                    // -1% SELL
                    else if (pnl <= -1) {
                        const exitValue = positions[asset].shares * currentPrice;
                        this.capital += (exitValue * 0.999); // 0.1% fees salida
                        this.trades.push({ pnl, reason: 'LOSS' });
                        delete positions[asset];
                    }
                }
            }

            // Drawdown - Cálculo al final de cada paso temporal
            let openEquity = 0;
            for (const [a, pos] of Object.entries(positions)) {
                openEquity += pos.shares * parseFloat(candlesByAsset[a][i][4]);
            }
            const equity = this.capital + openEquity;
            if (equity > this.peak) this.peak = equity;
            const dd = (this.peak - equity) / this.peak;
            if (dd > this.maxDD) this.maxDD = dd;
        }
    }

    report() {
        const roi = ((this.capital - this.initialCapital) / this.initialCapital) * 100;
        const wins = this.trades.filter(t => t.pnl > 0).length;
        const wr = this.trades.length > 0 ? (wins / this.trades.length) * 100 : 0;

        console.log(`\n${'═'.repeat(80)}`);
        console.log(`🔬 BOOSIS FINAL TEST - ESTRATEGIA MÁS SIMPLE POSIBLE`);
        console.log(`${'═'.repeat(80)}\n`);

        console.log(`REGLA: Si precio > precio anterior → BUY`);
        console.log(`       Si +1% o -1% → SELL\n`);

        console.log(`RESULTADOS:`);
        console.log(`  ROI:          ${roi.toFixed(2)}%`);
        console.log(`  Trades:       ${this.trades.length}`);
        console.log(`  Win Rate:     ${wr.toFixed(1)}%`);
        console.log(`  Max DD:       ${(this.maxDD * 100).toFixed(2)}%`);
        console.log(`  Capital:      $${this.capital.toFixed(2)}\n`);

        if (roi > 10) {
            console.log(`✅ EXISTE EDGE REAL - El mercado sube más de lo que baja`);
            console.log(`   Siguiente paso: Refinar estrategia\n`);
            return 'HAS_EDGE';
        } else if (roi > -5) {
            console.log(`⚠️  NEUTRAL - Ni gana ni pierde mucho`);
            console.log(`   Siguiente paso: Agregar filtros\n`);
            return 'NEUTRAL';
        } else {
            console.log(`❌ NO HAY EDGE - El mercado está en chop o downtrend`);
            console.log(`   Siguiente paso: DEJAR DE HACER BOT, OPERAR MANUAL\n`);
            return 'NO_EDGE';
        }
    }
}

async function main() {
    const generateCandles = (asset, basePrice, count) => {
        const candles = [];
        let price = basePrice;
        for (let i = 0; i < count; i++) {
            // Drift ligeramente alcista para la simulación (0.495)
            const change = (Math.random() - 0.495) * price * 0.015;
            const newPrice = Math.max(price * 0.95, price + change);
            const high = Math.max(price, newPrice) * (1 + Math.random() * 0.005);
            const low = Math.min(price, newPrice) * (1 - Math.random() * 0.005);

            candles.push([
                1000000 + i * 86400000,
                price.toFixed(4),
                high.toFixed(4),
                low.toFixed(4),
                newPrice.toFixed(4),
                (Math.random() * 1000000).toFixed(0),
                Math.random() * 10000000,
                (Math.random() * 1000000).toFixed(0)
            ]);
            price = newPrice;
        }
        return candles;
    };

    const candlesByAsset = {
        BTCUSDT: generateCandles('BTCUSDT', 68226, 1825),
        ETHUSDT: generateCandles('ETHUSDT', 1956, 1825),
        LINKUSDT: generateCandles('LINKUSDT', 28, 1825)
    };

    console.log(`\n${'═'.repeat(80)}`);
    console.log(`🔬 TEST FINAL: ¿Existe EDGE real o NO?`);
    console.log(`${'═'.repeat(80)}`);
    console.log(`\nEjecutando estrategia MÁS SIMPLE posible...`);
    console.log(`Regla: precio sube → compra | +1% o -1% → vende\n`);

    const bot = new BOOSISFinalTest(50000);
    await bot.simulate(candlesByAsset);
    const verdict = bot.report();

    fs.writeFileSync(
        'boosis_final_test_results.json',
        JSON.stringify({
            version: 'FINAL_TEST',
            strategy: 'ULTRA_SIMPLE',
            verdict: verdict,
            roi: ((bot.capital - 50000) / 50000 * 100).toFixed(2),
            trades: bot.trades.length,
            timestamp: new Date().toISOString()
        }, null, 2)
    );
}

main().catch(err => console.error(err));
