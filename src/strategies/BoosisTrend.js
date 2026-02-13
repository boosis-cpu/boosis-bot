
const BaseStrategy = require('./BaseStrategy');
const TechnicalIndicators = require('../core/technical_indicators');

class BoosisTrend extends BaseStrategy {
    constructor(config = {}) {
        super('Boosis Trend Follower');
        this.trendWindow = config.trendWindow || 48; // 4 hours (at 5m interval)
        this.signalWindow = config.signalWindow || 12; // 1 hour
        this.threshold = config.threshold || 0.002; // 0.20%
    }

    onCandle(candle, history) {
        const prices = history.map(c => parseFloat(c[4])); // Close prices

        // Need enough history for the longest window
        if (prices.length < this.trendWindow) return null;

        const currentPrice = parseFloat(candle[4]);

        // Calculate Indicators
        const smaLong = TechnicalIndicators.calculateSMA(prices, this.trendWindow);
        const smaShort = TechnicalIndicators.calculateSMA(prices, this.signalWindow);

        if (!smaLong || !smaShort) return null;

        const momentum = (currentPrice - smaShort) / smaShort;
        const trendIsBullish = currentPrice > smaLong;

        // --- TRADING LOGIC ---

        // BUY SIGNAL: Market is in Up Trend AND Momentum is strong
        if (trendIsBullish && momentum > this.threshold) {
            return { action: 'BUY', price: currentPrice, reason: `Trend UP & Momentum ${momentum.toFixed(4)}` };
        }

        // SELL SIGNAL: Momentum breaks down OR Trend is lost
        if (momentum < -this.threshold || currentPrice < smaLong) {
            return { action: 'SELL', price: currentPrice, reason: `Momentum lost ${momentum.toFixed(4)} or Trend broken` };
        }

        return null; // Hold
    }
}

module.exports = BoosisTrend;
