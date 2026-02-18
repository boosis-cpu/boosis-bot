
// src/strategies/TurtleStrategy.js
const logger = require('../core/logger');
const BOOSISv27RiskManager = require('../core/boosis_v27_risk_management');

/**
 * Turtle Trading Strategy (Richard Dennis Full Implementation)
 * Adaptada para el cerebro HMM de Boosis v2.6.
 * [OPTIMIZADO] Uso de arrays indexados para alto rendimiento en backtest masivo.
 */
class TurtleStrategy {
    constructor(s1Period = 20, s1Exit = 10, s2Period = 55, s2Exit = 20) {
        this.name = '🐢 Tortuga de Richard Dennis';
        this.s1 = s1Period;
        this.s1Exit = s1Exit;
        this.s2 = s2Period;
        this.s2Exit = s2Exit;

        this.lastTradeWasWinner = false;
        this.N_prev = null;

        this.currentPositions = [];
        this.maxUnitsPerMarket = 4;

        this.riskManager = new BOOSISv27RiskManager(10000);
        this.basePositionSize = 10000 * 0.05;  // 5% por operación
        this.dailyLossAccumulated = 0;
        this.lastResetDay = new Date().getDate();
    }

    onCandle(candle, candles, hasPosition, activePosition, capital = 10000, hmmState = null) {
        if (candles.length < this.s2) return null;

        // Índices: 0:time, 1:open, 2:high, 3:low, 4:close, 5:vol
        const close = parseFloat(candle[4]);
        const N = this._calculateN(candles);

        if (hasPosition && activePosition) {
            const entryPrice = parseFloat(activePosition.entryPrice);
            const stopLoss2N = entryPrice - (2 * N);
            const exitLevel = this._getMinLow(candles, this.s1Exit);

            if (close < exitLevel || close < stopLoss2N) {
                const isSL = close < stopLoss2N;
                const exitPrice = close;
                const pnl = (exitPrice - entryPrice) / entryPrice;
                const gain = pnl * 100;

                this.lastTradeWasWinner = (close > entryPrice);
                this.currentPositions = [];

                // REGISTRAR TRADE PARA KELLY
                this.riskManager.recordTrade(pnl, entryPrice, exitPrice, 'BTCUSDT'); // Símbolo hardcodeado por ahora o pasado en params

                // ACTUALIZAR VOLATILITY SCALER
                this.riskManager.updateVolatilityScaler(pnl);

                // ACCUMULAR PÉRDIDA DIARIA
                if (pnl < 0) {
                    this.dailyLossAccumulated += Math.abs(parseFloat(activePosition.amount || 0) * exitPrice * pnl);
                }

                // VERIFICAR Y ACTUALIZAR DRAWDOWN
                const currentEquity = capital + (pnl * capital); // Simplificación para el log de drawdown
                const circuitBreakerActive = this.riskManager.updateDrawdown(currentEquity);

                logger.info(`[Turtle] 🟡 CIERRE ${isSL ? 'SL' : 'DONCHIAN'} (v2.7): ${gain.toFixed(2)}% | Kelly: ${(this.riskManager.kellyFraction * 100).toFixed(0)}% | DD: ${(this.riskManager.maxDrawdown * 100).toFixed(2)}%`);

                if (circuitBreakerActive) {
                    logger.warn(`[Turtle] ⚠️ CIRCUIT BREAKER ACTIVO - modo defensivo`);
                }

                return {
                    action: 'SELL',
                    price: close,
                    reason: isSL
                        ? `🐢 Stop Loss 2N ejecutado ($${stopLoss2N.toFixed(2)})`
                        : `🐢 Salida Donchian ($${exitLevel.toFixed(2)}). PnL: ${gain.toFixed(2)}%`,
                    strategy: 'Turtle'
                };
            }

            // C. PIRAMIDACIÓN: ¿Agregar otra unidad? (+0.5N de ganancia)
            const pyramidSignal = this._getPyramidSignal(close, N, activePosition, capital);
            if (pyramidSignal) return pyramidSignal;

            return null;
        }

        // ==========================================
        // 🛡️ ENTRADA: FILTRO HMM (Evita el "Mismatch" de ruido de 1m)
        // ==========================================
        if (hmmState && !this._isValidTurtleRegime(hmmState)) {
            return null; // No entrar si el HMM no confirma tendencia alcista/acumulación
        }

        const s1High = this._getMaxHigh(candles, this.s1);
        const s2High = this._getMaxHigh(candles, this.s2);

        let signalAction = null;
        let system = '';

        if (close > s1High && !this.lastTradeWasWinner) {
            const prob = hmmState ? hmmState.probability : 1;
            if (prob > 0.70) {
                signalAction = 'BUY';
                system = 'S1';
            }
        } else if (close > s2High) {
            signalAction = 'BUY';
            system = 'S2';
        }

        if (signalAction === 'BUY') {
            // VERIFICAR LÍMITE DIARIO ANTES DE ENTRAR
            if (!this.riskManager.canTradeToday(this.dailyLossAccumulated)) {
                logger.warn(`[Turtle] LÍMITE DIARIO ALCANZADO - No se puede entrar hoy`);
                return null;
            }

            // CALCULAR TAMAÑO DE POSICIÓN CON KELLY + VOLATILITY SCALING
            const currentEquity = capital;
            const positionSize = this.riskManager.calculatePositionSize(
                this.basePositionSize,
                currentEquity
            );

            // VOLATILITY SCALING DEBUG
            const volatilityScaler = this.riskManager.volatilityScaler;

            const unitSize = this._calculateSafeUnit(close, N, positionSize); // Usar positionSize ajustado por riskManager
            this.currentPositions = [{ entryPrice: close }];

            logger.info(`[Turtle] 🟢 ENTRADA (v2.7) ${system}: $${close.toFixed(2)} | Size Adj: ${positionSize.toFixed(2)} | Kelly: ${(this.riskManager.kellyFraction * 100).toFixed(0)}% | Scaler: ${volatilityScaler.toFixed(2)}`);

            return {
                action: 'BUY',
                price: close,
                reason: `🐢 Entrada Turtle ${system}: Breakout. (N=${N.toFixed(2)})`,
                strategy: 'Turtle',
                riskFactor: N,
                unitSize: unitSize,
                // Metadata v2.7
                v27: {
                    kelly: this.riskManager.kellyFraction,
                    volatilityScaler: volatilityScaler,
                    positionSize: positionSize
                }
            };
        }

        // RESET DIARIO DE PÉRDIDAS
        const candleTime = candle[0];
        const currentDay = new Date(candleTime).getDate();
        if (currentDay !== this.lastResetDay) {
            this.dailyLossAccumulated = 0;
            this.lastResetDay = currentDay;
            logger.info(`[Turtle] 📅 Cambio de día detectado. Reset de límites diarios.`);
        }

        return null;
    }

    _isValidTurtleRegime(hmmState) {
        const validLabels = [
            '📈 ALCISTA ESTABLE',
            '🔄 ACUMULACIÓN',
            '🎰 REVERSIÓN AGRESIVA'
        ];
        // En backtest hmmState puede ser un objeto con label o name
        const label = hmmState.label || hmmState.name;
        return validLabels.some(l => label && label.includes(l.split(' ')[1]));
    }

    _createSignal(system, price, N, capital) {
        const unitSize = this._calculateSafeUnit(price, N, capital);
        this.currentPositions = [{ entryPrice: price }];
        return {
            action: 'BUY',
            price: price,
            reason: `🐢 Entrada Turtle ${system}: Breakout. (N=${N.toFixed(2)})`,
            strategy: 'Turtle',
            riskFactor: N,
            unitSize: unitSize
        };
    }


    _getPyramidSignal(close, N, activePosition, capital) {
        if (this.currentPositions.length === 0 && activePosition) {
            this.currentPositions = [{ entryPrice: parseFloat(activePosition.entryPrice) }];
        }

        if (this.currentPositions.length >= this.maxUnitsPerMarket) return null;

        const lastEntry = this.currentPositions[this.currentPositions.length - 1].entryPrice;
        const pyramidLevel = lastEntry + (0.5 * N);

        if (close > pyramidLevel) {
            const unitSize = this._calculateSafeUnit(close, N, capital);
            this.currentPositions.push({ entryPrice: close });
            return {
                action: 'BUY',
                price: close,
                reason: `🐢 Piramidación: Unidad ${this.currentPositions.length} (+0.5N)`,
                strategy: 'Turtle',
                riskFactor: N,
                isPyramid: true,
                unitSize: unitSize
            };
        }
        return null;
    }

    /**
     * 🛡️ Cálculo de Unidad Segura (Evita apalancamiento suicida en 1m)
     */
    _calculateSafeUnit(price, N, capital = 10000) {
        // 1. Riesgo Turtle Original (1% del capital por 1N de movimiento)
        let unitsByRisk = (0.01 * capital) / N;

        // 2. Cap de Apalancamiento Máximo por Unidad (1.25x cada una, total 4 unidades = 5x)
        const maxNotionalPerUnit = capital * 1.25;
        const unitsByLeverage = maxNotionalPerUnit / price;

        // 3. Resultado Final: El más conservador
        const safeUnits = Math.min(unitsByRisk, unitsByLeverage);

        return safeUnits;
    }


    _calculateN(candles) {
        const period = 240; // 4 horas de ATR para suavizar ruido de 1m
        const slice = candles.slice(-2);
        if (slice.length < 2) return this.N_prev || 0;

        // 2:high, 3:low, 4:close
        const h = parseFloat(slice[1][2]);
        const l = parseFloat(slice[1][3]);
        const c_prev = parseFloat(slice[0][4]);

        const tr = Math.max(h - l, Math.abs(h - c_prev), Math.abs(l - c_prev));

        if (this.N_prev === null) {
            let trSum = 0;
            const initSlice = candles.slice(-period - 1);
            for (let i = 1; i < initSlice.length; i++) {
                const h_i = parseFloat(initSlice[i][2]);
                const l_i = parseFloat(initSlice[i][3]);
                const cp_i = parseFloat(initSlice[i - 1][4]);
                trSum += Math.max(h_i - l_i, Math.abs(h_i - cp_i), Math.abs(l_i - cp_i));
            }
            this.N_prev = trSum / period;
        }

        const N = ((period - 1) * this.N_prev + tr) / period;
        this.N_prev = N;

        // 🔴 FAILSAFE: N NUNCA PUEDE SER 0 O MÁS PEQUEÑO QUE MÍNIMO SEGURO
        const MIN_N = 0.01; // Mínimo absoluto (0.01% del precio)
        const N_safe = Math.max(N, MIN_N);

        return N_safe;
    }

    _getMaxHigh(candles, period) {
        let max = -Infinity;
        const startIdx = Math.max(0, candles.length - period - 1);
        for (let i = startIdx; i < candles.length - 1; i++) {
            max = Math.max(max, parseFloat(candles[i][2]));
        }
        return max;
    }

    _getMinLow(candles, period) {
        let min = Infinity;
        const startIdx = Math.max(0, candles.length - period - 1);
        for (let i = startIdx; i < candles.length - 1; i++) {
            min = Math.min(min, parseFloat(candles[i][3]));
        }
        return min;
    }

    getV27Metrics() {
        return this.riskManager.getMetrics();
    }

    printV27Metrics() {
        this.riskManager.printMetrics();
    }
}

module.exports = TurtleStrategy;
