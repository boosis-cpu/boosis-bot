/**
 * 🚀 BOOSIS v3.1 AGGRESSIVE - FINE-TUNED PARA DINERO DIARIO
 * 
 * Basada en v3.0 pero optimizada para capturar movimientos rápidos
 * y generar flujo de caja diario.
 */

const logger = require('./logger');

class BOOSISv31Aggressive {
    constructor(symbol, initialBalance = 10000) {
        this.symbol = symbol;
        this.balance = initialBalance;
        this.initialBalance = initialBalance;
        this.peak = initialBalance;
        this.maxDD = 0;
        this.trades = [];
        this.dailyPnL = [];

        // Configuración v3.1 AGGRESSIVE
        this.config = {
            baseRisk: 0.03,        // 3% por trade (agresivo)
            maxRisk: 0.06,         // 6% en oportunidades claras
            minRisk: 0.02,         // 2% en alta volatilidad
            profitTarget1: 0.03,   // 3% (Quick profit)
            profitTarget2: 0.05,   // 5% (Target extendido)
            stopLossATR: 1.5,      // Stop más corto
            trailATR: 1.0,         // Trail más pegado
            minROItoTrail: 0.02    // Empezar a trailear pronto
        };
    }

    /**
     * RÉGIMEN DETECTOR MÁS AGRESIVO
     */
    detectRegime(closes, highs, lows) {
        const rsi = this.calculateRSI(closes);
        const atr = this.calculateATR(highs, lows, closes);
        const lastClose = closes[closes.length - 1];
        const prevClose = closes[closes.length - 2];
        const atrPct = (atr / lastClose) * 100;

        const sma20 = closes.slice(-20).reduce((a, b) => a + b) / 20;
        const sma50 = closes.reduce((a, b) => a + b) / closes.length;

        // 1. VOLATILIDAD EXTREMA (Evitar si > 10%)
        if (atrPct > 10) {
            return { regime: 'EXTREME_VOL', confidence: 0.0, atr, atrPct };
        }

        // 2. UPTREND AGRESIVO
        if (rsi > 45 && lastClose > sma20) {
            return { regime: 'UPTREND', confidence: 0.85, rsi, atr, atrPct };
        }

        // 3. MOMENTUM (Subidas rápidas)
        const momentum = ((lastClose - prevClose) / prevClose) * 100;
        if (momentum > 0.5 && rsi > 40) {
            return { regime: 'MOMENTUM', confidence: 0.75, rsi, atr, atrPct };
        }

        // 4. BREAKOUT
        if (lastClose > sma20 * 1.02) {
            return { regime: 'BREAKOUT', confidence: 0.80, rsi, atr, atrPct };
        }

        // 5. PÁNICO
        if (rsi < 30) {
            return { regime: 'PANIC', confidence: 0.0, rsi, atr, atrPct };
        }

        return { regime: 'NEUTRAL', confidence: 0.50, rsi, atr, atrPct };
    }

    /**
     * ENTRADA DINÁMICA v3.1
     */
    evaluateEntry(regime, price, prevPrice) {
        if (regime.confidence < 0.70) return null;

        const atr = regime.atr;
        let entryData = null;

        if (regime.regime === 'UPTREND') {
            const breakout = prevPrice + (atr * 1.2);
            if (price > breakout) {
                entryData = {
                    type: 'UPTREND',
                    stop: price - (atr * 1.5),
                    target: price + (atr * 3.0)
                };
            }
        } else if (regime.regime === 'MOMENTUM') {
            entryData = {
                type: 'MOMENTUM',
                stop: price - (atr * 1.2),
                target: price + (atr * 2.5)
            };
        } else if (regime.regime === 'BREAKOUT') {
            entryData = {
                type: 'BREAKOUT',
                stop: price - (atr * 1.3),
                target: price + (atr * 2.8)
            };
        }

        if (entryData) {
            return {
                ...entryData,
                entryPrice: price,
                atr: atr,
                riskPct: this.calculatePositionSize(regime)
            };
        }

        return null;
    }

    /**
     * SALIDA AGRESIVA (CAPTURA FLUJO DIARIO)
     */
    evaluateExit(pos, price, regime, dayStats = { losses: 0 }) {
        if (!pos) return null;

        const pnl = (price - pos.entryPrice) / pos.entryPrice;
        const pnlPct = pnl * 100;

        // 1. QUICK PROFIT (3-5%)
        if (pnlPct >= 3 && pnlPct <= 5) {
            // Si el régimen sigue muy fuerte, podemos intentar aguantar
            if (regime.regime === 'UPTREND' && regime.confidence > 0.90) return null;
            return { exitPrice: price, reason: 'QUICK_PROFIT', pnl };
        }

        // 2. TARGET PRINCIPAL
        if (price >= pos.target) {
            return { exitPrice: price, reason: 'TARGET', pnl };
        }

        // 3. STOP LOSS TIGHT
        if (price <= pos.stop) {
            return { exitPrice: price, reason: 'STOP_LOSS', pnl };
        }

        // 4. TRAILING AGRESIVO (1.0 ATR)
        if (pnlPct > 2) {
            const trailLevel = pos.highestPrice - (pos.atr * 1.0);
            if (price < trailLevel) {
                return { exitPrice: price, reason: 'TRAILING_STOP', pnl };
            }
        }

        // 5. KILL SWITCH: PÁNICO
        if (regime.rsi < 25) {
            return { exitPrice: price, reason: 'KILL_PANIC', pnl };
        }

        return null;
    }

    /**
     * POSITION SIZING DINÁMICO (2% - 6%)
     */
    calculatePositionSize(regime) {
        let risk = this.config.baseRisk;

        if (regime.atrPct < 1.5) risk = 0.05;         // Aumentar en baja volatilidad
        if (regime.atrPct > 4.0) risk = 0.02;         // Reducir en alta volatilidad
        if (regime.confidence > 0.85 && regime.atrPct < 3.0) risk = 0.06; // Oportunidad clara

        return risk;
    }

    // --- INDICADORES ---

    calculateRSI(closes, period = 14) {
        if (closes.length < period + 1) return 50;
        let gains = 0, losses = 0;
        for (let i = closes.length - period; i < closes.length; i++) {
            const diff = closes[i] - closes[i - 1];
            if (diff >= 0) gains += diff; else losses -= diff;
        }
        if (losses === 0) return 100;
        return 100 - (100 / (1 + (gains / period) / (losses / period)));
    }

    calculateATR(highs, lows, closes, period = 14) {
        if (closes.length < period + 1) return 0;
        let trSum = 0;
        for (let i = closes.length - period; i < closes.length; i++) {
            trSum += Math.max(highs[i] - lows[i], Math.abs(highs[i] - closes[i - 1]), Math.abs(lows[i] - closes[i - 1]));
        }
        return trSum / period;
    }

    calculateMACD(closes) {
        const ema12 = this.ema(closes, 12);
        const ema26 = this.ema(closes, 26);
        return { signal: ema12 - ema26 };
    }

    ema(values, period) {
        const k = 2 / (period + 1);
        let ema = values[0];
        for (let i = 1; i < values.length; i++) ema = values[i] * k + ema * (1 - k);
        return ema;
    }
}

module.exports = BOOSISv31Aggressive;
