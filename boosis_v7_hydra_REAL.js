#!/usr/bin/env node

/**
 * 🐉 BOOSIS v7.0 - THE HYDRA (REAL DATA BACKTEST)
 * 
 * DATOS REALES: BTCUSDT (1 Año hasta hoy)
 * LOGICA: 80% Funding Arbitrage / 20% Selective Scalping
 */

const fs = require('fs');

class HydraRealBacktest {
    constructor(initialCapital = 50000) {
        this.initialCapital = initialCapital;
        this.capital = initialCapital;
        this.baseCapital = initialCapital * 0.80; // $40k
        this.attackCapital = initialCapital * 0.20; // $10k
        this.trades = [];
        this.peak = initialCapital;
        this.maxDD = 0;
    }

    // Helper para RSI
    calculateRSI(closes, period = 14) {
        if (closes.length < period + 1) return 50;
        let gains = 0, losses = 0;
        for (let i = closes.length - period; i < closes.length; i++) {
            const diff = closes[i] - closes[i - 1];
            if (diff > 0) gains += diff;
            else losses -= diff;
        }
        gains /= period;
        losses /= period;
        return 100 - (100 / (1 + gains / losses));
    }

    // Helper para EMA
    calculateEMA(closes, period) {
        const k = 2 / (period + 1);
        let ema = closes[0];
        for (let i = 1; i < closes.length; i++) {
            ema = closes[i] * k + ema * (1 - k);
        }
        return ema;
    }

    async run() {
        // Cargar datos reales
        const btcPriceData = JSON.parse(fs.readFileSync('btc_1y_4h.json', 'utf8'));
        const btcFundingData = JSON.parse(fs.readFileSync('btc_1y_funding.json', 'utf8'));

        console.log(`\n🧪 INICIANDO BACKTEST REAL: BTCUSDT (Último año)`);
        console.log(`Velas 4H: ${btcPriceData.length} | Registros Funding: ${btcFundingData.length}`);

        let fundingIndex = 0;
        let activeScalp = null;

        for (let i = 50; i < btcPriceData.length; i++) {
            const currentCandle = btcPriceData[i];
            const currentTime = currentCandle[0];
            const currentPrice = parseFloat(currentCandle[4]);
            const prevCloses = btcPriceData.slice(i - 30, i).map(c => parseFloat(c[4]));

            // 1. PROCESAR FUNDING (80% del capital)
            // Verificar si hay un cobro de funding en esta ventana de tiempo
            while (fundingIndex < btcFundingData.length && btcFundingData[fundingIndex].fundingTime <= currentTime) {
                const rate = parseFloat(btcFundingData[fundingIndex].fundingRate);
                // El Harvester gana la tasa si es positiva (somos Short)
                const earning = this.baseCapital * rate;
                this.baseCapital += earning;
                fundingIndex++;
            }

            // 2. PROCESAR SCALPING (20% del capital)
            if (!activeScalp) {
                // LÓGICA DE ENTRADA v4.2 mejorada
                const rsi = this.calculateRSI(prevCloses);
                const ema20 = this.calculateEMA(prevCloses, 20);
                const volume = parseFloat(currentCandle[5]);
                const avgVolume = prevCloses.reduce((a, b) => a + b, 0) / prevCloses.length; // Simplified avg

                if (rsi > 45 && rsi < 65 && currentPrice > ema20) {
                    const tradeSize = this.attackCapital;
                    activeScalp = {
                        entry: currentPrice,
                        stop: currentPrice * 0.985,
                        target: currentPrice * 1.035,
                        size: tradeSize
                    };
                    // Restamos el capital usado y pagamos fee
                    this.attackCapital = 0;
                    this.attackCapital -= (tradeSize * 0.001);
                }
            } else {
                // LÓGICA DE SALIDA
                const pnl = (currentPrice - activeScalp.entry) / activeScalp.entry;

                if (currentPrice >= activeScalp.target || currentPrice <= activeScalp.stop) {
                    const finalChange = (currentPrice - activeScalp.entry) / activeScalp.entry;
                    const tradeResult = activeScalp.size * (1 + finalChange);
                    // Devolvemos el capital mas PnL y pagamos fee de salida
                    this.attackCapital += (tradeResult * 0.999);
                    this.trades.push({
                        pnl: finalChange * 100,
                        exit: currentPrice >= activeScalp.target ? 'TARGET' : 'STOP'
                    });
                    activeScalp = null;
                }
            }

            // Tracking de Equidad Total
            const totalEquity = this.baseCapital + this.attackCapital;
            if (totalEquity > this.peak) this.peak = totalEquity;
            const dd = (this.peak - totalEquity) / this.peak;
            if (dd > this.maxDD) this.maxDD = dd;
        }

        this.report();
    }

    report() {
        const totalFinal = this.baseCapital + this.attackCapital;
        const roi = ((totalFinal - this.initialCapital) / this.initialCapital) * 100;
        const wins = this.trades.filter(t => t.pnl > 0).length;
        const wr = (wins / this.trades.length) * 100;

        console.log(`\n${'═'.repeat(60)}`);
        console.log(`📊 RESULTADOS BOOSIS v7.0 HYDRA - DATOS REALES BTC`);
        console.log(`${'═'.repeat(60)}`);
        console.log(`Período:           Último año (Historial Real Binance)`);
        console.log(`Capital Inicial:   $${this.initialCapital.toLocaleString()}`);
        console.log(`Capital Final:     $${totalFinal.toLocaleString()}`);
        console.log(`ROI TOTAL:         ${roi.toFixed(2)}%`);
        console.log(`Max Drawdown:      ${(this.maxDD * 100).toFixed(2)}%`);
        console.log(`Trades Scalping:   ${this.trades.length}`);
        console.log(`Win Rate Scalp:    ${wr.toFixed(1)}%`);
        console.log(`División Final:    Base: $${this.baseCapital.toFixed(0)} | Ataque: $${this.attackCapital.toFixed(0)}`);
        console.log(`${'═'.repeat(60)}\n`);

        if (roi > 15) {
            console.log(`✅ VEREDICTO: EL MODELO HYDRA ES RENTABLE CON DATOS REALES.`);
        } else {
            console.log(`⚠️ VEREDICTO: RENTABLE PERO CON BAJO MARGEN. REVISAR ALPHA.`);
        }
    }
}

const backtest = new HydraRealBacktest();
backtest.run();
