
const BaseStrategy = require('./BaseStrategy');
const TechnicalIndicators = require('../core/technical_indicators');

class BoosisTrend extends BaseStrategy {
        constructor(config = {}) {
                super('Boosis Trend Follower');
                this.smaLong = config.smaLong || 200;
                this.rsiPeriod = config.rsiPeriod || 14;
                this.bbPeriod = config.bbPeriod || 20;

                // Volatility & Risk Management
                this.atrPeriod = config.atrPeriod || 14;
                this.maxVolatilityPercent = config.maxVolatilityPercent || 1.5; // Max 1.5% candle movement allowed

                // Strategy Configs
                this.stopLossPercent = config.stopLossPercent || 0.02; // 2% fixed stop loss
                this.rsiBuyBound = config.rsiBuyBound || 30;
                this.rsiSellBound = config.rsiSellBound || 70;
        }

        onCandle(candle, history) {
                const prices = history.map(c => parseFloat(c[4])); // Close prices
                const highs = history.map(c => parseFloat(c[2]));
                const lows = history.map(c => parseFloat(c[3]));

                // Need enough history for calculations
                if (prices.length < this.smaLong) return null;

                const currentPrice = parseFloat(candle[4]);

                // Calculate Indicators
                const smaLong = TechnicalIndicators.calculateSMA(prices, this.smaLong);
                const rsi = TechnicalIndicators.calculateRSI(prices, this.rsiPeriod);
                const bb = TechnicalIndicators.calculateBollingerBands(prices, this.bbPeriod, 2);
                const atr = TechnicalIndicators.calculateATR(highs, lows, prices, this.atrPeriod);

                // Safety check: ensure indicators were calculated
                if (!smaLong || !rsi || !bb || !atr) return null;

                // Save for status reporting
                this.lastIndicators = {
                        rsi: rsi.toFixed(2),
                        sma200: smaLong.toFixed(2),
                        bbUpper: bb.upper.toFixed(2),
                        bbLower: bb.lower.toFixed(2),
                        atr: atr.toFixed(2),
                        volatility: ((atr / currentPrice) * 100).toFixed(2)
                };

                // --- TRADING LOGIC ---
                const volatilityPercent = (atr / currentPrice) * 100;
                const trendBullish = currentPrice > smaLong;

                // 🟢 BUY SIGNAL
                // Rule: Bullish Trend + RSI Oversold + Price near lower BB
                if (trendBullish && rsi < this.rsiBuyBound && currentPrice < bb.lower && volatilityPercent < this.maxVolatilityPercent) {
                        return {
                                action: 'BUY',
                                price: currentPrice,
                                reason: `Bullish Trend & RSI ${rsi.toFixed(2)} & Lower BB Break`
                        };
                }

                // 🔴 SELL SIGNAL
                // Rule: RSI Overbought OR Trend Reversal
                if (rsi > this.rsiSellBound) {
                        return { action: 'SELL', price: currentPrice, reason: `RSI Overbought (${rsi.toFixed(2)})` };
                }

                if (currentPrice < smaLong * 0.995) { // Small buffer for noise
                        return { action: 'SELL', price: currentPrice, reason: `Trend Reversal (Below SMA200)` };
                }

                return null; // Hold
        }
}

module.exports = BoosisTrend;
