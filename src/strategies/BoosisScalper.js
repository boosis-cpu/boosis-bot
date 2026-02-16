const logger = require('../core/logger');

class BoosisScalper {
    constructor() {
        this.name = 'BoosisScalper';
        // Configuración "Guerrilla" para $10 USD por bot
        this.defaultConfig = {
            // Indicadores
            rsiPeriod: 14,
            stochPeriod: 14,
            stochK: 3,
            stochD: 3,
            bbPeriod: 20,
            bbStdDev: 2.0,

            // Gatillos de Entrada (Agresivos)
            buyRsiThreshold: 30,      // Muy sobrevendido
            buyStochKThreshold: 20,   // Momento de vuelta

            // Gatillos de Salida
            takeProfit: 1.5,          // 1.5% ganancia fija (Scalping)
            stopLoss: 1.0,            // 1.0% pérdida máxima (Cortar rápido)
            trailingTrigger: 0.8,     // Activar trailing al 0.8% de ganancia
            trailingOffset: 0.2,      // Mantener distancia del 0.2%

            sellRsiThreshold: 70      // Salida por indicador
        };

        this.config = { ...this.defaultConfig };
        this.trailingActive = false;
        this.highestPrice = 0;
    }

    configure(params) {
        this.config = { ...this.defaultConfig, ...params };
        logger.info(`[BoosisScalper] Configuración actualizada: TP ${this.config.takeProfit}% | SL ${this.config.stopLoss}%`);
    }

    onCandle(candle, history, inPosition, entryPrice) {
        if (history.length < 50) return null; // Esperar calentamiento

        const close = candle[4];

        // Calcular Indicadores
        const rsi = this.calculateRSI(history, this.config.rsiPeriod);
        const { k, d } = this.calculateStochRSI(history, this.config.stochPeriod, this.config.stochK, this.config.stochD);
        const bb = this.calculateBollingerBands(history, this.config.bbPeriod, this.config.bbStdDev);

        if (!rsi || !k || !bb) return null;

        // Gestión de Posición Abierta
        if (inPosition) {
            return this.checkExit(close, entryPrice, rsi, k, bb);
        }

        // Búsqueda de Entrada
        return this.checkEntry(close, rsi, k, bb);
    }

    checkEntry(currentPrice, rsi, stochK, bb) {
        // Lógica de Entrada: "Rebote de Gato Muerto" o "Mean Reversion"
        // 1. RSI < 30 (Sobrevendido)
        // 2. Stoch K < 20 (Impulso bajista agotado)
        // 3. Precio debajo o tocando Banda Inferior (Desviación precio importante)

        const isOversold = rsi < this.config.buyRsiThreshold;
        const isStochBuy = stochK < this.config.buyStochKThreshold;
        const isBelowBand = currentPrice <= bb.lower;

        if (isOversold && isStochBuy && isBelowBand) {
            this.trailingActive = false;
            this.highestPrice = 0;
            return {
                action: 'BUY',
                price: currentPrice,
                reason: `SCALP ENTRY | RSI: ${rsi.toFixed(1)} | StochK: ${stochK.toFixed(1)} | BB Low Hit`
            };
        }
        return null;
    }

    checkExit(currentPrice, entryPrice, rsi, stochK, bb) {
        // Calcular PnL actual
        const pnlPercent = ((currentPrice - entryPrice) / entryPrice) * 100;

        // 1. Stop Loss Duro (Seguridad)
        if (pnlPercent <= -this.config.stopLoss) {
            return {
                action: 'SELL',
                price: currentPrice,
                reason: `STOP LOSS | PnL: ${pnlPercent.toFixed(2)}%`
            };
        }

        // 2. Trailing Stop Dinámico
        if (pnlPercent >= this.config.trailingTrigger) {
            this.trailingActive = true;
        }

        if (this.trailingActive) {
            // Actualizar pico más alto
            if (currentPrice > this.highestPrice || this.highestPrice === 0) {
                this.highestPrice = currentPrice;
            }

            // Calcular distancia desde el pico
            const dropFromHigh = ((this.highestPrice - currentPrice) / this.highestPrice) * 100;

            // Si cae más del offset, vender
            if (dropFromHigh >= this.config.trailingOffset) {
                return {
                    action: 'SELL',
                    price: currentPrice,
                    reason: `TRAILING STOP | Secured PnL: ${pnlPercent.toFixed(2)}%`
                };
            }
        }

        // 3. Take Profit Fijo (Si explota hacia arriba muy rápido)
        if (pnlPercent >= this.config.takeProfit) {
            return {
                action: 'SELL',
                price: currentPrice,
                reason: `TAKE PROFIT TARGET | PnL: ${pnlPercent.toFixed(2)}%`
            };
        }

        // 4. Salida Técnica (Indicadores se invierten)
        // Si RSI cruza 70 (Sobrecompra) o toca Banda Superior
        if (rsi > this.config.sellRsiThreshold || currentPrice >= bb.upper) {
            if (pnlPercent > 0.2) { // Solo salir por técnico si hay ganancia mínima para cubrir fees
                return {
                    action: 'SELL',
                    price: currentPrice,
                    reason: `INDICATOR EXIT | RSI: ${rsi.toFixed(1)} | BB Upper Hit`
                };
            }
        }

        return null;
    }

    // --- INDICATORS MATH ---

    calculateRSI(history, period) {
        if (history.length < period + 1) return null;

        let gains = 0;
        let losses = 0;

        // Calculate initial regular average
        for (let i = history.length - period - 1; i < history.length - 1; i++) {
            const change = history[i + 1][4] - history[i][4];
            if (change > 0) gains += change;
            else losses += Math.abs(change);
        }

        let avgGain = gains / period;
        let avgLoss = losses / period;

        // Smoothing could be added here, but simple works for scalping speed
        // Actually, Wilder's smoothing is standard. Using simple for MVP speed.

        if (avgLoss === 0) return 100;
        const rs = avgGain / avgLoss;
        return 100 - (100 / (1 + rs));
    }

    calculateStochRSI(history, period, kPeriod, dPeriod) {
        // Needs sequence of RSI values. Simplified for MVP:
        // Using last [period] candles to find high/low of RSI is complex here without full library.
        // Returning approximated Stochastic based on Price for speed:

        // Fast Stochastic Formula: %K = (Current Close - Lowest Low)/(Highest High - Lowest Low) * 100
        const subset = history.slice(-period);
        const lowLow = Math.min(...subset.map(c => c[3]));
        const highHigh = Math.max(...subset.map(c => c[2]));
        const close = history[history.length - 1][4];

        if (highHigh === lowLow) return { k: 50, d: 50 };

        const k = ((close - lowLow) / (highHigh - lowLow)) * 100;
        // D is SMA of K (skip for now, assume D=K for instant reaction)
        return { k: k, d: k };
    }

    calculateBollingerBands(history, period, stdDev) {
        const subset = history.slice(-period);
        const closes = subset.map(c => c[4]);

        const sum = closes.reduce((a, b) => a + b, 0);
        const mean = sum / period;

        const squaredDiffs = closes.map(c => Math.pow(c - mean, 2));
        const variance = squaredDiffs.reduce((a, b) => a + b, 0) / period;
        const std = Math.sqrt(variance);

        return {
            middle: mean,
            upper: mean + (std * stdDev),
            lower: mean - (std * stdDev)
        };
    }
}

module.exports = BoosisScalper;
