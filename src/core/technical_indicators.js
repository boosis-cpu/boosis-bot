
class TechnicalIndicators {
    /**
     * Calculate Simple Moving Average (SMA)
     * @param {number[]} data - Array of prices
     * @param {number} period - Window size
     */
    static calculateSMA(data, period) {
        if (data.length < period) return null;
        const slice = data.slice(-period);
        const sum = slice.reduce((a, b) => a + b, 0);
        return sum / period;
    }

    /**
     * Calculate Exponential Moving Average (EMA)
     * @param {number[]} data - Array of prices
     * @param {number} period - Window size
     */
    static calculateEMA(data, period) {
        if (data.length < period) return null;

        const k = 2 / (period + 1);
        let ema = data[0];

        // Simple initialization (could be improved with SMA of first period)
        // Calculating iteratively
        for (let i = 1; i < data.length; i++) {
            ema = (data[i] * k) + (ema * (1 - k));
        }

        return ema;
    }

    /**
     * Calculate Relative Strength Index (RSI)
     * @param {number[]} data - Array of prices
     * @param {number} period - Usually 14
     */
    static calculateRSI(data, period = 14) {
        if (data.length < period + 1) return null;

        let gains = 0;
        let losses = 0;

        // First average gain/loss
        for (let i = 1; i <= period; i++) {
            const change = data[i] - data[i - 1];
            if (change > 0) gains += change;
            else losses += Math.abs(change);
        }

        let avgGain = gains / period;
        let avgLoss = losses / period;

        // Smoothing for the rest
        for (let i = period + 1; i < data.length; i++) {
            const change = data[i] - data[i - 1];
            const gain = change > 0 ? change : 0;
            const loss = change < 0 ? Math.abs(change) : 0;

            avgGain = ((avgGain * (period - 1)) + gain) / period;
            avgLoss = ((avgLoss * (period - 1)) + loss) / period;
        }

        if (avgLoss === 0) return 100;

        const rs = avgGain / avgLoss;
        return 100 - (100 / (1 + rs));
    }

    /**
     * Calculate Standard Deviation (Volatility)
     * @param {number[]} data - Array of prices
     * @param {number} period - Window size
     */
    static calculateStdDev(data, period) {
        if (data.length < period) return null;

        const sma = this.calculateSMA(data, period);
        const slice = data.slice(-period);

        const squaredDiffs = slice.map(price => Math.pow(price - sma, 2));
        const avgSquaredDiff = squaredDiffs.reduce((a, b) => a + b, 0) / period;

        return Math.sqrt(avgSquaredDiff);
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
