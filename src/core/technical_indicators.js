
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
        if (high.length < period) return null;

        const results = TI.ATR.calculate({
            high: high,
            low: low,
            close: close,
            period: period
        });

        if (!results || results.length === 0) return null;
        return results[results.length - 1];
    }
}

module.exports = TechnicalIndicators;
