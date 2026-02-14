const TI = require('technicalindicators');

class TechnicalIndicators {
    /**
     * Calculate Simple Moving Average (SMA)
     */
    static calculateSMA(data, period) {
        if (data.length < period) return null;
        const results = TI.SMA.calculate({ period: period, values: data });
        return results[results.length - 1];
    }

    /**
     * Calculate Exponential Moving Average (EMA)
     */
    static calculateEMA(data, period) {
        if (data.length < period) return null;
        const results = TI.EMA.calculate({ period: period, values: data });
        return results[results.length - 1];
    }

    /**
     * Calculate Relative Strength Index (RSI)
     */
    static calculateRSI(data, period = 14) {
        if (data.length < period + 1) return null;
        const results = TI.RSI.calculate({ period: period, values: data });
        return results[results.length - 1];
    }

    /**
     * Calculate Bollinger Bands
     */
    static calculateBollingerBands(data, period = 20, stdDev = 2) {
        if (data.length < period) return null;
        const results = TI.BollingerBands.calculate({
            period: period,
            stdDev: stdDev,
            values: data
        });
        return results[results.length - 1]; // Returns { upper: x, middle: y, lower: z }
    }

    /**
     * Calculate MACD
     */
    static calculateMACD(data, fastPeriod = 12, slowPeriod = 26, signalPeriod = 9) {
        if (data.length < slowPeriod + signalPeriod) return null;
        const results = TI.MACD.calculate({
            values: data,
            fastPeriod: fastPeriod,
            slowPeriod: slowPeriod,
            signalPeriod: signalPeriod,
            SimpleMAOscillator: false,
            SimpleMASignal: false
        });
        return results[results.length - 1]; // Returns { MACD: x, signal: y, histogram: z }
    }

    /**
     * Calculate Average True Range (ATR)
     */
    static calculateATR(high, low, close, period = 14) {
        if (high.length < period || low.length < period || close.length < period) return null;
        if (high.length < 2) return null;

        const trueRanges = [];
        for (let i = 1; i < high.length; i++) {
            const tr1 = high[i] - low[i];
            const tr2 = Math.abs(high[i] - close[i - 1]);
            const tr3 = Math.abs(low[i] - close[i - 1]);
            trueRanges.push(Math.max(tr1, tr2, tr3));
        }

        if (trueRanges.length < period) return null;
        const slice = trueRanges.slice(-period);
        const atr = slice.reduce((sum, val) => sum + val, 0) / period;

        return atr;
    }
}

module.exports = TechnicalIndicators;
