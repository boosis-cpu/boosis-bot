
const backtestEngine = require('./backtest-engine');
const logger = require('./logger');

class Optimizer {
    /**
     * Run optimization for a symbol over a period
     * @param {string} symbol - Trading pair (e.g., 'BTCUSDT')
     * @param {string} period - Time period (e.g., '1m', '3m')
     * @param {object} baseParams - Current strategy parameters
     * @returns {object} Optimization results
     */
    async optimize(symbol, period = '1m', baseParams) {
        logger.info(`[Optimizer] Starting optimization for ${symbol} over ${period}`);

        // Define search space (simplistic grid search for now)
        // In a real scenario, these ranges could be dynamic or user-provided
        const variations = {
            rsiBuy: [20, 25, 30, 35],
            rsiSell: [65, 70, 75, 80],
            stopLoss: [0.01, 0.015, 0.02, 0.025, 0.03]
        };

        const tasks = [];
        const results = [];

        // Generate combinations
        for (const buy of variations.rsiBuy) {
            for (const sell of variations.rsiSell) {
                for (const sl of variations.stopLoss) {
                    if (buy >= sell) continue; // Invalid config

                    const params = {
                        ...baseParams,
                        rsi: { ...baseParams.rsi, buy: buy, sell: sell },
                        stopLoss: sl
                    };

                    tasks.push(params);
                }
            }
        }

        logger.info(`[Optimizer] Testing ${tasks.length} configurations...`);

        // Run backtests (in batches to avoid OOM or DB overload if too many)
        // For < 100 variations, parallel is okay-ish, but let's be safe with Promise.all
        // Note: backtestEngine loads data from DB. It might be better to load data ONCE
        // and pass it to simulateTrading, but backtestEngine.runBacktest loads it internally.
        // For MVP, we'll let it load. (Future optimization: Refactor backtestEngine to separate data loading)

        // LIMITATION: Loading DB data 100 times is bad. 
        // Optimization: We will modify backtestEngine to accept pre-loaded candles, 
        // or just accept that this might be slow.
        // For now, let's limit the combinations to a smaller set for the "Lab" demo (~20-30).

        // Let's pick a random subset avoiding full grid if it's too large, or just stick to small ranges.
        // The loops above generate 4 * 4 * 5 = 80 combinations. That's manageable if DB queries are fast or cached.
        // backtestEngine has a cache map, but it caches by key. If we change params, we probably miss cache 
        // unless we cache the DATA loading separately.

        // Batched execution to avoid DB overload
        const batchSize = 10;
        for (let i = 0; i < tasks.length; i += batchSize) {
            const batch = tasks.slice(i, i + batchSize);
            const promises = batch.map(async (params) => {
                try {
                    const res = await backtestEngine.runBacktest(symbol, params, period);
                    // Puntuación Inteligente: ROI * ProfitFactor / (1 + MaxDD)
                    const score = (res.metrics.roi * res.metrics.profitFactor) / (1 + (res.metrics.maxDD / 100));

                    return {
                        params,
                        metrics: res.metrics,
                        score: score
                    };
                } catch (e) {
                    logger.error(`[Optimizer] Config failed: ${e.message}`);
                    return null;
                }
            });

            const batchResults = await Promise.all(promises);
            results.push(...batchResults.filter(r => r !== null));
        }

        // Sort by Score (Balance entre Ganancia y Riesgo)
        results.sort((a, b) => b.score - a.score);

        if (results.length === 0) {
            logger.warn(`[Optimizer] No valid results found for ${symbol}`);
            return {
                symbol,
                period,
                bestConfig: { metrics: { roi: 0, winRate: 0, profitFactor: 0, totalTrades: 0 }, params: baseParams },
                originalConfig: { metrics: { roi: 0, winRate: 0 }, params: baseParams },
                allResults: []
            };
        }

        const bestResult = results[0];
        const originalResult = results.find(r =>
            r.params.rsi.buy === baseParams.rsi.buy &&
            r.params.rsi.sell === baseParams.rsi.sell &&
            r.params.stopLoss === baseParams.stopLoss
        ) || { params: baseParams, metrics: { roi: 0, winRate: 0 }, score: 0 };

        logger.info(`[Optimizer] Best Score: ${bestResult.score.toFixed(2)} | ROI: ${bestResult.metrics.roi}% vs Original Score: ${originalResult.score.toFixed(2)}`);

        // Generar Razonamiento (Para que el usuario sepa POR QUÉ es la mejor)
        let reasoning = "";
        if (bestResult.metrics.roi > originalResult.metrics.roi * 1.5) {
            reasoning = `Esta configuración aumentó la rentabilidad un ${((bestResult.metrics.roi / (originalResult.metrics.roi || 1)) * 100).toFixed(0)}% manteniéndose dentro de niveles de riesgo aceptables. `;
        }
        if (bestResult.metrics.maxDD < originalResult.metrics.maxDD) {
            reasoning += `Es más segura porque reduce el Drawdown (pérdida máxima) a un ${bestResult.metrics.maxDD}%. `;
        }
        if (bestResult.metrics.profitFactor > 1.5) {
            reasoning += `Tiene un factor de beneficio sólido de ${bestResult.metrics.profitFactor.toFixed(2)}, lo que significa que el bot 'gana mucho más de lo que pierde'.`;
        }

        return {
            symbol,
            period,
            bestConfig: bestResult,
            originalConfig: originalResult,
            reasoning: reasoning || "Optimización balanceada por ROI y Estabilidad.",
            allResults: results.slice(0, 50)
        };
    }
}

module.exports = new Optimizer();
