
const TI = require('technicalindicators');

/**
 * TechnicalIndicators v2.6 [ULTRA-FAST BACKTEST EDITION]
 * Optimizaciones para evitar cálculos redundantes en millones de velas.
 */
class TechnicalIndicators {
    /**
     * EMA Optimizada (Calculada solo sobre el cierre)
     */
    static calculateEMA(data, period) {
        if (data.length < period) return null;
        // Solo enviamos las últimas 'period * 2' velas para no saturar el motor de TI
        const subset = data.slice(-(period * 2));
        const results = TI.EMA.calculate({ period: period, values: subset });
        return results[results.length - 1];
    }

    /**
     * RSI Optimizado
     */
    static calculateRSI(data, period = 14) {
        if (data.length < period + 1) return null;
        const subset = data.slice(-(period * 3)); // 3x periodo es suficiente para convergencia RSI
        const results = TI.RSI.calculate({ period: period, values: subset });
        return results[results.length - 1];
    }

    /**
     * Bollinger Bands Optimizadas
     */
    static calculateBollingerBands(data, period = 20, stdDev = 2) {
        if (data.length < period) return null;
        const subset = data.slice(-period);
        const results = TI.BollingerBands.calculate({
            period: period,
            stdDev: stdDev,
            values: subset
        });
        return results[results.length - 1];
    }

    /**
     * ATR Optimizado
     */
    static calculateATR(high, low, close, period = 14) {
        if (high.length < period) return null;

        const hSub = high.slice(-(period + 1));
        const lSub = low.slice(-(period + 1));
        const cSub = close.slice(-(period + 1));

        const results = TI.ATR.calculate({
            high: hSub,
            low: lSub,
            close: cSub,
            period: period
        });
        return results[results.length - 1];
    }

    /**
     * MACD Optimizado
     */
    static calculateMACD(data, fastPeriod = 12, slowPeriod = 26, signalPeriod = 9) {
        if (data.length < slowPeriod + signalPeriod) return null;
        const subset = data.slice(-(slowPeriod + signalPeriod + 50));
        const results = TI.MACD.calculate({
            values: subset,
            fastPeriod,
            slowPeriod,
            signalPeriod,
            SimpleMAOscillator: false,
            SimpleMASignal: false
        });
        return results[results.length - 1];
    }
}

module.exports = TechnicalIndicators;
