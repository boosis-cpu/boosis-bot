
class BaseStrategy {
    constructor(name) {
        this.name = name;
    }

    /**
     * Called for every new candle in the backtest or live feed.
     * @param {Object} candle - { open, high, low, close, volume, time }
     * @param {Array} history - Array of previous candles
     */
    async onCandle(candle, history) {
        throw new Error('Method onCandle() must be implemented');
    }

    /**
     * Should return the trading signal.
     * @returns {Object|null} - { action: 'BUY'|'SELL', price, reason }
     */
    checkSignal() {
        return null;
    }

    /**
     * Apply dynamic configuration
     */
    configure(profile) {
        if (!profile) return;

        if (profile.rsi) {
            this.rsiBuyBound = profile.rsi.buy;
            this.rsiSellBound = profile.rsi.sell;
        }
        if (profile.ema) {
            this.emaShort = profile.ema.short;
            this.emaLong = profile.ema.long;
            this.emaTrend = profile.ema.trend;
        }
        if (profile.bb) {
            this.bbPeriod = profile.bb.period;
            this.bbStdDev = profile.bb.stdDev;
        }
        if (profile.stopLoss) {
            this.stopLossPercent = profile.stopLoss;
        }
    }
}

module.exports = BaseStrategy;
