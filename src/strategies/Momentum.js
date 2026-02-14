const BaseStrategy = require('./BaseStrategy');
const TechnicalIndicators = require('../core/technical_indicators');

class Momentum extends BaseStrategy {
    constructor() {
        super('Momentum Strategy');
        this.rsiBuyBound = 30;
        this.rsiSellBound = 70;
        this.emaShort = 12;
        this.emaLong = 26;
        this.emaTrend = 50;
        this.stopLossPercent = 0.02;
    }

    onCandle(candle, history, inPosition = false, entryPrice = 0) {
        const prices = history.map(c => parseFloat(c[4]));
        const currentPrice = parseFloat(candle[4]);

        if (prices.length < this.emaTrend) return null;

        const emaShortValue = TechnicalIndicators.calculateEMA(prices, this.emaShort);
        const emaLongValue = TechnicalIndicators.calculateEMA(prices, this.emaLong);
        const emaTrendValue = TechnicalIndicators.calculateEMA(prices, this.emaTrend);
        const rsiValue = TechnicalIndicators.calculateRSI(prices, 14);

        if (!emaShortValue || !emaLongValue || !emaTrendValue || !rsiValue) return null;

        const trendBullish = emaShortValue > emaLongValue && emaLongValue > emaTrendValue;

        if (inPosition) {
            const stopLossPrice = entryPrice * (1 - this.stopLossPercent);
            if (currentPrice <= stopLossPrice) {
                return { action: 'SELL', price: currentPrice, reason: 'STOP LOSS' };
            }
            if (rsiValue > this.rsiSellBound) {
                return { action: 'SELL', price: currentPrice, reason: 'OVERBOUGHT' };
            }
        } else {
            if (trendBullish && rsiValue < this.rsiBuyBound) {
                return { action: 'BUY', price: currentPrice, reason: 'MOMENTUM CONFIRMED' };
            }
        }
        return null;
    }
}

module.exports = Momentum;
