const logger = require('./logger');
const db = require('./database');
const HMMEngine = require('./hmm-engine');
const PatternScanner = require('./pattern-scanner');

/**
 * TradingPairManager - v2.7 (Vigilancia Pura / Sniper Manual)
 * 
 * Responsabilidad: Gestionar datos y análisis técnico para un par.
 * - [VIGILANCIA] Solo recolección de velas e indicadores.
 * - [VIGILANCIA] HMM para detección de régimen de mercado.
 * - [VIGILANCIA] Scanner de Patrones para notificaciones.
 * - [SNIPER] Mantiene el estado de la posición para ejecución manual.
 */
class TradingPairManager {
    constructor(symbol, initialConfig = {}) {
        this.symbol = symbol;
        this.config = initialConfig;

        // Estado de Mercado
        this.candles = [];
        this.indicators = {};

        // CEREBRO HMM - 8 ESTADOS 
        this.hmm = new HMMEngine(8);
        this.marketRegime = { state: 0, probability: 0, name: '🔄 INICIALIZANDO' };
        this.shieldMode = false;
        this.lastHMMTrain = 0;

        // Estado de Trading (Solo Sniper)
        this.activePosition = null;
        this.lastSignal = null;

        // Métricas de Rendimiento
        this.metrics = {
            totalTrades: 0,
            winningTrades: 0,
            losingTrades: 0,
            grossProfit: 0,
            grossLoss: 0,
            netPnL: 0,
            maxDrawdown: 0,
            winRate: 0,
            pnlHistory: [{ time: Date.now(), pnl: 0 }]
        };

        this.initialized = false;
    }

    async init() {
        try {
            // 1. Cargar Velas Recientes (Warmup)
            const recentCandles = await db.getRecentCandles(this.symbol, 400);
            this.candles = recentCandles;

            // 2. Cargar Posición Activa
            const posQuery = await db.pool.query('SELECT * FROM active_position WHERE symbol = $1', [this.symbol]);
            if (posQuery.rows.length > 0) {
                const row = posQuery.rows[0];
                this.activePosition = {
                    symbol: row.symbol,
                    side: row.side,
                    entryPrice: parseFloat(row.entry_price),
                    amount: parseFloat(row.amount),
                    isPaper: row.is_paper,
                    timestamp: parseInt(row.timestamp),
                    units: parseInt(row.units || 1)
                };
            }

            // 3. Reconstruir métricas desde historial
            const tradesQuery = await db.pool.query('SELECT * FROM trades WHERE symbol = $1 ORDER BY timestamp ASC', [this.symbol]);
            if (tradesQuery.rows.length > 0) {
                this._reconstructMetricsFromTrades(tradesQuery.rows);
            }

            // 4. Configurar Pattern Scanner para vigilancia
            this.patternScanner = new PatternScanner();

            this.initialized = true;
            logger.info(`[${this.symbol}] Manager Vigilancia v2.7 Iniciado (${this.candles.length} velas)`);
        } catch (error) {
            logger.error(`[${this.symbol}] Initialization Error: ${error.message}`);
            throw error;
        }
    }

    _reconstructMetricsFromTrades(trades) {
        let currentPnl = 0;
        let buyStack = [];

        for (const t of trades) {
            this.metrics.totalTrades++;
            const price = parseFloat(t.price);
            const amount = parseFloat(t.amount);

            if (t.side === 'BUY') {
                buyStack.push({ price, amount });
            } else if (t.side === 'SELL' && buyStack.length > 0) {
                const avgEntry = buyStack.reduce((sum, b) => sum + b.price, 0) / buyStack.length;
                const pnlVal = (price - avgEntry) * amount;
                const pnlPerc = ((price - avgEntry) / avgEntry) * 100;

                if (pnlPerc > 0) {
                    this.metrics.winningTrades++;
                    this.metrics.grossProfit += pnlVal;
                } else {
                    this.metrics.losingTrades++;
                    this.metrics.grossLoss += Math.abs(pnlVal);
                }

                currentPnl += pnlVal;
                this.metrics.pnlHistory.push({ time: parseInt(t.timestamp), pnl: currentPnl });
                buyStack = [];
            }
        }

        this.metrics.netPnL = currentPnl;
        this.metrics.winRate = this.metrics.totalTrades > 0 ? (this.metrics.winningTrades / Math.ceil(this.metrics.totalTrades / 2) * 100) : 0;
    }

    async onCandleClosed(candle) {
        if (!this.initialized) return null;

        this.candles.push(candle);
        if (this.candles.length > 5000) this.candles.shift();

        // Guardar cada 1m para alimentar el panel Vision
        if (!this.config.isBacktest) {
            await db.saveCandle(this.symbol, candle);
        }

        // HMM Train (diario aprox)
        const candleTime = parseInt(candle[0]);
        if (candleTime - this.lastHMMTrain > 24 * 60 * 60 * 1000 && this.candles.length > 1000) {
            await this.hmm.train(this.candles.slice(-5000), 20);
            this.lastHMMTrain = candleTime;
        }

        // HMM Prediction
        if (this.hmm.isTrained && this.candles.length > 20) {
            const prediction = this.hmm.predictState(this.candles.slice(-20));
            if (prediction) {
                this.marketRegime = {
                    state: prediction.state,
                    probability: prediction.probability,
                    name: prediction.label,
                    sequence: prediction.sequence
                };
                const isDeadMarket = prediction.label.includes('LATERAL') || prediction.label.includes('AGOTAMIENTO');
                this.shieldMode = (isDeadMarket && prediction.probability > 0.60);
            }
        }

        return null; // NUNCA RETORNA SEÑAL - MODO VIGILANCIA
    }

    recordTrade(tradeResult) {
        this.metrics.totalTrades++;
        if (tradeResult.pnl > 0) {
            this.metrics.winningTrades++;
            this.metrics.grossProfit += tradeResult.pnlValue;
        } else if (tradeResult.pnl < 0) {
            this.metrics.losingTrades++;
            this.metrics.grossLoss += Math.abs(tradeResult.pnlValue);
        }

        this.metrics.netPnL += tradeResult.pnlValue || 0;
        this.metrics.winRate = (this.metrics.winningTrades / this.metrics.totalTrades) * 100;

        this.metrics.pnlHistory.push({
            time: tradeResult.timestamp || Date.now(),
            pnl: this.metrics.netPnL
        });

        if (tradeResult.action === 'OPEN') {
            this.activePosition = tradeResult.position;
        } else if (tradeResult.action === 'CLOSE') {
            this.activePosition = null;
        }
    }

    getStatus() {
        const lastCandle = this.candles[this.candles.length - 1];
        const currentPrice = lastCandle ? lastCandle[4] : 0;

        return {
            symbol: this.symbol,
            latestCandle: {
                close: currentPrice,
                time: lastCandle ? lastCandle[0] : Date.now()
            },
            activePosition: this.activePosition,
            metrics: this.metrics,
            marketRegime: this.marketRegime,
            shieldMode: this.shieldMode,
            status: this.initialized ? 'ACTIVE' : 'INITIALIZING',
            priceHistory: this.candles.slice(-30).map(c => ({ time: c[0], price: c[4] }))
        };
    }
}

module.exports = TradingPairManager;
