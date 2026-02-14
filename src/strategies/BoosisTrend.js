
const BaseStrategy = require('./BaseStrategy');
const TechnicalIndicators = require('../core/technical_indicators');

class BoosisTrend extends BaseStrategy {
    constructor(config = {}) {
        super('Boosis Trend Follower');
        this.smaLong = config.smaLong || 200;
        this.rsiPeriod = config.rsiPeriod || 14;
        this.bbPeriod = config.bbPeriod || 20;
        this.bbStdDev = config.bbStdDev || 2.5; // Optimized from Backtest

        // Risk Management
        this.stopLossPercent = config.stopLossPercent || 0.02; // 2% fixed stop loss
        this.trailingStopPercent = config.trailingStopPercent || 0.015; // 1.5% trailing stop
        this.rsiBuyBound = config.rsiBuyBound || 20; // Optimized from Backtest
        this.rsiSellBound = config.rsiSellBound || 70; // Optimized from Backtest
        this.highWaterMark = 0; // Highest price since buy
    }

    onCandle(candle, history, inPosition = false, entryPrice = 0) {
        // Optimization: only take what we need
        const historySlice = history.slice(-300);
        const prices = historySlice.map(c => parseFloat(c[4]));
        const currentPrice = parseFloat(candle[4]);

        if (prices.length < this.smaLong) return null;

        // --- INDICATORS ---
        const ma200 = TechnicalIndicators.calculateSMA(prices, this.smaLong);
        const rsi = TechnicalIndicators.calculateRSI(prices, this.rsiPeriod);
        const bb = TechnicalIndicators.calculateBollingerBands(prices, this.bbPeriod, this.bbStdDev);

        if (!ma200 || !rsi || !bb) return null;

        const trendBullish = currentPrice > ma200;

        // --- RISK MANAGEMENT LOGIC ---
        if (inPosition) {
            // Update High Water Mark
            if (currentPrice > this.highWaterMark) {
                this.highWaterMark = currentPrice;
            }

            // 1. Fixed Stop Loss
            const stopLossPrice = entryPrice * (1 - this.stopLossPercent);
            if (currentPrice <= stopLossPrice) {
                this.highWaterMark = 0;
                return { action: 'SELL', price: currentPrice, reason: `STOP LOSS TRIGGERED (${(this.stopLossPercent * 100).toFixed(1)}%)` };
            }

            // 2. Trailing Stop Loss
            const trailingStopPrice = this.highWaterMark * (1 - this.trailingStopPercent);
            if (currentPrice <= trailingStopPrice) {
                this.highWaterMark = 0;
                return { action: 'SELL', price: currentPrice, reason: `TRAILING STOP TRIGGERED` };
            }
        } else {
            this.highWaterMark = 0;
        }

        // --- ENTRY/EXIT LOGIC (MULTI-SIGNAL) ---

        // 🟢 BUY LOGIC: Trend Up + Oversold + Near BB Lower
        if (!inPosition && trendBullish && rsi < this.rsiBuyBound && currentPrice < bb.lower) {
            this.highWaterMark = currentPrice;
            return {
                action: 'BUY',
                price: currentPrice,
                reason: `Bullish Trend & RSI ${rsi.toFixed(2)} & BB Lower Break`
            };
        }

        // 🔴 SELL LOGIC: Extreme Overbought
        if (inPosition && rsi > this.rsiSellBound) {
            this.highWaterMark = 0;
            return {
                action: 'SELL',
                price: currentPrice,
                reason: `EXTREME RSI OVERBOUGHT (${rsi.toFixed(2)})`
            };
        }

        return null;
    }
}

module.exports = BoosisTrend;
