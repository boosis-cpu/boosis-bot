const logger = require('./logger');
const db = require('./database');
const HMMEngine = require('./hmm-engine');
const AssetClassifier = require('./asset-classifier');
const PatternScanner = require('./pattern-scanner');
const { getStrategyConfig } = require('../../config/asset-strategies');

/**
 * TradingPairManager - v2.6 (Medallion Professional)
 * 
 * Responsabilidad: Gestionar el ciclo de vida completo de un par de trading.
 * - [OPTIMIZADO] 8 Estados HMM para detección de régimen James Ax.
 * - [OPTIMIZADO] Balance dinámico para Position Sizing de Richard Dennis.
 * - [OPTIMIZADO] Soporte para Piramidación (Acumulación de Unidades).
 * - [FIX] Corrección de crash en getStatus().
 */
class TradingPairManager {
    constructor(symbol, strategy, initialConfig = {}) {
        this.symbol = symbol;
        this.primaryStrategy = strategy;

        // 🔹 ASSET CLASSIFIER (v2.6 Hybrid Architecture)
        this.classifier = new AssetClassifier();
        this.assetClass = 'UNKNOWN';
        this.strategyConfig = null;

        this.config = initialConfig;

        // Estado de Mercado
        this.candles = [];
        this.indicators = {};

        // CEREBRO HMM - UPGRADE 8 ESTADOS (James Ax Architecture)
        this.hmm = new HMMEngine(8);
        this.marketRegime = { state: 0, probability: 0, name: '🔄 INICIALIZANDO' };
        this.shieldMode = false;
        this.lastHMMTrain = 0;

        // Estado de Trading
        this.activePosition = null;
        this.lastSignal = null;

        // Métricas de Rendimiento (Sesión Local)
        this.metrics = {
            totalTrades: 0,
            winningTrades: 0,
            losingTrades: 0,
            grossProfit: 0,
            grossLoss: 0,
            netPnL: 0,
            maxDrawdown: 0,
            winRate: 0,
            pnlHistory: [{ time: Date.now(), pnl: 0 }] // Para Sparklines
        };

        this.initialized = false;
    }

    async init() {
        try {
            // 0. Detectar Asset Class (NUEVO)
            await this._detectAssetClass();

            // 0.1 Seleccionar Estrategia según Asset Class
            this._configureStrategy();

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

            // 3. PERSISTENCIA DE MÉTRICAS: Cargar historial desde DB
            const tradesQuery = await db.pool.query('SELECT * FROM trades WHERE symbol = $1 ORDER BY timestamp ASC', [this.symbol]);
            if (tradesQuery.rows.length > 0) {
                this._reconstructMetricsFromTrades(tradesQuery.rows);
            }

            this.initialized = true;
            logger.info(`[${this.symbol}] Pair Manager v2.6 Initialized (${this.candles.length} candles, History: ${tradesQuery.rows.length} trades)`);
        } catch (error) {
            logger.error(`[${this.symbol}] Initialization Error: ${error.message}`);
            throw error;
        }
    }

    /**
     * Reconstruye las métricas del soldado basándose en el historial de trades guardado.
     */
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
                // Cálculo simplificado de PnL para la métrica histórica
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
                buyStack = []; // Reset para el siguiente ciclo
            }
        }

        this.metrics.netPnL = currentPnl;
        this.metrics.winRate = this.metrics.totalTrades > 0 ? (this.metrics.winningTrades / Math.ceil(this.metrics.totalTrades / 2) * 100) : 0;
        if (this.metrics.pnlHistory.length > 50) this.metrics.pnlHistory = this.metrics.pnlHistory.slice(-50);
    }

    /**
     * Procesa una nueva vela cerrada.
     */
    async onCandleClosed(candle, currentCapital = null) {
        if (!this.initialized) return null;

        // [ASSET FILTER] Validar si la estrategia permite operar este asset class
        if (this.strategyConfig && !this.strategyConfig.enabled) {
            return null;
        }

        this.candles.push(candle);
        if (this.candles.length > 5000) this.candles.shift();

        // Interpretamos capital: si viene por argumento (backtest) lo usamos, si no lo buscamos
        const capital = currentCapital || 10000;


        // [OPTIMIZADO] No guardar en DB durante backtest
        if (!this.config.isBacktest) {
            await db.saveCandle(this.symbol, candle);
        }

        // 3. ACTUALIZAR CEREBRO HMM (Cada 1440 velas = ~1 día)
        const candleTime = parseInt(candle[0]);
        // En backtest usamos el tiempo de la vela, en live podemos seguir usando Date.now() o candleTime
        if (candleTime - this.lastHMMTrain > 24 * 60 * 60 * 1000 && this.candles.length > 1000) {
            await this.hmm.train(this.candles.slice(-5000), 20);
            this.lastHMMTrain = candleTime;
        }

        // 4. PREDECIR RÉGIMEN ACTUAL
        let currentHMMState = null;
        if (this.hmm.isTrained && this.candles.length > 20) {
            const prediction = this.hmm.predictState(this.candles.slice(-20));
            if (prediction) {
                currentHMMState = prediction;
                this.marketRegime = {
                    state: prediction.state,
                    probability: prediction.probability,
                    name: prediction.label,
                    sequence: prediction.sequence
                };

                // MODO ESCUDO (Bloqueo de entradas en mercados ruidosos)
                const isDeadMarket = prediction.label.includes('LATERAL') || prediction.label.includes('AGOTAMIENTO');
                this.shieldMode = (isDeadMarket && prediction.probability > 0.60);
            }
        }

        return null;
    }

    /**
     * Registra un trade ejecutado y actualiza métricas locales.
     */
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

        // Historial para gráficas
        this.metrics.pnlHistory.push({
            time: tradeResult.timestamp || Date.now(),
            pnl: this.metrics.netPnL
        });
        if (this.metrics.pnlHistory.length > 50) this.metrics.pnlHistory.shift();

        // Actualizar posición interna
        if (tradeResult.action === 'OPEN') {
            this.activePosition = {
                ...tradeResult.position,
                strategy: tradeResult.strategy // Guardar qué estrategia abrió la posición
            };
        } else if (tradeResult.action === 'ADD') {

            // Piramidación: Incrementar cantidad y unidades
            if (this.activePosition) {
                this.activePosition.amount += tradeResult.amount;
                this.activePosition.units = (this.activePosition.units || 1) + 1;
                // Opcional: Promediar precio de entrada o mantener el primero según estratega
            }
        } else if (tradeResult.action === 'CLOSE') {
            this.activePosition = null;
        }
    }

    getStatus() {
        const lastCandle = this.candles[this.candles.length - 1];
        const currentPrice = lastCandle ? lastCandle[4] : 0;

        // Calcular cambio 24h aproximado
        let change24h = 0;
        if (this.candles.length > 1440) {
            const openPrice = this.candles[this.candles.length - 1440][4];
            change24h = ((currentPrice - openPrice) / openPrice) * 100;
        } else if (this.candles.length > 0) {
            const openPrice = this.candles[0][4];
            change24h = ((currentPrice - openPrice) / openPrice) * 100;
        }

        return {
            symbol: this.symbol,
            strategy: this.primaryStrategy ? this.primaryStrategy.name : 'Unknown', // [FIX] name undefined
            latestCandle: {
                close: currentPrice,
                time: lastCandle ? lastCandle[0] : Date.now()
            },
            change: change24h,
            activePosition: this.activePosition,
            metrics: this.metrics,
            marketRegime: this.marketRegime,
            shieldMode: this.shieldMode,
            status: this.initialized ? 'ACTIVE' : 'INITIALIZING',
            priceHistory: this.candles.slice(-30).map(c => ({ time: c[0], price: c[4] }))
        };
    }
    /**
     * DETECCIÓN DE ASSET CLASS Y CONFIGURACIÓN DINÁMICA
     */
    async _detectAssetClass() {
        // Cargar velas suficientes para análisis si no hay
        let analysisCandles = this.candles;
        if (analysisCandles.length < 100) {
            analysisCandles = await db.getRecentCandles(this.symbol, 200);
        }

        this.assetClass = this.classifier.detect(this.symbol, analysisCandles);
        const report = this.classifier.getReport(this.symbol, this.assetClass, analysisCandles);

        logger.info(`[${this.symbol}] 🧬 ASSET CLASS DETECTADO: ${this.assetClass}`);
        logger.debug(`[${this.symbol}] Reporte Asset: ${JSON.stringify(report)}`);
    }

    _configureStrategy() {
        this.strategyConfig = getStrategyConfig(this.assetClass);

        logger.info(`[${this.symbol}] ⚙️  Configurando estrategia para ${this.assetClass}...`);

        // Configurar HMM
        if (this.strategyConfig.strategies.includes('HMM')) {
            this.hmm = new HMMEngine(this.strategyConfig.hmmStates || 8);
        }

        // Configurar Pattern Scanner (v2.7)
        if (this.strategyConfig.patternEnabled) {
            this.patternScanner = new PatternScanner();
            logger.info(`[${this.symbol}] ✅ Pattern Scanner ACTIVADO (v2.7)`);
        } else {
            this.patternScanner = null;
        }
    }
}

module.exports = TradingPairManager;
