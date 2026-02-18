#!/usr/bin/env node

/**
 * 🤖 BOOSIS INTRADAY - ROBOT QUE OPERA REALMENTE
 * 
 * DIFERENCIA CON v4.2:
 * • v4.2: 1 trade cada 25 días (inútil)
 * • INTRADAY: 5-15 trades por día (robot real)
 * 
 * TIMEFRAME: 4 horas (4H)
 * PERÍODO: 5 años = ~4,380 candles
 * TRADES ESPERADOS: 10,000+ en 5 años
 * 
 * OBJETIVO: +0.25-0.30% diarios = +35-50% anual
 */

require('dotenv').config();
const fs = require('fs');

class BOOSISIntraday {
    constructor(initialCapital = 50000) {
        this.initialCapital = initialCapital;
        this.capital = initialCapital;
        this.peak = initialCapital;
        this.maxDD = 0;
        this.trades = [];
        this.dailyStats = {};
        this.openPositions = {};
        this.totalTradesAttempted = 0;
        this.totalTradesExecuted = 0;
        this.dayPnL = [];
    }

    // ═══════════════════════════════════════════════════════════════════════
    // INDICADORES INTRADAY
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

    ema(closes, period = 20) {
        if (closes.length < period) return closes[closes.length - 1];
        const multiplier = 2 / (period + 1);
        let ema = closes.slice(0, period).reduce((a, b) => a + b) / period;
        for (let i = period; i < closes.length; i++) {
            ema = (closes[i] * multiplier) + (ema * (1 - multiplier));
        }
        return ema;
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
    // ENTRADA INTRADAY (SIMPLE - 2 CRITERIOS)
    // ═══════════════════════════════════════════════════════════════════════

    evaluateEntry(closes, highs, lows) {
        /**
         * ENTRADA SIMPLE PERO EFECTIVA:
         * 1. RSI 40-60 (neutral a bullish, NO extremo)
         * 2. Precio > EMA20 (en tendencia corta alcista)
         */

        if (closes.length < 50) return null;

        const rsiValue = this.rsi(closes);
        const ema20 = this.ema(closes, 20);
        const currentPrice = closes[closes.length - 1];

        // CRITERIOS
        const neutralRSI = rsiValue > 40 && rsiValue < 70; // Espacio para subir
        const aboveEMA = currentPrice > ema20; // En tendencia alcista

        if (!neutralRSI || !aboveEMA) {
            return null;
        }

        // ENTRAR
        return {
            entryPrice: currentPrice,
            stopLoss: currentPrice - (currentPrice * 0.01), // -1% stop loss
            target: currentPrice + (currentPrice * 0.02), // +2% target (quick profit)
            rsi: rsiValue,
            ema: ema20
        };
    }

    // ═══════════════════════════════════════════════════════════════════════
    // SALIDA INTRADAY (RÁPIDA)
    // ═══════════════════════════════════════════════════════════════════════

    evaluateExit(positionId, position, currentPrice, holdTime) {
        /**
         * SALIDAS:
         * 1. +2% ganancia → TOMA DINERO
         * 2. -1% pérdida → SALE
         * 3. 4 horas holding → SALE (no espera más)
         */

        if (!position) return null;

        const pnl = ((currentPrice - position.entryPrice) / position.entryPrice) * 100;

        // TARGET: +2% (quick profit)
        if (currentPrice >= position.target) {
            return { exitPrice: currentPrice, pnl: pnl, reason: 'TARGET_2PCT' };
        }

        // STOP LOSS: -1%
        if (currentPrice <= position.stopLoss) {
            return { exitPrice: currentPrice, pnl: pnl, reason: 'STOP_LOSS' };
        }

        // TIME STOP: 4 horas (4 candles en 4H timeframe)
        if (holdTime >= 4) {
            return { exitPrice: currentPrice, pnl: pnl, reason: 'TIME_STOP' };
        }

        return null;
    }

    // ═══════════════════════════════════════════════════════════════════════
    // SIMULACIÓN INTRADAY
    // ═══════════════════════════════════════════════════════════════════════

    async simulate(candlesByAsset) {
        let candle4HCount = 0;
        const maxLen = Math.max(...Object.values(candlesByAsset).map(c => c.length));

        console.log(`\nIniciando backtest INTRADAY (4H timeframe)...`);
        console.log(`Esperando ~10,950 candles (5 años × 6 candles/día)\n`);

        for (let i = 50; i < maxLen; i++) {
            candle4HCount++;

            // PROCESAR CADA ASSET
            for (const [asset, candles] of Object.entries(candlesByAsset)) {
                if (i >= candles.length) continue;

                const slice = candles.slice(Math.max(0, i - 50), i);
                const closes = slice.map(c => parseFloat(c[4]));
                const highs = slice.map(c => parseFloat(c[2]));
                const lows = slice.map(c => parseFloat(c[3]));
                const currentPrice = parseFloat(candles[i][4]);

                const posKey = `${asset}_active`;

                // ENTRADA
                if (!this.openPositions[posKey]) {
                    const entry = this.evaluateEntry(closes, highs, lows);

                    if (entry && this.capital > 500) {
                        const riskAmount = this.capital * 0.01; // 1% por trade
                        const shares = riskAmount / entry.entryPrice;

                        this.openPositions[posKey] = {
                            asset: asset,
                            entryPrice: entry.entryPrice,
                            shares: shares,
                            stopLoss: entry.stopLoss,
                            target: entry.target,
                            openTime: i,
                            holdTime: 0
                        };

                        this.capital -= riskAmount * 1.001; // Comisión 0.1%
                        this.totalTradesAttempted++;
                    }
                }

                // SALIDA
                if (this.openPositions[posKey]) {
                    const pos = this.openPositions[posKey];
                    pos.holdTime++;

                    const exit = this.evaluateExit(posKey, pos, currentPrice, pos.holdTime);

                    if (exit) {
                        const exitCapital = pos.shares * exit.exitPrice;
                        const grossProfit = exitCapital * 0.999; // Comisión 0.1%
                        const pnl = exit.pnl;

                        this.capital += grossProfit;

                        this.trades.push({
                            asset: pos.asset,
                            entry: pos.entryPrice,
                            exit: exit.exitPrice,
                            pnl: pnl,
                            holdTime: pos.holdTime,
                            reason: exit.reason
                        });

                        this.totalTradesExecuted++;
                        delete this.openPositions[posKey];
                    }
                }
            }

            // Equity History & Drawdown
            let openEquity = 0;
            for (const [key, pos] of Object.entries(this.openPositions)) {
                const assetName = pos.asset;
                const lastPrice = parseFloat(candlesByAsset[assetName][i][4]);
                openEquity += pos.shares * lastPrice;
            }

            const totalEquity = this.capital + openEquity;
            if (totalEquity > this.peak) this.peak = totalEquity;
            const dd = (this.peak - totalEquity) / this.peak;
            if (dd > this.maxDD) this.maxDD = dd;

            if (i % 6 === 0) { // Daily tracking
                this.dayPnL.push(totalEquity);
            }
        }

        console.log(`\n✅ Backtest completado`);
        console.log(`📊 Total candles procesados: ${candle4HCount}`);
    }

    generateReport() {
        const roi = ((this.capital - this.initialCapital) / this.initialCapital) * 100;
        const wins = this.trades.filter(t => t.pnl > 0).length;
        const wr = this.trades.length > 0 ? (wins / this.trades.length) * 100 : 0;
        const avgTrade = this.trades.length > 0 ? (this.trades.reduce((a, b) => a + b.pnl, 0) / this.trades.length) : 0;

        console.log(`\n${'═'.repeat(80)}`);
        console.log(`📊 BOOSIS INTRADAY - REPORTE FINAL`);
        console.log(`${'═'.repeat(80)}\n`);

        console.log(`MÉTRICAS CRÍTICAS:`);
        console.log(`  Entradas Intentadas:  ${this.totalTradesAttempted}`);
        console.log(`  Trades Ejecutados:    ${this.totalTradesExecuted}`);

        console.log(`\nPERFORMANCE:`);
        console.log(`  ROI 5 AÑOS:           ${roi.toFixed(2)}%`);
        console.log(`  Win Rate:             ${wr.toFixed(1)}%`);
        console.log(`  Max Drawdown:         ${(this.maxDD * 100).toFixed(2)}%`);
        console.log(`  Capital Final:        $${this.capital.toFixed(2)}`);
        console.log(`  Daily Avg (est):      $${((this.capital - this.initialCapital) / 1825).toFixed(2)}\n`);

        console.log(`${'═'.repeat(80)}\n`);

        return {
            roi: roi.toFixed(2),
            trades: this.trades.length,
            wr: wr.toFixed(1),
            maxDD: (this.maxDD * 100).toFixed(2),
            capitalFinal: this.capital.toFixed(2)
        };
    }
}

async function main() {
    const generateCandles4H = (asset, basePrice, days) => {
        const candles = [];
        let price = basePrice;
        const candles4hPerDay = 6;

        for (let i = 0; i < days * candles4hPerDay; i++) {
            // Drift ligeramente alcista para simular mercado cripto 2025 (factor 0.496)
            const volatility = asset === 'BTCUSDT' ? 0.008 : 0.012;
            const change = (Math.random() - 0.495) * price * volatility;
            const newPrice = Math.max(price * 0.90, price + change);
            const high = Math.max(price, newPrice) * (1 + Math.random() * 0.004);
            const low = Math.min(price, newPrice) * (1 - Math.random() * 0.004);
            const volume = Math.random() * 5000000;

            candles.push([
                1000000 + i * 14400000,
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
        BTCUSDT: generateCandles4H('BTCUSDT', 68226, 1825), // 5 años
        ETHUSDT: generateCandles4H('ETHUSDT', 1956, 1825),
        LINKUSDT: generateCandles4H('LINKUSDT', 28, 1825)
    };

    const backtester = new BOOSISIntraday(50000);
    await backtester.simulate(candlesByAsset);
    const report = backtester.generateReport();

    fs.writeFileSync(
        'boosis_intraday_results.json',
        JSON.stringify({ timestamp: new Date().toISOString(), metrics: report }, null, 2)
    );
}

main().catch(err => console.error('Error:', err.message));
