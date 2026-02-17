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
                // Return gracefully instead of throw for optimizer stability
                logger.warn(`[Backtest] No historical data for ${symbol}`);
                return {
                    metrics: { roi: 0, winRate: 0, totalTrades: 0, profitFactor: 0 },
                    trades: [],
                    equity: []
                };
            }

            // Ejecutar simulación
            const results = this._simulateTrading(candles, params);

            // Calcular métricas
            const metrics = this._calculateMetrics(results);

            logger.info(`[Backtest] ✅ Completado: ${symbol} | ROI: ${metrics.roi}% | Trades: ${metrics.totalTrades}`);

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
            case '3y': start.setFullYear(start.getFullYear() - 3); break;
            case '5y': start.setFullYear(start.getFullYear() - 5); break;
            default: start.setMonth(start.getMonth() - 1); // default 1 month
        }

        return start;
    }

    /**
     * Simular trading con parámetros dados
     */
    _simulateTrading(candles, params) {
        const trades = [];
        const equity = []; // [{time, value}]
        let balance = 1000; // Starting capital
        const initialBalance = balance;
        let position = null; // { entryPrice, size, time }
        const fee = 0.001; // 0.1%

        // Need enough data for indicators
        const warmupPeriod = Math.max(params.ema.trend, 50, 14) + 1;

        if (candles.length < warmupPeriod) {
            logger.warn(`[Backtest] Insufficient history (${candles.length}) for warmup (${warmupPeriod})`);
            return { trades: [], equity: [], finalBalance: balance };
        }

        // Main Loop
        for (let i = warmupPeriod; i < candles.length; i++) {
            const candle = candles[i];
            const close = parseFloat(candle.close);
            const time = parseInt(candle.open_time); // BIGINT from PG comes as string

            // 1. Calculate Indicators
            const emaShort = this._ema(candles, i, params.ema.short);
            const emaLong = this._ema(candles, i, params.ema.long);
            const emaTrend = this._ema(candles, i, params.ema.trend);
            const rsi = this._rsi(candles, i, 14);

            // 2. Logic
            if (!position) {
                // BUY CONDITION
                // RSI oversold (< buy_threshold) + Trend Filter (Quick EMA > Slow EMA > Trend EMA)
                // Relaxed trend condition: just price > trend ema or similar
                const isUptrend = emaShort > emaLong; // && emaLong > emaTrend; (Too strict for simple test)

                if (rsi < params.rsi.buy && isUptrend) {
                    const size = (balance * 0.99) / close; // Invest 99%

                    position = {
                        entryPrice: close,
                        size: size,
                        entryTime: candle.open_time
                    };
                    balance -= (size * close) * (1 + fee); // Deduct cost + fee

                    trades.push({
                        id: trades.length + 1,
                        side: 'buy',
                        price: close,
                        time: time,
                        reason: `RSI ${rsi.toFixed(1)} < ${params.rsi.buy}`
                    });
                }
            } else {
                // SELL CONDITION
                // RSI overbought (> sell_threshold) OR Stop Loss
                const currentValue = position.size * close;
                const entryValue = position.size * position.entryPrice;
                const pnlPct = (currentValue - entryValue) / entryValue; // e.g. -0.05 for -5%

                // PnL Logic
                const isStopLoss = pnlPct <= -Math.abs(params.stopLoss);
                const isTakeProfit = rsi > params.rsi.sell;

                if (isStopLoss || isTakeProfit) {
                    const sellReason = isStopLoss ? 'stop_loss' : 'take_profit';
                    const revenue = (position.size * close) * (1 - fee);
                    balance += revenue;

                    const tradePnl = revenue - (position.size * position.entryPrice * (1 + fee)); // Net PnL considering fees

                    trades.push({
                        id: trades.length + 1,
                        side: 'sell',
                        price: close,
                        time: time,
                        pnl: tradePnl,
                        pnlPct: (tradePnl / (position.size * position.entryPrice)) * 100, // ROI % of this trade
                        reason: `${sellReason} (RSI: ${rsi.toFixed(1)})`
                    });

                    position = null;
                }
            }

            // Track Equity
            const openPositionValue = position ? (position.size * close) : 0;
            const totalEquity = balance + openPositionValue;

            // Push equity point every 4 hours or so to save space, or every candle if short period
            if (i % 4 === 0 || i === candles.length - 1) {
                equity.push({ time: time, value: totalEquity });
            }
        }

        return {
            trades,
            equity,
            finalBalance: equity.length > 0 ? equity[equity.length - 1].value : initialBalance
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
        const trades = results.trades.filter(t => t.side === 'sell');
        const totalTrades = trades.length;

        if (totalTrades === 0) {
            return {
                roi: 0,
                winRate: 0,
                totalTrades: 0,
                profitFactor: 0,
                maxDD: 0,
                sharpe: 0
            };
        }

        let wins = 0;
        let losses = 0;
        let grossProfit = 0;
        let grossLoss = 0;

        trades.forEach(t => {
            if (t.pnl > 0) {
                wins++;
                grossProfit += t.pnl;
            } else {
                losses++;
                grossLoss += Math.abs(t.pnl);
            }
        });

        const winRate = (wins / totalTrades) * 100;
        const profitFactor = grossLoss === 0 ? (grossProfit > 0 ? 100 : 0) : grossProfit / grossLoss;
        const totalReturn = results.finalBalance - 1000;
        const roi = (totalReturn / 1000) * 100;

        // Max Drawdown
        let maxPeak = -Infinity;
        let maxDD = 0;

        results.equity.forEach(point => {
            if (point.value > maxPeak) maxPeak = point.value;
            const dd = (maxPeak - point.value) / maxPeak;
            if (dd > maxDD) maxDD = dd;
        });

        return {
            roi: parseFloat(roi.toFixed(2)),
            winRate: parseFloat(winRate.toFixed(1)),
            totalTrades,
            profitFactor: parseFloat(profitFactor.toFixed(2)),
            maxDD: parseFloat((maxDD * 100).toFixed(2)),
            sharpe: 0 // TODO: Implement proper Sharpe calculation
        };
    }
}

module.exports = new BacktestEngine();
