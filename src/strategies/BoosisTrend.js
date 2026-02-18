const BaseStrategy = require('./BaseStrategy');
const TechnicalIndicators = require('../core/technical_indicators');

class BoosisTrend extends BaseStrategy {
    constructor() {
        super('Boosis Trend Follower');

        // Parámetros por defecto (sobrescribibles por configure())
        this.rsiBuyBound = 30;
        this.rsiSellBound = 75;
        this.emaShort = 12;
        this.emaLong = 26;
        this.emaTrend = 50;
        this.bbPeriod = 20;
        this.bbStdDev = 2.0;
        this.stopLossPercent = 0.02;
        this.trailingStopPercent = 0.015;
        this.highWaterMark = 0;
    }

    onCandle(candle, history, inPosition = false, entryPrice = 0) {
        const currentPrice = parseFloat(candle[4]);
        const len = history.length;
        if (len < this.emaTrend) return null;

        // [OPTIMIZACIÓN MEDALLION] Evitar history.map() completo. 
        // Extraemos solo lo necesario para los indicadores.
        const prices = [];
        const maxNeeded = Math.max(this.emaTrend, this.bbPeriod, 50); // 50 para RSI
        for (let i = Math.max(0, len - maxNeeded); i < len; i++) {
            prices.push(parseFloat(history[i][4]));
        }

        // --- INDICADORES ---
        const emaShortValue = TechnicalIndicators.calculateEMA(prices, this.emaShort);
        const emaLongValue = TechnicalIndicators.calculateEMA(prices, this.emaLong);
        const emaTrendValue = TechnicalIndicators.calculateEMA(prices, this.emaTrend);
        const rsiValue = TechnicalIndicators.calculateRSI(prices, 14);
        const bbValue = TechnicalIndicators.calculateBollingerBands(prices, this.bbPeriod, this.bbStdDev);

        if (!emaShortValue || !emaLongValue || !emaTrendValue || !rsiValue || !bbValue) return null;

        const trendBullish = emaShortValue > emaLongValue && emaLongValue > emaTrendValue;

        // --- RISK MANAGEMENT ---
        if (inPosition) {
            if (currentPrice > this.highWaterMark) this.highWaterMark = currentPrice;

            const stopLossPrice = entryPrice * (1 - this.stopLossPercent);
            if (currentPrice <= stopLossPrice) {
                this.highWaterMark = 0;
                return { action: 'SELL', price: currentPrice, reason: `STOP LOSS (${(this.stopLossPercent * 100).toFixed(1)}%)` };
            }

            const trailingStopPrice = this.highWaterMark * (1 - this.trailingStopPercent);
            if (currentPrice <= trailingStopPrice) {
                this.highWaterMark = 0;
                return { action: 'SELL', price: currentPrice, reason: `TRAILING STOP` };
            }

            if (rsiValue > this.rsiSellBound) {
                this.highWaterMark = 0;
                return { action: 'SELL', price: currentPrice, reason: `RSI OVERBOUGHT (${rsiValue.toFixed(2)})` };
            }
        } else {
            this.highWaterMark = 0;
            // COMPRA: Tendencia Bullish + RSI Oversold + Precio cerca o bajo BB Lower
            if (trendBullish && rsiValue < this.rsiBuyBound && currentPrice <= bbValue.lower) {
                this.highWaterMark = currentPrice;
                return {
                    action: 'BUY',
                    price: currentPrice,
                    reason: `Bullish Trend + RSI ${rsiValue.toFixed(2)} + BB Lower`
                };
            }
        }

        return null;
    }
}

module.exports = BoosisTrend;
