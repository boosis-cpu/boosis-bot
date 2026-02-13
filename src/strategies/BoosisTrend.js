
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
                this.trailingStopPercent = config.trailingStopPercent || 0.015; // 1.5% trailing stop
                this.rsiBuyBound = config.rsiBuyBound || 30;
                this.rsiSellBound = config.rsiSellBound || 70; // 70 is standard overbought
                this.highWaterMark = 0; // Highest price since buy
        }

        onCandle(candle, history) {
                const prices = history.map(c => parseFloat(c[4])); // Close prices
                const highs = history.map(c => parseFloat(c[2]));
                const lows = history.map(c => parseFloat(c[3]));

                // Need enough history for the longest window (SMA200)
                if (prices.length < this.smaLong) return null;

                const currentPrice = parseFloat(candle[4]);

                // Calculate Indicators
                // We use history slices to match indicator library needs if necessary, 
                // but here our library takes full arrays usually.

                const smaLong = TechnicalIndicators.calculateSMA(prices, this.smaLong);
                const rsi = TechnicalIndicators.calculateRSI(prices, this.rsiPeriod);
                const bb = TechnicalIndicators.calculateBollingerBands(prices, this.bbPeriod, 2);

                // MACD defaults: 12, 26, 9
                const macd = TechnicalIndicators.calculateMACD(prices, 12, 26, 9);

                const atr = TechnicalIndicators.calculateATR(highs, lows, prices, this.atrPeriod);

                // Safety check for undefined indicators
                if (!smaLong || !rsi || !bb || !macd || !atr) return null;

                // --- TRADING LOGIC ---

                // 🛡️ SAFETY CHECK: Volatility
                const volatilityPercent = (atr / currentPrice) * 100;

                // Determine Trend
                const trendBullish = currentPrice > smaLong;

                // Determine if we are currently holding (very basic state tracking, ideally passed in)
                // For this strategy file which is stateless per call usually, we return signals.
                // The calling execution engine (LiveTrader) decides if we can open a new position.
                // But the strategy can suggest ENTRY vs EXIT.

                // 🟢 BUY SIGNAL
                // Rule: Bullish Trend (Above SMA200) + RSI Oversold (Cheap) + Price near lower BB + Low Volatility
                if (trendBullish && rsi < this.rsiBuyBound && currentPrice < bb.middle && volatilityPercent < this.maxVolatilityPercent) {
                        // Reset high water mark on new entry signal logic
                        // (Though the strategy object persists, so we can track it)
                        this.highWaterMark = currentPrice;

                        return {
                                action: 'BUY',
                                price: currentPrice,
                                reason: `Bullish Trend & RSI ${rsi.toFixed(2)} & Low Volatility (${volatilityPercent.toFixed(2)}%)`
                        };
                }

                // 🔴 SELL SIGNAL
                // Rule: RSI Overbought OR Price breaks below SMA200 (Trend Reversal) OR MACD Bearish Cross
                if (rsi > this.rsiSellBound) {
                        return { action: 'SELL', price: currentPrice, reason: `RSI Overbought (${rsi.toFixed(2)})` };
                }

                if (currentPrice < smaLong) {
                        return { action: 'SELL', price: currentPrice, reason: `Trend Reversal (Below SMA200)` };
                }

                // Stop Loss / Trailing Stop Logic would go here if we tracked position state deeply
                // For now, we rely on trend reversal and RSI for exits.

                return null; // Hold
        }
}

module.exports = BoosisTrend;
