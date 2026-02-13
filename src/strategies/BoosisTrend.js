
const BaseStrategy = require('./BaseStrategy');
const TechnicalIndicators = require('../core/technical_indicators');

class BoosisTrend extends BaseStrategy {
    constructor(config = {}) {
        super('Boosis Trend Follower');
<<<<<<< Updated upstream
        this.trendWindow = config.trendWindow || 48; // 4 hours (at 5m interval)
        this.signalWindow = config.signalWindow || 12; // 1 hour
        this.threshold = config.threshold || 0.002; // 0.20%
=======
        this.smaLong = config.smaLong || 200;
        this.rsiPeriod = config.rsiPeriod || 14;
        this.bbPeriod = config.bbPeriod || 20;

        // Volatility & Risk Management
        this.atrPeriod = config.atrPeriod || 14;
        this.maxVolatilityPercent = config.maxVolatilityPercent || 1.5; // Max 1.5% candle movement allowed

        this.stopLossPercent = config.stopLossPercent || 0.02; // 2% fixed stop loss
        this.trailingStopPercent = config.trailingStopPercent || 0.015; // 1.5% trailing stop
        this.rsiBuyBound = config.rsiBuyBound || 30;
        this.rsiSellBound = config.rsiSellBound || 80;
        this.highWaterMark = 0; // Highest price since buy
>>>>>>> Stashed changes
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

<<<<<<< Updated upstream
        const momentum = (currentPrice - smaShort) / smaShort;
        const trendIsBullish = currentPrice > smaLong;
=======
        // ATR Calculation for Volatility Filter
        const highs = historySlice.map(c => parseFloat(c[2]));
        const lows = historySlice.map(c => parseFloat(c[3]));
        // Note: TI.calculateATR expects arrays (high, low, close, period)
        const atr = TechnicalIndicators.calculateATR(highs, lows, prices, this.atrPeriod);

        if (!ma200 || !rsi || !bb || !macd || !atr) return null;
>>>>>>> Stashed changes

        // --- TRADING LOGIC ---

        // BUY SIGNAL: Market is in Up Trend AND Momentum is strong
        if (trendIsBullish && momentum > this.threshold) {
            return { action: 'BUY', price: currentPrice, reason: `Trend UP & Momentum ${momentum.toFixed(4)}` };
        }

<<<<<<< Updated upstream
        // SELL SIGNAL: Momentum breaks down OR Trend is lost
        if (momentum < -this.threshold || currentPrice < smaLong) {
            return { action: 'SELL', price: currentPrice, reason: `Momentum lost ${momentum.toFixed(4)} or Trend broken` };
=======
        // --- ENTRY/EXIT LOGIC (MULTI-SIGNAL) ---

        // 🛡️ SAFETY CHECK: Volatility
        const volatilityPercent = (atr / currentPrice) * 100;
        if (!inPosition && volatilityPercent > this.maxVolatilityPercent) {
            // Too volatile, skip entry. But allow exits (handled by stop loss above)
            return null;
        }

        // 🟢 BUY LOGIC: Trend Up + Neutro/Oversold + Near BB Lower/Middle
        if (!inPosition && trendBullish && rsi < this.rsiBuyBound && currentPrice < bb.middle) {
            this.highWaterMark = currentPrice;
            return {
                action: 'BUY',
                price: currentPrice,
                reason: `Bullish Trend & RSI ${rsi.toFixed(2)} & Low Volatility (${volatilityPercent.toFixed(2)}%)`
            };
>>>>>>> Stashed changes
        }

        return null; // Hold
    }
}

module.exports = BoosisTrend;
