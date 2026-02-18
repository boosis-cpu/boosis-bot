/**
 * 🚀 BOOSIS v3.0 - CRIPTO NATIVE
 * 
 * Estrategia diseñada 100% para mercados cripto.
 * Abandona la arquitectura Turtle en favor de:
 * 1. Detección de Regímenes (HMM + Indicadores)
 * 2. Entradas Dinámicas por Volatilidad
 * 3. Salidas Inteligentes (Trailing, Kill Switches, Regime Changes)
 */

const logger = require('./logger');

class BOOSISv3 {
    constructor(symbol, initialBalance = 10000) {
        this.symbol = symbol;
        this.initialBalance = initialBalance;
        this.balance = initialBalance;
        this.peak = initialBalance;
        this.maxDD = 0;
        this.trades = [];

        // Configuración v3.0
        this.config = {
            riskPerTrade: 0.02, // 2%
            dailyLossLimit: 0.03, // 3%
            targetProfit: 0.12, // 12% target base (ajustado por ATR)
            stopLossATR: 2.0, // 2 ATRs
            trailATR: 1.5, // 1.5 ATRs trailing
            minROItoTrail: 0.05 // Empieza trail a partir de +5%
        };
    }

    /**
     * Identifica el estado actual del mercado
     */
    detectRegime(closes, highs, lows) {
        const rsi = this.calculateRSI(closes);
        const atr = this.calculateATR(highs, lows, closes);
        const lastClose = closes[closes.length - 1];
        const atrPct = (atr / lastClose) * 100;
        const macd = this.calculateMACD(closes);
        const bb = this.calculateBollinger(closes);

        const sma20 = closes.slice(-20).reduce((a, b) => a + b) / 20;
        const sma50 = closes.reduce((a, b) => a + b) / closes.length;
        const price = lastClose;

        // 1. BLACK SWAN (Volatilidad extrema)
        if (atrPct > 8) {
            return { regime: 'BLACK_SWAN', confidence: 0.95, rsi, atr, atrPct };
        }

        // 2. UPTREND (Trend Following)
        if (price > sma20 && price > sma50 && rsi > 50 && rsi < 70 && macd.histogram > 0) {
            return { regime: 'UPTREND', confidence: 0.85, rsi, atr, atrPct };
        }

        // 3. DOWNTREND (Protección)
        if (price < sma20 && price < sma50 && rsi < 50 && macd.histogram < 0) {
            return { regime: 'DOWNTREND', confidence: 0.85, rsi, atr, atrPct };
        }

        // 4. CONGESTION (Chop)
        if (atrPct < 1.5 && bb.bandwidth < 0.02) {
            return { regime: 'CONGESTION', confidence: 0.75, rsi, atr, atrPct };
        }

        return { regime: 'NEUTRAL', confidence: 0.50, rsi, atr, atrPct };
    }

    /**
     * Evalúa si debemos abrir una posición
     */
    evaluateEntry(regime, price, prevPrice) {
        if (regime.regime !== 'UPTREND' || regime.confidence < 0.80) return null;

        // Breakout de volatilidad
        const breakoutLevel = prevPrice + (regime.atr * 1.2);
        if (price > breakoutLevel) {
            return {
                entryPrice: price,
                stopLoss: price - (regime.atr * this.config.stopLossATR),
                target: price + (regime.atr * 4.0), // ~2:1 RR
                atr: regime.atr
            };
        }
        return null;
    }

    /**
     * Evalúa si debemos cerrar una posición activa
     */
    evaluateExit(pos, price, regime, meta = {}) {
        if (!pos) return null;

        const pnlPct = (price - pos.entryPrice) / pos.entryPrice;

        // 1. Profit Target
        if (price >= pos.target) {
            return { exitPrice: price, reason: 'TARGET', pnl: pnlPct };
        }

        // 2. Stop Loss (Hard)
        if (price <= pos.stopLoss) {
            return { exitPrice: price, reason: 'STOP_LOSS', pnl: pnlPct };
        }

        // 3. Trailing Stop
        if (pnlPct > this.config.minROItoTrail) {
            const trailLevel = pos.highestPrice - (pos.atr * this.config.trailATR);
            if (price < trailLevel) {
                return { exitPrice: price, reason: 'TRAILING_STOP', pnl: pnlPct };
            }
        }

        // 4. Kill Switch: Régimen cambió a Bajista
        if (regime.regime === 'DOWNTREND') {
            return { exitPrice: price, reason: 'REGIME_CHANGE', pnl: pnlPct };
        }

        // 5. Kill Switch: Pánico RSI
        if (regime.rsi < 35) {
            return { exitPrice: price, reason: 'PANIC_RSI', pnl: pnlPct };
        }

        // 6. Kill Switch: Cisne Negro
        if (regime.regime === 'BLACK_SWAN') {
            return { exitPrice: price, reason: 'BLACK_SWAN_EXIT', pnl: pnlPct };
        }

        return null;
    }

    // --- INDICADORES ---

    calculateRSI(closes, period = 14) {
        if (closes.length < period + 1) return 50;
        let gains = 0;
        let losses = 0;
        for (let i = closes.length - period; i < closes.length; i++) {
            const diff = closes[i] - closes[i - 1];
            if (diff >= 0) gains += diff;
            else losses -= diff;
        }
        if (losses === 0) return 100;
        const rs = (gains / period) / (losses / period);
        return 100 - (100 / (1 + rs));
    }

    calculateATR(highs, lows, closes, period = 14) {
        if (closes.length < period + 1) return 0;
        let trSum = 0;
        for (let i = closes.length - period; i < closes.length; i++) {
            const h = highs[i];
            const l = lows[i];
            const pc = closes[i - 1];
            const tr = Math.max(h - l, Math.abs(h - pc), Math.abs(l - pc));
            trSum += tr;
        }
        return trSum / period;
    }

    calculateMACD(closes) {
        const ema12 = this.calculateEMA(closes, 12);
        const ema26 = this.calculateEMA(closes, 26);
        const macdLine = ema12 - ema26;
        // Simplificación de señal
        return { line: macdLine, histogram: macdLine };
    }

    calculateEMA(values, period) {
        if (values.length === 0) return 0;
        const k = 2 / (period + 1);
        let ema = values[0];
        for (let i = 1; i < values.length; i++) {
            ema = values[i] * k + ema * (1 - k);
        }
        return ema;
    }

    calculateBollinger(closes, period = 20) {
        const lastN = closes.slice(-period);
        const sma = lastN.reduce((a, b) => a + b) / period;
        const variance = lastN.reduce((a, b) => a + Math.pow(b - sma, 2), 0) / period;
        const stdDev = Math.sqrt(variance);
        const upper = sma + (stdDev * 2);
        const lower = sma - (stdDev * 2);
        return { sma, upper, lower, bandwidth: (upper - lower) / sma };
    }
}

module.exports = BOOSISv3;
