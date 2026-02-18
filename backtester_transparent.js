#!/usr/bin/env node

/**
 * 🔬 BACKTESTER PROFESIONAL TRANSPARENTE
 * 
 * OBJETIVO: Ver EXACTAMENTE qué pasa
 * • Trade by trade
 * • Asset by asset
 * • Narrativa por narrativa
 * • Drawdown en tiempo real
 * • Donde fallan los trades
 * 
 * SIN MAGIA. SOLO HECHOS.
 */

require('dotenv').config();
const fs = require('fs');

class BacktesterTransparente {
    constructor(initialCapital = 50000) {
        this.initialCapital = initialCapital;
        this.capital = initialCapital;
        this.peak = initialCapital;
        this.maxDD = 0;
        this.trades = [];
        this.assetPerformance = {};
        this.narrativePerformance = {};
        this.dailyLog = [];
        this.detailedTradeLog = [];
        this.equityHistory = [];
        this.entryCount = 0;
        this.exitCount = 0;
    }

    // ═══════════════════════════════════════════════════════════════════════
    // INDICADORES SIMPLES Y TRANSPARENTES
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
            const h = highs[i];
            const l = lows[i];
            const pc = closes[i - 1];
            tr.push(Math.max(
                h - l,
                Math.abs(h - pc),
                Math.abs(l - pc)
            ));
        }
        if (tr.length < period) return closes[closes.length - 1] * 0.01;
        return tr.slice(-period).reduce((a, b) => a + b) / period;
    }

    // ═══════════════════════════════════════════════════════════════════════
    // LÓGICA DE ENTRADA (SIMPLE Y CLARA)
    // ═══════════════════════════════════════════════════════════════════════

    evaluateEntry(asset, closes, highs, lows, volumes, timestamp) {
        if (closes.length < 20) return null;

        const rsiValue = this.rsi(closes);
        const atrValue = this.atr(highs, lows, closes);
        const close = closes[closes.length - 1];
        const prevClose = closes[closes.length - 2];
        const volume = volumes[volumes.length - 1];

        // CRITERIOS ENTRADA
        const bullishRSI = rsiValue > 45 && rsiValue < 75; // RSI bullish pero no extremo
        const volumeOK = volume > 100000; // Volumen mínimo
        const volatilityOK = (atrValue / close) * 100 > 0.5 && (atrValue / close) * 100 < 5; // ATR realista
        const momentum = close > prevClose; // Cerró arriba

        const score = [bullishRSI, volumeOK, volatilityOK, momentum].filter(Boolean).length;

        if (score < 3) {
            return null; // Necesita al menos 3 criterios
        }

        // ENTRADA
        const entry = {
            asset: asset,
            entryPrice: close,
            stopLoss: close - (atrValue * 1.5),
            target: close + (atrValue * 2.5),
            atr: atrValue,
            rsi: rsiValue,
            timestamp: timestamp,
            reason: `RSI:${rsiValue.toFixed(1)} | ATR:${(atrValue / close * 100).toFixed(2)}% | Vol:OK`
        };

        return entry;
    }

    // ═══════════════════════════════════════════════════════════════════════
    // LÓGICA DE SALIDA (SIMPLE Y CLARA)
    // ═══════════════════════════════════════════════════════════════════════

    evaluateExit(position, close, rsiValue, timestamp) {
        if (!position) return null;

        const pnl = ((close - position.entryPrice) / position.entryPrice) * 100;

        // GANANCIA
        if (close >= position.target) {
            return {
                exitPrice: close,
                pnl: pnl,
                reason: 'TARGET_HIT',
                timestamp: timestamp
            };
        }

        // STOP LOSS
        if (close <= position.stopLoss) {
            return {
                exitPrice: close,
                pnl: pnl,
                reason: 'STOP_LOSS',
                timestamp: timestamp
            };
        }

        // PÁNICO (RSI < 25)
        if (rsiValue < 25) {
            return {
                exitPrice: close,
                pnl: pnl,
                reason: 'PANIC_RSI',
                timestamp: timestamp
            };
        }

        return null;
    }

    // ═══════════════════════════════════════════════════════════════════════
    // SIMULACIÓN TRANSPARENTE
    // ═══════════════════════════════════════════════════════════════════════

    async simulate(candlesByAsset) {
        const positions = {}; // { asset: position }
        let dayCounter = 0;

        const maxLen = Math.max(...Object.values(candlesByAsset).map(c => c.length));

        for (let i = 100; i < maxLen; i++) {
            // LOG DIARIO
            if (i % 1 === 0 && i > 100) {
                dayCounter++;
                this.equityHistory.push({
                    day: dayCounter,
                    capital: this.capital,
                    openPositions: Object.keys(positions).length,
                    peak: this.peak,
                    drawdown: ((this.peak - this.capital) / this.peak * 100).toFixed(2)
                });

                // Reset daily
                if (dayCounter % 30 === 0) {
                    // No verbose logging during simulation to keep output clean, 
                    // but can be added if needed.
                }
            }

            // PROCESAR CADA ASSET
            for (const [assetName, candles] of Object.entries(candlesByAsset)) {
                if (i >= candles.length) continue;

                const slice = candles.slice(Math.max(0, i - 50), i);
                const closes = slice.map(c => parseFloat(c[4]));
                const highs = slice.map(c => parseFloat(c[2]));
                const lows = slice.map(c => parseFloat(c[3]));
                const volumes = slice.map(c => parseFloat(c[7]));
                const currentCandle = candles[i];
                const timestamp = currentCandle[0];

                const close = parseFloat(currentCandle[4]);
                const rsiValue = this.rsi(closes);

                // ENTRADA
                if (!positions[assetName]) {
                    const entry = this.evaluateEntry(assetName, closes, highs, lows, volumes, timestamp);

                    if (entry && this.capital > 100) {
                        // Risk management simple: 2% del capital arriesgado por trade
                        const positionCapital = this.capital * 0.02;
                        const shares = positionCapital / entry.entryPrice;

                        positions[assetName] = {
                            entryPrice: entry.entryPrice,
                            shares: shares,
                            capital: positionCapital,
                            stopLoss: entry.stopLoss,
                            target: entry.target,
                            atr: entry.atr,
                            entryTime: timestamp,
                            entryReason: entry.reason,
                            narrative: this.identifyNarrative(assetName)
                        };

                        this.capital -= positionCapital * 1.001; // Comisión 0.1%
                        this.entryCount++;

                        // LOG DETALLADO
                        this.detailedTradeLog.push({
                            type: 'ENTRY',
                            asset: assetName,
                            price: entry.entryPrice,
                            shares: shares.toFixed(4),
                            narrative: positions[assetName].narrative,
                            reason: entry.reason,
                            capital: this.capital.toFixed(2),
                            timestamp: dayCounter
                        });
                    }
                }

                // SALIDA
                if (positions[assetName]) {
                    const exit = this.evaluateExit(positions[assetName], close, rsiValue, timestamp);

                    if (exit) {
                        const exitCapital = positions[assetName].shares * exit.exitPrice;
                        const grossProfit = exitCapital * 0.999; // Comisión 0.1%
                        const pnl = exit.pnl;

                        this.capital += grossProfit;

                        // TRACK POR ASSET
                        if (!this.assetPerformance[assetName]) {
                            this.assetPerformance[assetName] = { trades: 0, wins: 0, totalPnL: 0 };
                        }
                        this.assetPerformance[assetName].trades++;
                        if (pnl > 0) this.assetPerformance[assetName].wins++;
                        this.assetPerformance[assetName].totalPnL += pnl;

                        // TRACK POR NARRATIVA
                        const narrative = positions[assetName].narrative;
                        if (!this.narrativePerformance[narrative]) {
                            this.narrativePerformance[narrative] = { trades: 0, wins: 0, totalPnL: 0 };
                        }
                        this.narrativePerformance[narrative].trades++;
                        if (pnl > 0) this.narrativePerformance[narrative].wins++;
                        this.narrativePerformance[narrative].totalPnL += pnl;

                        // LOG DETALLADO
                        this.detailedTradeLog.push({
                            type: 'EXIT',
                            asset: assetName,
                            entryPrice: positions[assetName].entryPrice,
                            exitPrice: exit.exitPrice,
                            pnl: pnl.toFixed(2),
                            reason: exit.reason,
                            capital: this.capital.toFixed(2),
                            timestamp: dayCounter
                        });

                        this.trades.push({
                            asset: assetName,
                            entry: positions[assetName].entryPrice,
                            exit: exit.exitPrice,
                            pnl: pnl,
                            reason: exit.reason,
                            narrative: positions[assetName].narrative
                        });

                        this.exitCount++;
                        delete positions[assetName];
                    }
                }
            }

            // DRAWDOWN (Equity = Capital libre + Valor de posiciones abiertas)
            let openEquity = 0;
            for (const [assetName, pos] of Object.entries(positions)) {
                const lastClose = parseFloat(candlesByAsset[assetName][i][4]);
                openEquity += pos.shares * lastClose;
            }

            const totalEquity = this.capital + openEquity;
            if (totalEquity > this.peak) this.peak = totalEquity;
            const dd = (this.peak - totalEquity) / this.peak;
            if (dd > this.maxDD) this.maxDD = dd;
        }
    }

    identifyNarrative(asset) {
        if (asset.includes('BTC') || asset.includes('ETH')) return 'CORE';
        if (asset.includes('SOL') || asset.includes('HYPE') || asset.includes('SUI')) return 'UTILITY';
        if (asset.includes('LINK') || asset.includes('SYRUP')) return 'RWA';
        if (asset.includes('FET') || asset.includes('KAITO')) return 'AI';
        return 'UNKNOWN';
    }

    // ═══════════════════════════════════════════════════════════════════════
    // REPORTE FINAL
    // ═══════════════════════════════════════════════════════════════════════

    generateReport() {
        const roi = ((this.capital - this.initialCapital) / this.initialCapital) * 100;
        const wins = this.trades.filter(t => t.pnl > 0).length;
        const wr = this.trades.length > 0 ? (wins / this.trades.length) * 100 : 0;

        process.stdout.write(`\n${'═'.repeat(80)}\n`);
        process.stdout.write(`📊 BACKTESTER TRANSPARENTE - REPORTE FINAL\n`);
        process.stdout.write(`${'═'.repeat(80)}\n\n`);

        process.stdout.write(`MÉTRICAS GENERALES:\n`);
        process.stdout.write(`  ROI:                ${roi.toFixed(2)}%\n`);
        process.stdout.write(`  Trades Totales:     ${this.trades.length}\n`);
        process.stdout.write(`  Entradas:           ${this.entryCount}\n`);
        process.stdout.write(`  Salidas:            ${this.exitCount}\n`);
        process.stdout.write(`  Win Rate:           ${wr.toFixed(1)}%\n`);
        process.stdout.write(`  Max Drawdown:       ${(this.maxDD * 100).toFixed(2)}%\n`);
        process.stdout.write(`  Calmar Ratio:       ${(this.maxDD > 0) ? (roi / (this.maxDD * 100)).toFixed(2) : 'N/A'}\n`);
        process.stdout.write(`  Capital Final:      $${this.capital.toFixed(2)}\n\n`);

        process.stdout.write(`PERFORMANCE POR ASSET:\n`);
        process.stdout.write(`${'─'.repeat(80)}\n`);
        for (const [asset, perf] of Object.entries(this.assetPerformance)) {
            const assetWR = perf.trades > 0 ? ((perf.wins / perf.trades) * 100).toFixed(1) : '0';
            process.stdout.write(`${asset.padEnd(12)} | Trades: ${perf.trades.toString().padEnd(3)} | Wins: ${perf.wins.toString().padEnd(3)} | WR: ${assetWR.padEnd(5)}% | PnL: ${perf.totalPnL.toFixed(2)}%\n`);
        }

        process.stdout.write(`\nPERFORMANCE POR NARRATIVA:\n`);
        process.stdout.write(`${'─'.repeat(80)}\n`);
        for (const [narrative, perf] of Object.entries(this.narrativePerformance)) {
            const narWR = perf.trades > 0 ? ((perf.wins / perf.trades) * 100).toFixed(1) : '0';
            process.stdout.write(`${narrative.padEnd(12)} | Trades: ${perf.trades.toString().padEnd(3)} | Wins: ${perf.wins.toString().padEnd(3)} | WR: ${narWR.padEnd(5)}% | PnL: ${perf.totalPnL.toFixed(2)}%\n`);
        }

        process.stdout.write(`\n${'═'.repeat(80)}\n\n`);

        return {
            roi: roi.toFixed(2),
            trades: this.trades.length,
            wr: wr.toFixed(1),
            maxDD: (this.maxDD * 100).toFixed(2),
            assetPerformance: this.assetPerformance,
            narrativePerformance: this.narrativePerformance,
            detailedTradeLog: this.detailedTradeLog.slice(0, 50)
        };
    }
}

// ═══════════════════════════════════════════════════════════════════════════

async function main() {
    process.stdout.write(`\n${'═'.repeat(80)}\n`);
    process.stdout.write(`🔬 BACKTESTER PROFESIONAL TRANSPARENTE\n`);
    process.stdout.write(`Vamos a ver EXACTAMENTE qué pasa sin magia\n`);
    process.stdout.write(`${'═'.repeat(80)}\n\n`);

    const generateCandles = (asset, basePrice, count) => {
        const candles = [];
        let price = basePrice;

        for (let i = 0; i < count; i++) {
            // Para simular el mercado 2025-2026, usamos drift ligeramente alcista (0.498 instead of 0.5)
            const volatility = asset === 'BTC' ? 0.015 : asset === 'ETH' ? 0.020 : 0.025;
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
        BTCUSDT: generateCandles('BTC', 68226, 1825),
        ETHUSDT: generateCandles('ETH', 1956, 1825),
        SOLUSDT: generateCandles('SOL', 95, 1825),
        HYPEUSDT: generateCandles('HYPE', 45, 1825),
        SUIUSDT: generateCandles('SUI', 3.2, 1825),
        LINKUSDT: generateCandles('LINK', 28, 1825),
        FETUSDT: generateCandles('FET', 3.5, 1825)
    };

    const backtester = new BacktesterTransparente(50000);
    process.stdout.write(`Iniciando backtest... (esto puede tomar 10-20 segundos)\n\n`);

    await backtester.simulate(candlesByAsset);

    const report = backtester.generateReport();

    fs.writeFileSync(
        'backtester_transparent_report.json',
        JSON.stringify({
            timestamp: new Date().toISOString(),
            summary: {
                roi: report.roi,
                trades: report.trades,
                winRate: report.wr,
                maxDD: report.maxDD,
                assetPerformance: report.assetPerformance,
                narrativePerformance: report.narrativePerformance
            },
            detailedTrades: report.detailedTradeLog
        }, null, 2)
    );

    process.stdout.write(`✅ Reporte guardado: backtester_transparent_report.json\n`);
    process.stdout.write(`\n🎯 NEXT: Ver DÓNDE fallan los trades\n\n`);
}

main().catch(err => console.error('Error:', err.message));
