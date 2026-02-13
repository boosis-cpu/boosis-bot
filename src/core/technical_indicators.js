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
}

module.exports = TechnicalIndicators;
