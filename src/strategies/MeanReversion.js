const BaseStrategy = require('./BaseStrategy');
const TechnicalIndicators = require('../core/technical_indicators');

class MeanReversion extends BaseStrategy {
    constructor() {
        super('Mean Reversion');
        this.rsiBuyBound = 20;
        this.rsiSellBound = 80;
        this.bbPeriod = 20;
        this.bbStdDev = 2.0;
        this.stopLossPercent = 0.02;
    }

    onCandle(candle, history, inPosition = false, entryPrice = 0) {
        const prices = history.map(c => parseFloat(c[4]));
        const currentPrice = parseFloat(candle[4]);

        if (prices.length < this.bbPeriod) return null;

        const rsiValue = TechnicalIndicators.calculateRSI(prices, 14);
        const bbValue = TechnicalIndicators.calculateBollingerBands(prices, this.bbPeriod, this.bbStdDev);

        if (!rsiValue || !bbValue) return null;

        if (inPosition) {
            const stopLossPrice = entryPrice * (1 - this.stopLossPercent);
            if (currentPrice <= stopLossPrice) {
                return { action: 'SELL', price: currentPrice, reason: 'STOP LOSS' };
            }
            if (currentPrice >= bbValue.upper || rsiValue > this.rsiSellBound) {
                return { action: 'SELL', price: currentPrice, reason: 'MEAN REVERSION EXIT' };
            }
        } else {
            if (currentPrice <= bbValue.lower && rsiValue < this.rsiBuyBound) {
                return { action: 'BUY', price: currentPrice, reason: 'MEAN REVERSION ENTRY' };
            }
        }
        return null;
    }
}

module.exports = MeanReversion;
