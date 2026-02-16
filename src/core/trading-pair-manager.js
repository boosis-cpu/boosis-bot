const logger = require('./logger');
const db = require('./database');

/**
 * TradingPairManager
 * 
 * Responsabilidad: Gestionar el ciclo de vida completo de un par de trading individual.
 * - Mantiene su propio estado (velas, indicadores, posición).
 * - Ejecuta su propia instancia de estrategia.
 * - Calcula sus propias métricas de rendimiento en tiempo real.
 */
class TradingPairManager {
    constructor(symbol, strategy, initialConfig = {}) {
        this.symbol = symbol;
        this.strategy = strategy;
        this.config = initialConfig;

        // Estado de Mercado
        this.candles = [];
        this.indicators = {};

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
            winRate: 0
        };

        this.initialized = false;
    }

    async init() {
        // Cargar estado inicial desde DB si existe (posición abierta, historial reciente)
        try {
            // 1. Cargar Velas Recientes (Warmup)
            const recentCandles = await db.getRecentCandles(this.symbol, 200); // 200 velas para indicadores
            // Convertir formato DB a formato interno si es necesario (array vs obj)
            // Asumiendo formato array [time, open, high, low, close, vol]
            this.candles = recentCandles.map(c => [
                parseInt(c.open_time),
                parseFloat(c.open),
                parseFloat(c.high),
                parseFloat(c.low),
                parseFloat(c.close),
                parseFloat(c.volume),
                parseInt(c.close_time)
            ]);

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
                    timestamp: parseInt(row.timestamp)
                };
            }

            // 3. Cargar Métricas Históricas (Opcional, por ahora iniciamos en 0 para sesión)
            // TODO: Implementar persistencia de métricas de sesión

            this.initialized = true;
            logger.info(`[${this.symbol}] Pair Manager Initialized (${this.candles.length} candles, Position: ${!!this.activePosition})`);
        } catch (error) {
            logger.error(`[${this.symbol}] Initialization Error: ${error.message}`);
            throw error;
        }
    }

    /**
     * Procesa una nueva vela cerrada.
     * @param {Array} candle - [time, o, h, l, c, v, T]
     * @returns {Object|null} Signal emitida por la estrategia o null
     */
    async onCandleClosed(candle) {
        if (!this.initialized) return null;

        // 1. Actualizar Datos
        this.candles.push(candle);
        if (this.candles.length > 500) this.candles.shift(); // Mantener buffer manejable

        // 2. Persistencia
        await db.saveCandle(this.symbol, candle);

        // 3. Ejecutar Estrategia
        const signal = this.strategy.onCandle(candle, this.candles, !!this.activePosition, this.activePosition?.entryPrice);

        if (signal) {
            this.lastSignal = signal;
            logger.info(`[${this.symbol}] SIGNAL: ${signal.action} @ ${signal.price} (${signal.reason})`);
        }

        return signal;
    }

    /**
     * Registra un trade ejecutado y actualiza métricas locales.
     * @param {Object} tradeResult 
     */
    recordTrade(tradeResult) {
        this.metrics.totalTrades++;

        if (tradeResult.pnl > 0) {
            this.metrics.winningTrades++;
            this.metrics.grossProfit += tradeResult.pnlValue;
        } else {
            this.metrics.losingTrades++;
            this.metrics.grossLoss += Math.abs(tradeResult.pnlValue);
        }

        this.metrics.netPnL += tradeResult.pnlValue;
        this.metrics.winRate = (this.metrics.winningTrades / this.metrics.totalTrades) * 100;

        // Actualizar posición interna
        if (tradeResult.action === 'OPEN') {
            this.activePosition = tradeResult.position;
        } else if (tradeResult.action === 'CLOSE') {
            this.activePosition = null;
        }
    }

    getStatus() {
        const lastCandle = this.candles[this.candles.length - 1];
        const currentPrice = lastCandle ? lastCandle[4] : 0;

        // Calcular cambio 24h aproximado (usando vela hace 288 periodos de 5m = 24h)
        // O simplemente cambio desde inicio de sesión si no hay suficientes datos
        let change24h = 0;
        if (this.candles.length > 0) {
            const openPrice = this.candles[0][4]; // Precio más antiguo en memoria
            change24h = ((currentPrice - openPrice) / openPrice) * 100;
        }

        return {
            symbol: this.symbol,
            strategy: this.strategy.name,
            latestCandle: {
                close: currentPrice,
                time: lastCandle ? lastCandle[0] : Date.now()
            },
            change: change24h,
            activePosition: this.activePosition,
            metrics: this.metrics,
            status: this.initialized ? 'ACTIVE' : 'INITIALIZING'
        };
    }
}

module.exports = TradingPairManager;
