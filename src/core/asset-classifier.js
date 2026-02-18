/**
 * 🎯 ASSET CLASSIFIER - DETECCIÓN HÍBRIDA
 * 
 * Determina qué tipo de mercado estamos operando:
 * CRYPTO, FOREX, EQUITY, FUTURES
 * 
 * FASE 1: Lookup rápido por símbolo (5ms)
 * FASE 2: Análisis inteligente si desconocido (50ms)
 */

const logger = require('./logger');

class AssetClassifier {
    constructor() {
        /**
         * FASE 1: Tabla de símbolos conocidos (Lookup rápido)
         * Actualizar cuando agregues nuevos pares
         */
        this.knownAssets = {
            // ========== CRYPTO (Binance USDT) ==========
            'BTCUSDT': 'CRYPTO',
            'ETHUSDT': 'CRYPTO',
            'XRPUSDT': 'CRYPTO',
            'BNBUSDT': 'CRYPTO',
            'ADAUSDT': 'CRYPTO',
            'DOGEUSDT': 'CRYPTO',
            'LINKUSDT': 'CRYPTO',
            'MATICUSDT': 'CRYPTO',
            'SOLUSDT': 'CRYPTO',
            'AVAXUSDT': 'CRYPTO',
            'FTMUSDT': 'CRYPTO',
            'UNIUSDT': 'CRYPTO',
            'SUSHIUSDT': 'CRYPTO',
            'ATOMUSDT': 'CRYPTO',
            'NEARUSDT': 'CRYPTO',
            'OPUSDT': 'CRYPTO',
            'ARBITUSDT': 'CRYPTO',
            'LTCUSDT': 'CRYPTO',
            'BCHUSDT': 'CRYPTO',
            'ETCUSDT': 'CRYPTO',

            // ========== FOREX (FX Pairs) ==========
            'EURUSD': 'FOREX',
            'GBPUSD': 'FOREX',
            'USDJPY': 'FOREX',
            'USDCHF': 'FOREX',
            'AUDUSD': 'FOREX',
            'NZDUSD': 'FOREX',
            'USDCAD': 'FOREX',
            'EURGBP': 'FOREX',
            'EURJPY': 'FOREX',
            'GBPJPY': 'FOREX',
            'AUDJPY': 'FOREX',
            'NZDJPY': 'FOREX',
            'EURAUD': 'FOREX',
            'EURNZD': 'FOREX',
            'GBPAUD': 'FOREX',
            'GBPNZD': 'FOREX',
            'AUDNZD': 'FOREX',
            'AUDCAD': 'FOREX',
            'CADCHF': 'FOREX',
            'CHFJPY': 'FOREX',

            // ========== EQUITY (Stocks/ETFs) ==========
            'SPY': 'EQUITY',
            'QQQ': 'EQUITY',
            'IWM': 'EQUITY',
            'VTI': 'EQUITY',
            'VOO': 'EQUITY',
            'VEA': 'EQUITY',
            'VWO': 'EQUITY',
            'BND': 'EQUITY',
            'TLT': 'EQUITY',
            'GLD': 'EQUITY',
            'SLV': 'EQUITY',
            'GDX': 'EQUITY',
            'USO': 'EQUITY',
            'DBC': 'EQUITY',
            'XLE': 'EQUITY',
            'XLF': 'EQUITY',
            'XLK': 'EQUITY',
            'XLV': 'EQUITY',
            'XLY': 'EQUITY',
            'XLI': 'EQUITY',
            'AAPL': 'EQUITY',
            'MSFT': 'EQUITY',
            'GOOGL': 'EQUITY',
            'AMZN': 'EQUITY',
            'TSLA': 'EQUITY',
            'META': 'EQUITY',
            'NVDA': 'EQUITY',
            'JPM': 'EQUITY',
            'V': 'EQUITY',
            'WMT': 'EQUITY',

            // ========== FUTURES (Commodities/Indexes) ==========
            'CL': 'FUTURES',     // Crude Oil
            'NG': 'FUTURES',     // Natural Gas
            'ZB': 'FUTURES',     // 30-Year Bond
            'ZN': 'FUTURES',     // 10-Year Note
            'ZF': 'FUTURES',     // 5-Year Note
            'ZT': 'FUTURES',     // 2-Year Note
            'ZS': 'FUTURES',     // Soybeans
            'ZC': 'FUTURES',     // Corn
            'ZW': 'FUTURES',     // Wheat
            'ZL': 'FUTURES',     // Soybean Oil
            'ZM': 'FUTURES',     // Soybean Meal
            'GC': 'FUTURES',     // Gold
            'SI': 'FUTURES',     // Silver
            'HG': 'FUTURES',     // Copper
            'PL': 'FUTURES',     // Platinum
            'PA': 'FUTURES',     // Palladium
            'ES': 'FUTURES',     // E-mini S&P 500
            'NQ': 'FUTURES',     // E-mini NASDAQ
            'YM': 'FUTURES',     // E-mini Dow Jones
            'RTY': 'FUTURES',    // E-mini Russell 2000
            'MES': 'FUTURES',    // Micro E-mini S&P 500
            'MNQ': 'FUTURES',    // Micro E-mini NASDAQ
            'MYM': 'FUTURES',    // Micro E-mini Dow Jones
        };

        this.characteristics = {
            CRYPTO: {
                volatilityMin: 2.0,
                volatilityMax: 100,
                spreadMax: 0.005,
                liquidityMin: 50000000, // $50M
                traits: 'Alta volatilidad, spread variable, muy líquido'
            },
            FOREX: {
                volatilityMin: 0.5,
                volatilityMax: 2.0,
                spreadMax: 0.0005,
                liquidityMin: 1000000000, // $1B
                traits: 'Volatilidad media, spread bajo, ultra-líquido'
            },
            EQUITY: {
                volatilityMin: 0.5,
                volatilityMax: 1.5,
                spreadMax: 0.001,
                liquidityMin: 10000000, // $10M
                traits: 'Volatilidad baja, spread bajo, muy líquido'
            },
            FUTURES: {
                volatilityMin: 1.0,
                volatilityMax: 50,
                spreadMax: 0.01,
                liquidityMin: 100000000, // $100M
                traits: 'Volatilidad variable, patrones de tendencia claros'
            }
        };
    }

    /**
     * 🎯 MÉTODO PRINCIPAL: Detecta asset class
     * 
     * FASE 1: Lookup rápido (5ms)
     * FASE 2: Análisis si desconocido (50ms)
     */
    detect(symbol, candles = null) {
        logger.info(`[AssetClassifier] Detectando asset class para: ${symbol}`);

        // FASE 1: Lookup rápido por símbolo (5ms)
        if (this.knownAssets[symbol]) {
            const assetClass = this.knownAssets[symbol];
            logger.info(`[AssetClassifier] ✅ Encontrado en tabla: ${symbol} = ${assetClass} (5ms)`);
            return assetClass;
        }

        // FASE 2: Análisis inteligente si no conoce (50ms)
        if (candles && candles.length >= 100) {
            logger.info(`[AssetClassifier] ⏳ Símbolo desconocido, analizando características...`);
            return this.analyzeCharacteristics(symbol, candles);
        }

        // Fallback: UNKNOWN si no hay datos
        logger.warn(`[AssetClassifier] ⚠️  No se pudo determinar asset class para ${symbol}. Usando UNKNOWN.`);
        return 'UNKNOWN';
    }

    /**
     * FASE 2: Análisis inteligente por características
     * Volatilidad, spread, liquidez
     */
    analyzeCharacteristics(symbol, candles) {
        try {
            const vol = this.calculateVolatility(candles);
            const spread = this.calculateSpread(candles);
            const liquidity = this.calculateLiquidity(candles);

            logger.debug(`[AssetClassifier] ${symbol} | Vol: ${vol.toFixed(2)}% | Spread: ${spread.toFixed(6)} | Liquidity: $${(liquidity / 1000000).toFixed(1)}M`);

            // Lógica de clasificación por características
            // Prioridad: Volatilidad > Spread > Liquidez

            if (vol > 2.5 && liquidity > 50000000) {
                logger.info(`[AssetClassifier] ${symbol} → CRYPTO (volatilidad alta: ${vol.toFixed(2)}%)`);
                return 'CRYPTO';
            }

            if (spread < 0.0005 && liquidity > 1000000000) {
                logger.info(`[AssetClassifier] ${symbol} → FOREX (spread muy bajo: ${spread.toFixed(6)})`);
                return 'FOREX';
            }

            if (vol < 1.5 && spread < 0.001) {
                logger.info(`[AssetClassifier] ${symbol} → EQUITY (volatilidad y spread bajos)`);
                return 'EQUITY';
            }

            if (vol > 1.5 && this.hasHasClearTrends(candles)) {
                logger.info(`[AssetClassifier] ${symbol} → FUTURES (volatilidad con tendencias claras)`);
                return 'FUTURES';
            }

            // Default: Basado en volatilidad
            if (vol > 1.5) {
                logger.info(`[AssetClassifier] ${symbol} → FUTURES (volatilidad: ${vol.toFixed(2)}%)`);
                return 'FUTURES';
            }

            logger.info(`[AssetClassifier] ${symbol} → EQUITY (default)`);
            return 'EQUITY';
        } catch (error) {
            logger.error(`[AssetClassifier] Error en análisis: ${error.message}`);
            return 'UNKNOWN';
        }
    }

    /**
     * Calcula volatilidad histórica (%)
     * Desviación estándar de retornos logarítmicos
     */
    calculateVolatility(candles) {
        if (!candles || candles.length < 2) return 0;

        const returns = [];
        for (let i = 1; i < candles.length; i++) {
            const close1 = parseFloat(candles[i - 1][4]); // close
            const close2 = parseFloat(candles[i][4]);     // close
            if (close1 > 0) {
                const ret = Math.log(close2 / close1) * 100; // En porcentaje
                returns.push(ret);
            }
        }

        if (returns.length < 2) return 0;

        const mean = returns.reduce((a, b) => a + b) / returns.length;
        const variance = returns.reduce((a, b) => a + Math.pow(b - mean, 2)) / returns.length;
        const stdDev = Math.sqrt(variance);

        // Annualize si es 1m data (252 trading days × 1440 minutes)
        const annualizedVol = stdDev * Math.sqrt(252 * 1440);

        return annualizedVol;
    }

    /**
     * Calcula spread promedio (%)
     * (High - Low) / Close
     */
    calculateSpread(candles) {
        if (!candles || candles.length < 10) return 0;

        let totalSpread = 0;
        const sample = Math.min(100, candles.length); // Sample últimas 100 velas

        for (let i = candles.length - sample; i < candles.length; i++) {
            const high = parseFloat(candles[i][2]);
            const low = parseFloat(candles[i][3]);
            const close = parseFloat(candles[i][4]);

            if (close > 0) {
                totalSpread += (high - low) / close;
            }
        }

        return totalSpread / sample;
    }

    /**
     * Calcula liquidez aproximada
     * Volume (USD) = Volume × Close
     */
    calculateLiquidity(candles) {
        if (!candles || candles.length < 10) return 0;

        let totalLiquidity = 0;
        const sample = Math.min(100, candles.length);

        for (let i = candles.length - sample; i < candles.length; i++) {
            const volume = parseFloat(candles[i][7]);      // Volumen en USDT
            const close = parseFloat(candles[i][4]);

            if (volume && close) {
                totalLiquidity += volume; // Ya está en USDT si es USDT pair
            }
        }

        return totalLiquidity / sample; // Promedio diario
    }

    /**
     * Detecta si hay tendencias claras
     * (Usado para diferenciar FUTURES de EQUITY)
     */
    hasHasClearTrends(candles) {
        if (!candles || candles.length < 20) return false;

        const closes = candles.slice(-20).map(c => parseFloat(c[4]));

        // Calcular correlation con trend line
        let up = 0, down = 0;
        for (let i = 1; i < closes.length; i++) {
            if (closes[i] > closes[i - 1]) up++;
            else down++;
        }

        // Si hay tendencia clara (>60% en dirección)
        return (up / (up + down)) > 0.6 || (down / (up + down)) > 0.6;
    }

    /**
     * Obtiene parámetros recomendados por asset class
     */
    getRecommendedParams(assetClass) {
        const params = {
            CRYPTO: {
                timeframe: '1m',
                maxDailyTrades: 10,
                riskPerTrade: 0.01,    // 1%
                maxDrawdown: 0.20,     // 20%
                description: 'Crypto - Alta frecuencia, Pattern Scanner'
            },
            FOREX: {
                timeframe: '1h',
                maxDailyTrades: 5,
                riskPerTrade: 0.01,    // 1%
                maxDrawdown: 0.15,     // 15%
                description: 'Forex - Tendencias, Turtle Strategy'
            },
            EQUITY: {
                timeframe: '4h',
                maxDailyTrades: 3,
                riskPerTrade: 0.005,   // 0.5%
                maxDrawdown: 0.10,     // 10%
                description: 'Equity - Conservador, Turtle + Kelly'
            },
            FUTURES: {
                timeframe: '15m',
                maxDailyTrades: 8,
                riskPerTrade: 0.01,    // 1%
                maxDrawdown: 0.15,     // 15%
                description: 'Futures - Tendencias rápidas, Turtle'
            },
            UNKNOWN: {
                timeframe: '1h',
                maxDailyTrades: 2,
                riskPerTrade: 0.005,   // 0.5%
                maxDrawdown: 0.05,     // 5%
                description: 'Desconocido - Ultra conservador'
            }
        };

        return params[assetClass] || params['UNKNOWN'];
    }

    /**
     * Agrega nuevo símbolo a tabla conocida
     * (Para cuando discovers nuevos pares)
     */
    addKnownAsset(symbol, assetClass) {
        this.knownAssets[symbol] = assetClass;
        logger.info(`[AssetClassifier] ✅ Agregado: ${symbol} = ${assetClass}`);
    }

    /**
     * Reporte de detección
     */
    getReport(symbol, assetClass, candles = null) {
        const params = this.getRecommendedParams(assetClass);

        let report = {
            symbol: symbol,
            assetClass: assetClass,
            recommendedParams: params,
            characteristics: this.characteristics[assetClass] || {}
        };

        if (candles && candles.length >= 100) {
            report.volatility = this.calculateVolatility(candles).toFixed(2) + '%';
            report.spread = this.calculateSpread(candles).toFixed(6);
            report.liquidity = '$' + (this.calculateLiquidity(candles) / 1000000).toFixed(1) + 'M';
        }

        return report;
    }
}

module.exports = AssetClassifier;
