
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
}

module.exports = BaseStrategy;
