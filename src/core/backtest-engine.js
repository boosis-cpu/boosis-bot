// src/core/backtest-engine.js
const db = require('./database');
const logger = require('./logger');

class BacktestEngine {
    constructor() {
        this.cache = new Map();
    }

    async runBacktest(symbol, params, period = '1y', options = {}) {
        try {
            logger.info(`[Backtest] Iniciando para ${symbol} período ${period} | Estrategia: ${params.strategy || 'default'}`);

            const candles1m = await this._loadHistoricalData(symbol, period, options);
            if (candles1m.length === 0) {
                logger.warn(`[Backtest] No historical data for ${symbol}`);
                return {
                    metrics: { roi: 0, winRate: 0, totalTrades: 0, profitFactor: 0 },
                    trades: [],
                    equity: []
                };
            }

            // AGREGAR A 4H ANTES DE SIMULAR SI ES TURTLE, HMM O MEAN REVERSION (v2.7)
            const candles = (params.strategy === 'turtle' || params.strategy === 'regime_hmm' || params.strategy === 'mean_reversion')
                ? this._aggregateTo4h(candles1m)
                : candles1m;

            // Seleccionar lógica de simulación
            const results = params.strategy === 'regime_hmm'
                ? await this._simulateRegimePortfolio(candles, params)
                : params.strategy === 'mean_reversion'
                    ? this._simulateMeanReversion(candles, params)
                    : params.strategy === 'turtle'
                        ? this._simulateTurtle(candles, params)
                        : this._simulateTrading(candles, params);

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

    async _simulateRegimePortfolio(candles, params) {
        logger.info(`[BacktestDebug] Entering _simulateRegimePortfolio with ${candles.length} candles`);
        const HMMEngine = require('./hmm-engine');

        const trades = [];
        const equity = [];
        let balance = params.initialCapital || 1000;
        const initialBalance = balance;
        let position = null;
        const fee = 0.001;

        const hmm = new HMMEngine(8);
        const warmup = params.warmup || 200;
        const minConfidence = params.minConfidence || 0.60;
        const sellOnBajista = params.sellOnBajista !== false;

        if (candles.length < warmup) {
            return { trades: [], equity: [], finalBalance: balance };
        }

        // CONVERSIÓN DE DATOS: HMMEngine espera arrays [t,o,h,l,c,v], Backtest usa objetos.
        const candlesArray = candles.map(c => [
            c.open_time,
            parseFloat(c.open),
            parseFloat(c.high),
            parseFloat(c.low),
            parseFloat(c.close),
            parseFloat(c.volume)
        ]);

        // Entrenar HMM con los primeros datos (warmup)
        await hmm.train(candlesArray.slice(0, warmup), 30);
        logger.info(`[BacktestDebug] HMM trained: ${hmm.isTrained} | Candles: ${candles.length} | First prediction test...`);

        // Test rápido
        try {
            const testPrediction = hmm.predictState(candlesArray.slice(0, 20));
            logger.info(`[BacktestDebug] Test prediction: ${JSON.stringify(testPrediction)}`);
        } catch (e) {
            logger.error(`[BacktestDebug] Test prediction error: ${e.message}`);
        }

        for (let i = warmup; i < candles.length; i++) {
            const close = parseFloat(candles[i].close);
            const time = parseInt(candles[i].open_time);

            // Reentrenar HMM cada 180 velas (~30 días en 4h)
            try {
                if (i % 180 === 0 && i > warmup) {
                    await hmm.train(candlesArray.slice(Math.max(0, i - 500), i), 20);
                }
            } catch (e) {
                logger.warn(`[BacktestDebug] Re-train error at ${i}: ${e.message}`);
            }

            const slice = candlesArray.slice(Math.max(0, i - 50), i + 1);
            let prediction = null;
            try {
                prediction = hmm.predictState(slice);
            } catch (e) {
                // Ignore predict error
            }

            if (!prediction || prediction.probability < minConfidence) {
                equity.push({ time, value: balance + (position ? position.size * close : 0) });
                continue;
            }

            const label = prediction.label.toUpperCase();
            const isBullish = label.includes('ALCISTA') || label.includes('ACUMULACIÓN');
            const isBearish = label.includes('BAJISTA') || label.includes('DISTRIBUCIÓN');
            const isLateral = label.includes('LATERAL');

            // COMPRAR: Régimen alcista/acumulación sin posición
            if (isBullish && !position) {
                const size = (balance * 0.95) / close;
                balance -= (size * close) * (1 + fee);
                position = { entryPrice: close, size, entryTime: time, entryRegime: label };

                trades.push({
                    id: trades.length + 1,
                    side: 'buy',
                    price: close,
                    time,
                    reason: `regime_${label}_${(prediction.probability * 100).toFixed(0)}pct`
                });
            }

            // VENDER: Régimen bajista/distribución con posición
            else if ((isBearish || (isLateral && sellOnBajista)) && position) {
                const revenue = (position.size * close) * (1 - fee);
                const cost = position.size * position.entryPrice * (1 + fee);
                const pnl = revenue - cost;
                const pnlPct = (pnl / cost) * 100;

                balance += revenue;

                trades.push({
                    id: trades.length + 1,
                    side: 'sell',
                    price: close,
                    time,
                    pnl,
                    pnlPct,
                    reason: `regime_exit_${label}`
                });

                position = null;
            }

            const openValue = position ? position.size * close : 0;
            equity.push({ time, value: balance + openValue });
        }

        // Cerrar posición abierta al final
        if (position && candles.length > 0) {
            const lastClose = parseFloat(candles[candles.length - 1].close);
            const revenue = (position.size * lastClose) * (1 - fee);
            balance += revenue;
        }

        return {
            trades,
            equity,
            finalBalance: equity.length > 0 ? equity[equity.length - 1].value : balance
        };
    }

    _aggregateTo4h(candles1m) {
        const MS_4H = 4 * 60 * 60 * 1000;
        const grouped = {};

        for (const c of candles1m) {
            const t = Math.floor(parseInt(c.open_time) / MS_4H) * MS_4H;
            if (!grouped[t]) grouped[t] = [];
            grouped[t].push(c);
        }

        return Object.entries(grouped)
            .sort(([a], [b]) => a - b)
            .map(([time, group]) => ({
                open_time: time,
                open: group[0].open,
                high: Math.max(...group.map(c => parseFloat(c.high))).toString(),
                low: Math.min(...group.map(c => parseFloat(c.low))).toString(),
                close: group[group.length - 1].close,
                volume: group.reduce((s, c) => s + parseFloat(c.volume), 0).toString()
            }));
    }

    _simulateMeanReversion(candles, params) {
        const trades = [];
        const equity = [];
        let balance = params.initialCapital || 1000;
        const initialBalance = balance;
        let position = null;
        const fee = 0.001;

        const lookback = params.lookback || 20;
        const entryZScore = params.entryZScore || 2.0;
        const exitZScore = params.exitZScore || 0.5;
        const stopMultiplier = params.stopLossMultiplier || 3.0;

        for (let i = lookback + 1; i < candles.length; i++) {
            const close = parseFloat(candles[i].close);
            const time = parseInt(candles[i].open_time);

            const slice = candles.slice(i - lookback, i).map(c => parseFloat(c.close));
            const mean = slice.reduce((a, b) => a + b, 0) / lookback;
            const stdDev = Math.sqrt(slice.reduce((s, v) => s + Math.pow(v - mean, 2), 0) / lookback);

            if (stdDev === 0) continue;

            const zScore = (close - mean) / stdDev;

            if (position) {
                const stopLoss = position.entryPrice - (stopMultiplier * stdDev);
                const shouldExit = zScore >= -exitZScore || close < stopLoss;

                if (shouldExit) {
                    const revenue = (position.size * close) * (1 - fee);
                    const cost = position.size * position.entryPrice * (1 + fee);
                    const pnl = revenue - cost;
                    const pnlPct = (pnl / cost) * 100;

                    balance += revenue;

                    trades.push({
                        id: trades.length + 1,
                        side: 'sell',
                        price: close,
                        time,
                        pnl,
                        pnlPct,
                        reason: close < stopLoss ? 'stop_loss' : 'mean_reverted'
                    });
                    position = null;
                }
            } else {
                if (zScore <= -entryZScore) {
                    const size = (balance * 0.99) / close;
                    balance -= (size * close) * (1 + fee);
                    position = { entryPrice: close, size, entryTime: time };

                    trades.push({
                        id: trades.length + 1,
                        side: 'buy',
                        price: close,
                        time,
                        reason: `z_score_${zScore.toFixed(2)}`
                    });
                }
            }

            const openValue = position ? position.size * close : 0;
            equity.push({ time, value: balance + openValue });
        }

        return {
            trades,
            equity,
            finalBalance: equity.length > 0 ? equity[equity.length - 1].value : initialBalance
        };
    }

    _simulateTurtle(candles, params) {
        const trades = [];
        const equity = [];
        let balance = params.initialCapital || 1000;
        const initialBalance = balance;
        let position = null;
        const fee = 0.001;

        const s1 = params.s1Period || 20;
        const s1Exit = params.s1Exit || 10;
        const s2 = params.s2Period || 55;
        const atrPeriod = params.atrPeriod || 20;

        if (candles.length < s2 + atrPeriod) return { trades: [], equity: [], finalBalance: balance };

        let N_prev = null;
        let lastTradeWasWinner = false;

        for (let i = s2 + atrPeriod; i < candles.length; i++) {
            const close = parseFloat(candles[i].close);
            const time = parseInt(candles[i].open_time);

            // Calcular N (ATR)
            const N = this._calculateATR(candles, i, atrPeriod, N_prev);
            N_prev = N;

            // Donchian channels
            const s1High = this._getMaxHighDB(candles, i, s1);
            const s2High = this._getMaxHighDB(candles, i, s2);
            const exitLow = this._getMinLowDB(candles, i, s1Exit);

            if (position) {
                const stopLoss = position.entryPrice - (2 * N);
                const shouldExit = close < exitLow || close < stopLoss;

                if (shouldExit) {
                    const isSL = close < stopLoss;
                    const revenue = (position.size * close) * (1 - fee);
                    const cost = position.size * position.entryPrice * (1 + fee);
                    const pnl = revenue - cost;
                    const pnlPct = (pnl / cost) * 100;

                    balance += revenue;
                    lastTradeWasWinner = pnl > 0;

                    trades.push({
                        id: trades.length + 1,
                        side: 'sell',
                        price: close,
                        time,
                        pnl,
                        pnlPct,
                        reason: isSL ? 'stop_loss_2N' : 'donchian_exit'
                    });
                    position = null;
                }
            } else {
                // Entrada S1 (si el último trade no fue ganador)
                const enterS1 = close > s1High && !lastTradeWasWinner;
                // Entrada S2 (siempre)
                const enterS2 = close > s2High;

                if (enterS1 || enterS2) {
                    const size = (balance * 0.99) / close;
                    balance -= (size * close) * (1 + fee);

                    position = {
                        entryPrice: close,
                        size,
                        entryTime: time,
                        system: enterS2 ? 'S2' : 'S1'
                    };

                    trades.push({
                        id: trades.length + 1,
                        side: 'buy',
                        price: close,
                        time,
                        reason: `turtle_${position.system}`
                    });
                }
            }

            const openValue = position ? position.size * close : 0;
            // Guardar equity en cada paso
            equity.push({ time, value: balance + openValue });
        }

        return {
            trades,
            equity,
            finalBalance: equity.length > 0 ? equity[equity.length - 1].value : initialBalance
        };
    }

    _calculateATR(candles, index, period, N_prev) {
        const c = candles[index];
        const prev = candles[index - 1];
        if (!prev) return 0;

        const h = parseFloat(c.high);
        const l = parseFloat(c.low);
        const cp = parseFloat(prev.close);
        const tr = Math.max(h - l, Math.abs(h - cp), Math.abs(l - cp));

        if (N_prev === null) {
            let sum = 0;
            for (let i = index - period; i < index; i++) {
                const ci = candles[i];
                const pi = candles[i - 1];
                if (!pi) continue;
                const hi = parseFloat(ci.high);
                const li = parseFloat(ci.low);
                const cpi = parseFloat(pi.close);
                sum += Math.max(hi - li, Math.abs(hi - cpi), Math.abs(li - cpi));
            }
            return sum / period;
        }

        return ((period - 1) * N_prev + tr) / period;
    }

    _getMaxHighDB(candles, index, period) {
        let max = -Infinity;
        const start = Math.max(0, index - period);
        for (let i = start; i < index; i++) {
            max = Math.max(max, parseFloat(candles[i].high));
        }
        return max;
    }

    _getMinLowDB(candles, index, period) {
        let min = Infinity;
        const start = Math.max(0, index - period);
        for (let i = start; i < index; i++) {
            min = Math.min(min, parseFloat(candles[i].low));
        }
        return min;
    }

    async _loadHistoricalData(symbol, period, options = {}) {
        try {
            let startDate, endDate;
            if (options.startDate && options.endDate) {
                startDate = new Date(options.startDate);
                endDate = new Date(options.endDate);
            } else {
                endDate = new Date();
                startDate = this._calculateStartDate(endDate, period);
            }
            logger.info(`[Backtest] Loading data from ${startDate.toISOString()} to ${endDate.toISOString()} (${period})`);

            const result = await db.pool.query(`
                SELECT open_time, open, high, low, close, volume
                FROM candles
                WHERE symbol = $1 
                  AND open_time >= $2
                  AND open_time <= $3
                ORDER BY open_time ASC
            `, [symbol, startDate.getTime(), endDate.getTime()]);

            return result.rows;
        } catch (error) {
            logger.error(`[Backtest] Error cargando datos: ${error.message}`);
            return [];
        }
    }

    _calculateStartDate(endDate, period) {
        const start = new Date(endDate);
        switch (period) {
            case '1m': start.setMonth(start.getMonth() - 1); break;
            case '3m': start.setMonth(start.getMonth() - 3); break;
            case '6m': start.setMonth(start.getMonth() - 6); break;
            case '1y': start.setFullYear(start.getFullYear() - 1); break;
            case '2y': start.setFullYear(start.getFullYear() - 2); break;
            case '3y': start.setFullYear(start.getFullYear() - 3); break;
            case '4y': start.setFullYear(start.getFullYear() - 4); break;
            case '5y': start.setFullYear(start.getFullYear() - 5); break;
            default: start.setMonth(start.getMonth() - 1);
        }
        return start;
    }

    _simulateTrading(candles, params) {
        // Mantener lógica de fallback RSI/EMA por compatibilidad
        const trades = [];
        const equity = [];
        let balance = params.initialCapital || 1000;
        const initialBalance = balance;
        let position = null;
        const fee = 0.001;
        const warmupPeriod = 50;

        if (candles.length < warmupPeriod) return { trades: [], equity: [], finalBalance: balance };

        for (let i = warmupPeriod; i < candles.length; i++) {
            const close = parseFloat(candles[i].close);
            const time = parseInt(candles[i].open_time);
            const rsi = this._rsi(candles, i, 14);

            if (!position) {
                if (rsi < (params.rsi?.buy || 30)) {
                    const size = (balance * 0.99) / close;
                    position = { entryPrice: close, size, entryTime: time };
                    balance -= (size * close) * (1 + fee);
                    trades.push({ id: trades.length + 1, side: 'buy', price: close, time });
                }
            } else {
                const pnlPct = (close - position.entryPrice) / position.entryPrice;
                if (rsi > (params.rsi?.sell || 70) || pnlPct < -0.05) {
                    const revenue = (position.size * close) * (1 - fee);
                    const cost = position.size * position.entryPrice * (1 + fee);
                    balance += revenue;
                    trades.push({
                        id: trades.length + 1,
                        side: 'sell',
                        price: close,
                        time,
                        pnl: revenue - cost,
                        pnlPct: ((revenue - cost) / cost) * 100
                    });
                    position = null;
                }
            }
            equity.push({ time, value: balance + (position ? position.size * close : 0) });
        }
        return { trades, equity, finalBalance: balance };
    }

    _rsi(candles, index, period) {
        if (index < period) return 50;
        let gains = 0, losses = 0;
        for (let i = index - period; i < index; i++) {
            const diff = parseFloat(candles[i + 1].close) - parseFloat(candles[i].close);
            if (diff > 0) gains += diff; else losses += Math.abs(diff);
        }
        const rs = gains / (losses || 1);
        return 100 - (100 / (1 + rs));
    }

    _calculateMetrics(results) {
        const sellTrades = results.trades.filter(t => t.side === 'sell');
        const wins = sellTrades.filter(t => t.pnl > 0);
        const losses = sellTrades.filter(t => t.pnl <= 0);
        const grossProfit = wins.reduce((s, t) => s + t.pnl, 0);
        const grossLoss = Math.abs(losses.reduce((s, t) => s + t.pnl, 0));

        let maxPeak = -Infinity;
        let maxDD = 0;
        results.equity.forEach(p => {
            if (p.value > maxPeak) maxPeak = p.value;
            const dd = (maxPeak - p.value) / maxPeak;
            if (dd > maxDD) maxDD = dd;
        });

        return {
            roi: ((results.finalBalance - (results.initialBalance || 1000)) / (results.initialBalance || 1000)) * 100,
            winRate: sellTrades.length > 0 ? (wins.length / sellTrades.length) * 100 : 0,
            totalTrades: sellTrades.length,
            profitFactor: grossLoss === 0 ? (grossProfit > 0 ? 100 : 0) : grossProfit / grossLoss,
            maxDD: maxDD * 100
        };
    }

    async analyzeRegimes(symbol, period = '1y', options = {}) {
        return { status: 'mock', symbol, message: 'HMM Analyzer not implemented in refactor yet' };
    }
}

module.exports = new BacktestEngine();
