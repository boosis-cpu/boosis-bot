// src/core/backtest-engine.js
const db = require('./database');
const logger = require('./logger');

class BacktestEngine {
    constructor() {
        this.cache = new Map(); // Cache de backtests para no recalcular
    }

    /**
     * Ejecutar backtest con parámetros dados
     * @param {string} symbol - BTCUSDT, ETHUSDT, etc
     * @param {object} params - Parámetros de estrategia
     * @param {string} period - '1m', '1w', '1y', etc
     * @returns {object} Resultados del backtest
     */
    async runBacktest(symbol, params, period = '1y') {
        try {
            logger.info(`[Backtest] Iniciando para ${symbol} período ${period}`);

            // Cargar datos históricos
            const candles = await this._loadHistoricalData(symbol, period);

            if (candles.length === 0) {
                throw new Error(`No hay datos históricos para ${symbol}`);
            }

            // Ejecutar simulación
            const results = this._simulateTrading(candles, params);

            // Calcular métricas
            const metrics = this._calculateMetrics(results);

            logger.info(`[Backtest] ✅ Completado: ${symbol} | Win Rate: ${metrics.winRate}%`);

            return {
                status: 'completed',
                symbol: symbol,
                period: period,
                params: params,
                metrics: metrics,
                trades: results.trades,
                equity: results.equity,
                completedAt: new Date().toISOString(),
            };
        } catch (error) {
            logger.error(`[Backtest] ❌ Error: ${error.message}`);
            throw error;
        }
    }

    /**
     * Cargar datos históricos de la BD
     */
    async _loadHistoricalData(symbol, period) {
        try {
            // Calcular fecha inicio según período
            const endDate = new Date();
            const startDate = this._calculateStartDate(endDate, period);

            const result = await db.pool.query(`
        SELECT 
          open_time, open, high, low, close, volume
        FROM candles
        WHERE symbol = $1 
          AND open_time >= $2
          AND open_time <= $3
        ORDER BY open_time ASC
      `, [
                symbol,
                startDate.getTime(),
                endDate.getTime(),
            ]);

            logger.debug(`[Backtest] Cargados ${result.rows.length} candles para ${symbol}`);
            return result.rows;
        } catch (error) {
            logger.error(`[Backtest] Error cargando datos: ${error.message}`);
            return [];
        }
    }

    /**
     * Calcular fecha inicio según período
     */
    _calculateStartDate(endDate, period) {
        const start = new Date(endDate);

        switch (period) {
            case '1m': start.setMonth(start.getMonth() - 1); break;
            case '3m': start.setMonth(start.getMonth() - 3); break;
            case '6m': start.setMonth(start.getMonth() - 6); break;
            case '1y': start.setFullYear(start.getFullYear() - 1); break;
            case '2y': start.setFullYear(start.getFullYear() - 2); break;
            default: start.setMonth(start.getMonth() - 1); // default 1 month
        }

        return start;
    }

    /**
     * Simular trading con parámetros dados
     */
    _simulateTrading(candles, params) {
        const trades = [];
        const equity = [{ time: candles[0].open_time, value: 100 }];
        const fee = 0.001; // 0.1% trading fee per operation

        let position = null; // null | {side, entryPrice, entryTime}
        let balance = 100; // USD simulado
        let maxBalance = 100;

        for (let i = 0; i < candles.length; i++) {
            const candle = candles[i];

            // Convertir valores a números para asegurar cálculos correctos
            const close = parseFloat(candle.close);

            // Calcular indicadores
            const emaShortValue = this._ema(candles, i, params.ema.short);
            const emaLongValue = this._ema(candles, i, params.ema.long);
            const emaTrendValue = this._ema(candles, i, params.ema.trend);
            const rsiValue = this._rsi(candles, i, 14);

            // Lógica de señales
            if (!position) {
                // COMPRA: RSI oversold + EMA confirmación
                if (rsiValue < params.rsi.buy && emaShortValue > emaLongValue && emaLongValue > emaTrendValue) {
                    position = {
                        side: 'BUY',
                        entryPrice: close,
                        entryTime: candle.open_time,
                    };

                    // Apply 0.1% fee on buy
                    balance = balance * (1 - fee);

                    trades.push({
                        date: new Date(candle.open_time).toISOString(),
                        side: 'BUY',
                        price: close,
                        reason: 'RSI + EMA',
                    });
                }
            } else if (position.side === 'BUY') {
                // VENTA: RSI overbought o stop loss
                const pnl = (close - position.entryPrice) / position.entryPrice;
                const stopLoss = -Math.abs(params.stopLoss || 0.02);

                if (rsiValue > params.rsi.sell || pnl < stopLoss) {
                    // Apply P&L and 0.1% fee on sell
                    balance = balance * (1 + pnl) * (1 - fee);
                    maxBalance = Math.max(maxBalance, balance);

                    trades.push({
                        date: new Date(candle.open_time).toISOString(),
                        side: 'SELL',
                        price: close,
                        pnl: pnl * 100, // %
                        reason: rsiValue > params.rsi.sell ? 'RSI' : 'SL',
                    });

                    position = null;
                }
            }

            // Guardar equity cada día (aproximadamente cada 288 velas de 5m)
            if (i % 288 === 0 || i === candles.length - 1) {
                equity.push({
                    time: candle.open_time,
                    value: Math.round(balance * 100) / 100,
                });
            }
        }

        return {
            trades: trades,
            equity: equity,
            finalBalance: balance,
            maxBalance: maxBalance,
        };
    }

    /**
     * Calcular EMA (promedio móvil exponencial)
     */
    _ema(candles, index, period) {
        if (index < period) return parseFloat(candles[index].close);

        const multiplier = 2 / (period + 1);
        let ema = parseFloat(candles[index - period].close);

        for (let i = index - period + 1; i <= index; i++) {
            ema = (parseFloat(candles[i].close) - ema) * multiplier + ema;
        }

        return ema;
    }

    /**
     * Calcular RSI (índice de fuerza relativa)
     */
    _rsi(candles, index, period) {
        if (index < period) return 50;

        let gains = 0;
        let losses = 0;

        for (let i = index - period; i < index; i++) {
            const diff = parseFloat(candles[i + 1].close) - parseFloat(candles[i].close);
            if (diff > 0) gains += diff;
            else losses += Math.abs(diff);
        }

        const avgGain = gains / period;
        const avgLoss = losses / period;
        if (avgLoss === 0) return 100;

        const rs = avgGain / avgLoss;
        return 100 - (100 / (1 + rs));
    }

    /**
     * Calcular Bandas de Bollinger
     */
    _bollingerBands(candles, index, period, stdDev) {
        if (index < period) return { upper: 0, middle: 0, lower: 0 };

        let sum = 0;
        for (let i = index - period + 1; i <= index; i++) {
            sum += parseFloat(candles[i].close);
        }

        const middle = sum / period;

        let variance = 0;
        for (let i = index - period + 1; i <= index; i++) {
            variance += Math.pow(parseFloat(candles[i].close) - middle, 2);
        }

        const stdDeviation = Math.sqrt(variance / period);

        return {
            upper: middle + (stdDeviation * stdDev),
            middle: middle,
            lower: middle - (stdDeviation * stdDev),
        };
    }

    /**
     * Calcular métricas finales
     */
    _calculateMetrics(results) {
        const sellTrades = results.trades.filter(t => t.side === 'SELL');
        const winningTrades = sellTrades.filter(t => t.pnl > 0).length;
        const losingTrades = sellTrades.filter(t => t.pnl < 0).length;

        const winRate = sellTrades.length > 0 ? (winningTrades / sellTrades.length) * 100 : 0;

        // Calcular Sharpe Ratio (simplificado)
        const returns = [];
        for (let i = 1; i < results.equity.length; i++) {
            const ret = (results.equity[i].value - results.equity[i - 1].value) / results.equity[i - 1].value;
            returns.push(ret);
        }

        const avgReturn = returns.length > 0 ? returns.reduce((a, b) => a + b) / returns.length : 0;
        const stdDev = returns.length > 1
            ? Math.sqrt(returns.reduce((sq, n) => sq + Math.pow(n - avgReturn, 2), 0) / (returns.length - 1))
            : 0;
        const sharpeRatio = stdDev > 0 ? (avgReturn * Math.sqrt(252)) / stdDev : 0; // Aproximación anualizada

        // Max Drawdown
        let maxDD = 0;
        let peak = 100;
        for (const point of results.equity) {
            if (point.value > peak) peak = point.value;
            const dd = ((point.value - peak) / peak) * 100;
            if (dd < maxDD) maxDD = dd;
        }

        // Profit Factor
        const totalWins = sellTrades.filter(t => t.pnl > 0).reduce((sum, t) => sum + t.pnl, 0);
        const totalLosses = Math.abs(sellTrades.filter(t => t.pnl < 0).reduce((sum, t) => sum + t.pnl, 0));
        const profitFactor = totalLosses > 0 ? totalWins / totalLosses : (totalWins > 0 ? 99.9 : 0);

        return {
            winRate: Math.round(winRate * 100) / 100,
            winningTrades: winningTrades,
            losingTrades: losingTrades,
            totalTrades: sellTrades.length,
            sharpe: Math.round(sharpeRatio * 100) / 100,
            maxDD: Math.round(maxDD * 100) / 100,
            profitFactor: Math.round(profitFactor * 100) / 100,
            roi: Math.round(((results.finalBalance - 100) / 100) * 10000) / 100,
        };
    }
}

module.exports = new BacktestEngine();
