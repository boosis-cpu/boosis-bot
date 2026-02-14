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

        const trueRanges = [];

        // Calculate True Ranges for each period
        // The first TR requires close[0], so we start from i=1 for high/low and i=0 for previous close
        // To calculate ATR for the last 'period' values, we need 'period' true ranges.
        // If high.length is N, then we can calculate N-1 true ranges.
        // If we need 'period' true ranges, then high.length must be at least period + 1.
        // The current implementation calculates true ranges for high.length - 1 values.
        // If high.length = period, then trueRanges will have period-1 elements.
        // If high.length = period + 1, then trueRanges will have period elements.
        // The slice(-period) will then correctly take the last 'period' true ranges.
        if (high.length < 2) return null; // Need at least two data points to calculate a change

        for (let i = 1; i < high.length; i++) {
            const tr1 = high[i] - low[i];
            const tr2 = Math.abs(high[i] - close[i - 1]);
            const tr3 = Math.abs(low[i] - close[i - 1]);
            trueRanges.push(Math.max(tr1, tr2, tr3));
        }

        // Ensure we have enough true ranges to calculate the average for the given period
        if (trueRanges.length < period) return null;

        // Calculate simple average of the last 'period' true ranges
        const slice = trueRanges.slice(-period);
        const atr = slice.reduce((sum, val) => sum + val, 0) / period;

        return atr;
    }

    /**
     * Calculate Bollinger Bands
     * @param {number[]} data - Array of prices
     * @param {number} period - Window size (default 20)
     * @param {number} stdDevMultiplier - Standard deviation multiplier (default 2)
     * @returns {Object|null} - {upper, middle, lower} or null if insufficient data
     */
    static calculateBollingerBands(data, period = 20, stdDevMultiplier = 2) {
        if (data.length < period) return null;

        const middle = this.calculateSMA(data, period);
        const stdDev = this.calculateStdDev(data, period);

        if (middle === null || stdDev === null) return null;

        return {
            upper: middle + (stdDev * stdDevMultiplier),
            middle: middle,
            lower: middle - (stdDev * stdDevMultiplier)
        };
    }
}

module.exports = TechnicalIndicators;
