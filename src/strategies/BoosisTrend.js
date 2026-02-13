
const BaseStrategy = require('./BaseStrategy');
const TechnicalIndicators = require('../core/technical_indicators');

class BoosisTrend extends BaseStrategy {
    constructor(config = {}) {
        super('Boosis Trend Follower');
        this.smaLong = config.smaLong || 200; // Major Trend
        this.rsiPeriod = config.rsiPeriod || 14;
        this.bbPeriod = config.bbPeriod || 20;
    }

    onCandle(candle, history) {
        const prices = history.map(c => parseFloat(c[4])); // Close prices

        if (prices.length < this.smaLong) return null;

        const currentPrice = parseFloat(candle[4]);

        // --- INDICATORS ---
        const ma200 = TechnicalIndicators.calculateSMA(prices, this.smaLong);
        const rsi = TechnicalIndicators.calculateRSI(prices, this.rsiPeriod);
        const bb = TechnicalIndicators.calculateBollingerBands(prices, this.bbPeriod);
        const macd = TechnicalIndicators.calculateMACD(prices);

        if (!ma200 || !rsi || !bb || !macd) return null;

        const trendBullish = currentPrice > ma200;

        // --- TRADING LOGIC (MULTI-SIGNAL) ---

        // 🟢 BUY LOGIC: Trend Up + Not Overbought + Near BB Middle/Lower
        if (trendBullish && rsi < 60 && currentPrice < bb.middle) {
            return {
                action: 'BUY',
                price: currentPrice,
                reason: `Bullish Trend & RSI ${rsi.toFixed(2)} & Inside BB Bands`
            };
        }

        // 🔴 SELL LOGIC: Overbought OR MACD Weakening
        if (rsi > 70 || (macd.histogram < 0 && macd.MACD < macd.signal)) {
            return {
                action: 'SELL',
                price: currentPrice,
                reason: `RSI Overbought (${rsi.toFixed(2)}) or MACD Crossover`
            };
        }

        return null;
    }
}

module.exports = BoosisTrend;
