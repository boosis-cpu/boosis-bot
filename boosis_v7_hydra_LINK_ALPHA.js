#!/usr/bin/env node

/**
 * 🐉 BOOSIS v7.0 - THE HYDRA (LINK ALPHA TEST)
 * 
 * DATOS REALES: LINKUSDT (1 Año hasta hoy)
 * LOGICA: 80% Funding Arbitrage / 20% Selective Scalping
 * ACTIVO: LINK (Nuestro activo con mayor Alpha histórico)
 */

const fs = require('fs');

class HydraRealBacktestLINK {
    constructor(initialCapital = 50000) {
        this.initialCapital = initialCapital;
        this.baseCapital = initialCapital * 0.80; // $40k (Funding)
        this.attackCapital = initialCapital * 0.20; // $10k (Scalp)
        this.trades = [];
        this.peak = initialCapital;
        this.maxDD = 0;
    }

    calculateRSI(closes, period = 14) {
        if (closes.length < period + 1) return 50;
        let gains = 0, losses = 0;
        for (let i = closes.length - period; i < closes.length; i++) {
            const diff = closes[i] - closes[(i - 1)];
            if (diff > 0) gains += diff;
            else losses -= diff;
        }
        gains /= period;
        losses /= period;
        return 100 - (100 / (1 + gains / losses));
    }

    calculateEMA(closes, period) {
        const k = 2 / (period + 1);
        let ema = closes[0];
        for (let i = 1; i < closes.length; i++) {
            ema = closes[i] * k + ema * (1 - k);
        }
        return ema;
    }

    async run() {
        // Cargar datos reales de LINK
        const linkPriceData = JSON.parse(fs.readFileSync('link_1y_4h.json', 'utf8'));
        const linkFundingData = JSON.parse(fs.readFileSync('link_1y_funding.json', 'utf8'));

        console.log(`\n🧪 INICIANDO BACKTEST REAL HYDRA: LINKUSDT (Último año)`);

        let fundingIndex = 0;
        let activeScalp = null;

        for (let i = 50; i < linkPriceData.length; i++) {
            const currentCandle = linkPriceData[i];
            const currentTime = currentCandle[0];
            const currentPrice = parseFloat(currentCandle[4]);
            const prevCloses = linkPriceData.slice(i - 30, i).map(c => parseFloat(c[4]));

            // 1. PROCESAR FUNDING (80% del capital)
            while (fundingIndex < linkFundingData.length && linkFundingData[fundingIndex].fundingTime <= currentTime) {
                const rate = parseFloat(linkFundingData[fundingIndex].fundingRate);
                this.baseCapital += (this.baseCapital * rate);
                fundingIndex++;
            }

            // 2. PROCESAR SCALPING (20% del capital)
            if (!activeScalp) {
                const rsi = this.calculateRSI(prevCloses);
                const ema20 = this.calculateEMA(prevCloses, 20);

                // Filtro selectivo para LINK
                if (rsi > 40 && rsi < 60 && currentPrice > ema20) {
                    const tradeSize = this.attackCapital;
                    activeScalp = {
                        entry: currentPrice,
                        stop: currentPrice * 0.97, // -3% (damos más aire a LINK)
                        target: currentPrice * 1.07, // +7% (buscamos el alfa de LINK)
                        size: tradeSize
                    };
                    this.attackCapital = 0;
                    this.attackCapital -= (tradeSize * 0.001); // Entry fee
                }
            } else {
                const pnl = (currentPrice - activeScalp.entry) / activeScalp.entry;

                if (currentPrice >= activeScalp.target || currentPrice <= activeScalp.stop) {
                    const finalChange = (currentPrice - activeScalp.entry) / activeScalp.entry;
                    const resultTotal = activeScalp.size * (1 + finalChange);
                    this.attackCapital += (resultTotal * 0.999); // Exit fee
                    this.trades.push({ pnl: finalChange * 100 });
                    activeScalp = null;
                }
            }

            const total = this.baseCapital + this.attackCapital;
            if (total > this.peak) this.peak = total;
            const dd = (this.peak - total) / this.peak;
            if (dd > this.maxDD) this.maxDD = dd;
        }

        this.report();
    }

    report() {
        const final = this.baseCapital + this.attackCapital;
        const roi = ((final - this.initialCapital) / this.initialCapital) * 100;
        const wins = this.trades.filter(t => t.pnl > 0).length;

        console.log(`\n${'═'.repeat(60)}`);
        console.log(`📊 RESULTADOS BOOSIS v7.0 HYDRA - ALPHA EN LINKUSDT`);
        console.log(`${'═'.repeat(60)}`);
        console.log(`Capital Inicial:   $${this.initialCapital.toLocaleString()}`);
        console.log(`Capital Final:     $${final.toLocaleString()}`);
        console.log(`ROI TOTAL:         ${roi.toFixed(2)}%`);
        console.log(`Win Rate Scalp:    ${((wins / this.trades.length) * 100).toFixed(1)}%`);
        console.log(`Trades Realizados: ${this.trades.length}`);
        console.log(`Max Drawdown:      ${(this.maxDD * 100).toFixed(2)}%`);
        console.log(`Desglose:          Base: $${this.baseCapital.toFixed(0)} | Ataque: $${this.attackCapital.toFixed(0)}`);
        console.log(`${'═'.repeat(60)}\n`);

        if (roi > 15) {
            console.log(`✅ VEREDICTO: LINK CONFIRMA EL EDGE. HYDRA ES VIABLE EN NICHOS.`);
        } else {
            console.log(`⚠️ VEREDICTO: RENTABILIDAD BAJA. AJUSTAR TIMEFRAME O ENTIDADES.`);
        }
    }
}

new HydraRealBacktestLINK().run();
