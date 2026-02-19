const logger = require('../core/logger');

class MeanReversionStrategy {
    constructor() {
        this.name = '🔄 Mean Reversion Crypto';
        this.lookback = 20;
        this.entryZScore = 2.0;
        this.exitZScore = 0.5;
        this.stopLossMultiplier = 3.0;
    }

    configure(profile) {
        if (profile.meanReversion) {
            this.lookback = profile.meanReversion.lookback || 20;
            this.entryZScore = profile.meanReversion.entryZScore || 2.0;
            this.exitZScore = profile.meanReversion.exitZScore || 0.5;
            this.stopLossMultiplier = profile.meanReversion.stopLossMultiplier || 3.0;
        }
    }

    onCandle(candle, candles, hasPosition, activePosition, capital = 10000, hmmState = null) {
        if (candles.length < this.lookback + 1) return null;

        const close = parseFloat(candle[4]);
        const { mean, stdDev } = this._calculateStats(candles, this.lookback);

        if (stdDev === 0) return null;

        const zScore = (close - mean) / stdDev;

        if (hasPosition && activePosition) {
            const entryPrice = parseFloat(activePosition.entryPrice);
            const stopLoss = entryPrice - (this.stopLossMultiplier * stdDev);

            // Salida: precio volvió a la media O stop loss
            const meanReverted = zScore >= -this.exitZScore;
            const hitStopLoss = close < stopLoss;

            if (meanReverted || hitStopLoss) {
                const pnl = ((close - entryPrice) / entryPrice * 100).toFixed(2);
                return {
                    action: 'SELL',
                    price: close,
                    reason: hitStopLoss
                        ? `🔄 Stop Loss MR: $${stopLoss.toFixed(4)}`
                        : `🔄 Media recuperada. PnL: ${pnl}%`,
                    strategy: 'MeanReversion'
                };
            }
            return null;
        }

        // Entrada: precio cayó 2 desviaciones estándar por debajo de la media
        // + HMM no está en régimen bajista estructural
        if (zScore <= -this.entryZScore) {
            if (hmmState) {
                const label = hmmState.label || hmmState.name || '';
                // Bloquear si HMM detecta tendencia bajista fuerte (no es rebote, es caída)
                const isStructuralDowntrend = label.includes('BAJISTA') && hmmState.probability > 0.80;
                if (isStructuralDowntrend) {
                    logger.info(`[MR] 🛡️ Entrada bloqueada: HMM detecta bajista estructural (${hmmState.probability.toFixed(2)})`);
                    return null;
                }
            }

            logger.info(`[MR] 🟢 ENTRADA: Z-Score=${zScore.toFixed(2)} | Precio=$${close} | Media=$${mean.toFixed(4)}`);

            return {
                action: 'BUY',
                price: close,
                reason: `🔄 Sobrereacción detectada. Z-Score: ${zScore.toFixed(2)}`,
                strategy: 'MeanReversion',
                zScore,
                mean,
                stdDev
            };
        }

        return null;
    }

    _calculateStats(candles, period) {
        const slice = candles.slice(-period).map(c => parseFloat(c[4]));
        const mean = slice.reduce((a, b) => a + b, 0) / period;
        const variance = slice.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / period;
        return { mean, stdDev: Math.sqrt(variance) };
    }
}

module.exports = MeanReversionStrategy;
