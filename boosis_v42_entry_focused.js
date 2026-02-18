#!/usr/bin/env node

/**
 * 🎯 BOOSIS v4.2 ENTRY-FOCUSED
 * 
 * CAMBIO RADICAL:
 * 
 * v4.1 PROBLEMA: Win Rate 24.1% (demasiadas entradas malas)
 * v4.2 SOLUCIÓN: Entrada MÁS SELECTIVA
 * 
 * ESTRATEGIA:
 * • Solo LINK + ETH (los ganadores reales)
 * • Eliminar FET (falsos positivos)
 * • Entrada SOLO cuando coinciden 4/5 criterios (más estricto)
 * • Win Rate TARGET: > 45%
 * • ROI TARGET: +30-40%
 * 
 * IDEA: Es mejor 50 trades rentables que 515 trades pérdidas
 */

require('dotenv').config();
const fs = require('fs');

class BOOSISv42EntryFocused {
    constructor(initialCapital = 50000) {
        this.initialCapital = initialCapital;
        this.capital = initialCapital;
        this.peak = initialCapital;
        this.maxDD = 0;
        this.trades = [];
        this.assetPerformance = {};
        this.narrativePerformance = {};
        this.rejectedEntries = 0;
        this.acceptedEntries = 0;

        // SOLO los ganadores
        this.allowedAssets = ['LINKUSDT', 'ETHUSDT'];
    }

    // ═══════════════════════════════════════════════════════════════════════
    // ENTRADA ULTRA-SELECTIVA (4/5 criterios)
    // ═══════════════════════════════════════════════════════════════════════

    evaluateEntry(asset, closes, highs, lows, volumes) {
        /**
         * CAMBIO CLAVE: Entrada MÁS SELECTIVA
         * Necesita cumplir 4 de 5 criterios (antes era 3 de 4)
         */

        if (closes.length < 50) return null;

        const rsiValue = this.rsi(closes);
        const atrValue = this.atr(highs, lows, closes);
        const close = closes[closes.length - 1];
        const prevClose = closes[closes.length - 2];
        const prevPrevClose = closes[closes.length - 3];
        const volume = volumes[volumes.length - 1];
        const avgVolume = volumes.slice(-20).reduce((a, b) => a + b) / 20;

        // 5 CRITERIOS ESTRICTOS
        const criteria = {
            bullishRSI: rsiValue > 50 && rsiValue < 70, // RSI en zona alcista pero no sobrecomprado
            strongMomentum: close > prevClose && prevClose > prevPrevClose, // 2 velas alcistas consecutivas
            volumeConfirmation: volume > avgVolume * 1.2, // Volumen > 120% promedio
            volatilityControlled: (atrValue / close) * 100 < 3, // ATR < 3% (no demasiado volátil)
            priceAboveSMA: close > closes.slice(-50).reduce((a, b) => a + b) / 50 // Precio > SMA50
        };

        const score = Object.values(criteria).filter(Boolean).length;

        // NECESITA 4 de 5
        if (score < 4) {
            this.rejectedEntries++;
            return null;
        }

        this.acceptedEntries++;

        return {
            asset: asset,
            entryPrice: close,
            stopLoss: close - (atrValue * 1.5), // Stop a 1.5x ATR
            target: close + (atrValue * 3.5), // Target +5-6%
            atr: atrValue,
            rsi: rsiValue,
            criteria: score,
            confidence: (score / 5) * 100
        };
    }

    // ═══════════════════════════════════════════════════════════════════════
    // SALIDA INTELIGENTE
    // ═══════════════════════════════════════════════════════════════════════

    evaluateExit(position, close, rsiValue) {
        if (!position) return null;

        const pnl = ((close - position.entryPrice) / position.entryPrice) * 100;

        // TARGET
        if (close >= position.target) {
            return { exitPrice: close, pnl: pnl, reason: 'TARGET_HIT' };
        }

        // STOP LOSS
        if (close <= position.stopLoss) {
            return { exitPrice: close, pnl: pnl, reason: 'STOP_LOSS' };
        }

        // PARTIAL PROFIT: Toma 50% en +3% (Simulado simplificado aqui como logica interna)
        if (pnl >= 3 && !position.partialTaken) {
            position.partialTaken = true;
            // En una ejecucion real aqui cerrariamos mitad. Aqui simplificamos a "mantener mas fuerte"
        }

        // TRAILING STOP (protege ganancias)
        if (pnl > 2 && close < position.highest - (position.atr * 1.0)) {
            return { exitPrice: close, pnl: pnl, reason: 'TRAILING_STOP' };
        }

        // PANIC (RSI < 25)
        if (rsiValue < 25) {
            return { exitPrice: close, pnl: pnl, reason: 'PANIC_EXIT' };
        }

        // Update highest
        if (close > position.highest) {
            position.highest = close;
        }

        return null;
    }

    // ═══════════════════════════════════════════════════════════════════════
    // INDICADORES
    // ═══════════════════════════════════════════════════════════════════════

    rsi(closes, period = 14) {
        if (closes.length < period + 1) return 50;
        let gains = 0, losses = 0;
        for (let i = closes.length - period; i < closes.length; i++) {
            const diff = closes[i] - closes[i - 1];
            if (diff > 0) gains += diff;
            else losses -= diff;
        }
        gains /= period;
        losses /= period;
        if (losses === 0) return 100;
        return 100 - (100 / (1 + gains / losses));
    }

    atr(highs, lows, closes, period = 14) {
        const tr = [];
        for (let i = 1; i < Math.min(closes.length, highs.length, lows.length); i++) {
            tr.push(Math.max(
                highs[i] - lows[i],
                Math.abs(highs[i] - closes[i - 1]),
                Math.abs(lows[i] - closes[i - 1])
            ));
        }
        if (tr.length < period) return closes[closes.length - 1] * 0.01;
        return tr.slice(-period).reduce((a, b) => a + b) / period;
    }

    // ═══════════════════════════════════════════════════════════════════════
    // SIMULACIÓN
    // ═══════════════════════════════════════════════════════════════════════

    async simulate(candlesByAsset) {
        const positions = {};
        let dayCounter = 0;

        const maxLen = Math.max(...Object.values(candlesByAsset).map(c => c.length));

        for (let i = 100; i < maxLen; i++) {
            if (i % 100 === 0 && i > 100) {
                dayCounter++;
                const openPositions = Object.keys(positions).length;
                const dd = ((this.peak - this.capital) / this.peak * 100).toFixed(2);
                // console.log(`[Day ${dayCounter}] Capital: $${this.capital.toFixed(0)} | Open: ${openPositions} | Entries Accepted: ${this.acceptedEntries} | DD: ${dd}%`);
            }

            // PROCESAR SOLO ASSETS PERMITIDOS
            for (const asset of this.allowedAssets) {
                if (!candlesByAsset[asset]) continue;
                if (i >= candlesByAsset[asset].length) continue;

                const candles = candlesByAsset[asset];
                const slice = candles.slice(Math.max(0, i - 50), i);
                const closes = slice.map(c => parseFloat(c[4]));
                const highs = slice.map(c => parseFloat(c[2]));
                const lows = slice.map(c => parseFloat(c[3]));
                const volumes = slice.map(c => parseFloat(c[7]));

                const close = parseFloat(candles[i][4]);
                const rsiValue = this.rsi(closes);

                // ENTRADA (MÁS SELECTIVA)
                if (!positions[asset]) {
                    const entry = this.evaluateEntry(asset, closes, highs, lows, volumes);

                    if (entry && this.capital > 100) {
                        const positionCapital = this.capital * 0.025; // 2.5% del capital
                        const shares = positionCapital / entry.entryPrice;

                        positions[asset] = {
                            entryPrice: entry.entryPrice,
                            shares: shares,
                            capital: positionCapital,
                            stopLoss: entry.stopLoss,
                            target: entry.target,
                            atr: entry.atr,
                            highest: close,
                            partialTaken: false,
                            narrative: asset.includes('LINK') ? 'RWA' : 'CORE'
                        };

                        this.capital -= positionCapital * 1.001;
                    }
                }

                // SALIDA
                if (positions[asset]) {
                    const exit = this.evaluateExit(positions[asset], close, rsiValue);

                    if (exit) {
                        const exitCapital = positions[asset].shares * exit.exitPrice;
                        const grossProfit = exitCapital * 0.999;
                        const pnl = exit.pnl;

                        this.capital += grossProfit;

                        // TRACK
                        if (!this.assetPerformance[asset]) {
                            this.assetPerformance[asset] = { trades: 0, wins: 0, totalPnL: 0 };
                        }
                        this.assetPerformance[asset].trades++;
                        if (pnl > 0) this.assetPerformance[asset].wins++;
                        this.assetPerformance[asset].totalPnL += pnl;

                        const narrative = positions[asset].narrative;
                        if (!this.narrativePerformance[narrative]) {
                            this.narrativePerformance[narrative] = { trades: 0, wins: 0, totalPnL: 0 };
                        }
                        this.narrativePerformance[narrative].trades++;
                        if (pnl > 0) this.narrativePerformance[narrative].wins++;
                        this.narrativePerformance[narrative].totalPnL += pnl;

                        this.trades.push({
                            asset: asset,
                            pnl: pnl,
                            reason: exit.reason,
                            narrative: narrative
                        });

                        delete positions[asset];
                    }
                }
            }

            // DRAWDOWN
            let openEquity = 0;
            for (const [asset, pos] of Object.entries(positions)) {
                const lastClose = parseFloat(candlesByAsset[asset][i][4]);
                openEquity += pos.shares * lastClose;
            }

            const totalEquity = this.capital + openEquity;
            if (totalEquity > this.peak) this.peak = totalEquity;
            const dd = (this.peak - totalEquity) / this.peak;
            if (dd > this.maxDD) this.maxDD = dd;
        }
    }

    // ═══════════════════════════════════════════════════════════════════════
    // REPORTE
    // ═══════════════════════════════════════════════════════════════════════

    generateReport() {
        const roi = ((this.capital - this.initialCapital) / this.initialCapital) * 100;
        const wins = this.trades.filter(t => t.pnl > 0).length;
        const wr = this.trades.length > 0 ? (wins / this.trades.length) * 100 : 0;

        console.log(`\n${'═'.repeat(80)}`);
        console.log(`📊 BOOSIS v4.2 ENTRY-FOCUSED - REPORTE FINAL`);
        console.log(`${'═'.repeat(80)}\n`);

        console.log(`MÉTRICA CRÍTICA:`);
        console.log(`  Entradas Rechazadas: ${this.rejectedEntries} (TOO NOISY)`);
        console.log(`  Entradas Aceptadas:  ${this.acceptedEntries} (HIGH QUALITY)\n`);

        console.log(`MÉTRICAS GENERALES:`);
        console.log(`  ROI:                ${roi.toFixed(2)}%`);
        console.log(`  Trades Totales:     ${this.trades.length}`);
        console.log(`  Win Rate:           ${wr.toFixed(1)}%`);
        console.log(`  Max Drawdown:       ${(this.maxDD * 100).toFixed(2)}%`);
        console.log(`  Calmar Ratio:       ${roi / (this.maxDD * 100) > 0 ? (roi / (this.maxDD * 100)).toFixed(2) : 'N/A'}`);
        console.log(`  Capital Final:      $${this.capital.toFixed(2)}\n`);

        console.log(`PERFORMANCE POR ASSET (SOLO GANADORES):`);
        console.log(`${'─'.repeat(80)}`);
        for (const [asset, perf] of Object.entries(this.assetPerformance)) {
            const assetWR = perf.trades > 0 ? ((perf.wins / perf.trades) * 100).toFixed(1) : '0';
            console.log(`${asset.padEnd(12)} | Trades: ${perf.trades.toString().padEnd(3)} | Wins: ${perf.wins.toString().padEnd(3)} | WR: ${assetWR.padEnd(5)}% | PnL: ${perf.totalPnL.toFixed(2)}%`);
        }

        console.log(`\nPERFORMANCE POR NARRATIVA:`);
        console.log(`${'─'.repeat(80)}`);
        for (const [narrative, perf] of Object.entries(this.narrativePerformance)) {
            const narWR = perf.trades > 0 ? ((perf.wins / perf.trades) * 100).toFixed(1) : '0';
            console.log(`${narrative.padEnd(12)} | Trades: ${perf.trades.toString().padEnd(3)} | Wins: ${perf.wins.toString().padEnd(3)} | WR: ${narWR.padEnd(5)}% | PnL: ${perf.totalPnL.toFixed(2)}%`);
        }

        console.log(`\n${'═'.repeat(80)}\n`);

        return {
            roi: roi.toFixed(2),
            trades: this.trades.length,
            wr: wr.toFixed(1),
            maxDD: (this.maxDD * 100).toFixed(2),
            rejectedEntries: this.rejectedEntries,
            acceptedEntries: this.acceptedEntries,
            verdict: parseFloat(roi) > 25 ? '✅ PAPER TRADING READY' : '⚠️ NEEDS MORE WORK'
        };
    }
}

// ═══════════════════════════════════════════════════════════════════════════

async function main() {
    console.log(`\n${'═'.repeat(80)}`);
    console.log(`🎯 BOOSIS v4.2 ENTRY-FOCUSED BACKTEST`);
    console.log(`Entrada MÁS selectiva (4/5 criterios), Solo LINK+ETH, Win Rate > 45%\n`);
    console.log(`${'═'.repeat(80)}\n`);

    // Generar datos
    const generateCandles = (asset, basePrice, count) => {
        const candles = [];
        let price = basePrice;

        for (let i = 0; i < count; i++) {
            // Mercado 2025-2026: sesgo leve alcista (0.495)
            const volatility = asset === 'ETHUSDT' ? 0.020 : 0.015;
            const change = (Math.random() - 0.495) * price * volatility;
            const newPrice = Math.max(price * 0.40, price + change);
            const high = Math.max(price, newPrice) * (1 + Math.random() * 0.008);
            const low = Math.min(price, newPrice) * (1 - Math.random() * 0.008);
            const volume = Math.random() * 5000000;

            candles.push([
                1000000 + i * 86400000,
                price.toFixed(4),
                high.toFixed(4),
                low.toFixed(4),
                newPrice.toFixed(4),
                volume.toFixed(0),
                Math.random() * 50000000,
                volume.toFixed(0)
            ]);

            price = newPrice;
        }

        return candles;
    };

    const candlesByAsset = {
        LINKUSDT: generateCandles('LINKUSDT', 28, 1825),
        ETHUSDT: generateCandles('ETHUSDT', 1956, 1825)
    };

    const backtester = new BOOSISv42EntryFocused(50000);
    console.log(`Iniciando backtest v4.2 (4/5 criterios, LINK+ETH)...\n`);

    await backtester.simulate(candlesByAsset);

    const report = backtester.generateReport();

    fs.writeFileSync(
        'boosis_v42_entry_focused_results.json',
        JSON.stringify({
            timestamp: new Date().toISOString(),
            version: 'v4.2 ENTRY-FOCUSED',
            metrics: report
        }, null, 2)
    );

    console.log(`✅ Backtest completado`);
    console.log(`📁 Resultados: boosis_v42_entry_focused_results.json`);
    console.log(`\n${report.verdict}\n`);
}

main().catch(err => console.error('Error:', err.message));
