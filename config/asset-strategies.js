/**
 * 🎛️ ASSET STRATEGIES CONFIGURATION
 * 
 * Define qué estrategias usar, parámetros y features
 * para cada tipo de mercado (CRYPTO, FOREX, EQUITY, FUTURES)
 */

const assetStrategies = {
    /**
     * ═══════════════════════════════════════════════════════════
     * CRYPTO: Pattern Scanner + HMM (High Frequency)
     * ═══════════════════════════════════════════════════════════
     */
    CRYPTO: {
        enabled: true,
        description: 'Cryptocurrency - High frequency with Pattern Recognition',

        // Estrategias activas
        strategies: ['PATTERN_SCANNER', 'HMM', 'SHIELD_MODE'],
        primaryStrategy: 'PATTERN_SCANNER',

        // Timeframe
        timeframe: '1m',
        candleSize: 1,  // 1 minuto

        // Regime Selection (v2.7)
        regimeDriven: true,
        hmmStates: 8,

        // Pattern Scanner (Activado)
        patternEnabled: true,
        patterns: ['HEAD_AND_SHOULDERS', 'TRIANGLES', 'DOUBLE_TOP_BOTTOM', 'WEDGES'],
        minPatternProbability: 0.60,

        // HMM Configuration
        hmmStates: 8,
        hmmUpdateFrequency: '60m',  // Entrenar cada 60 minutos
        hmmMinConfidence: 0.70,

        // Shield Mode
        shieldModeEnabled: true,
        shieldBlockLateral: true,
        shieldBlockVolatility: true,

        // Kalman Filter
        kalmanEnabled: false,  // Agregar en v2.7

        // Risk Management
        riskPerTrade: 0.01,            // 1% del capital
        maxDailyTrades: 10,
        maxDrawdown: 0.20,             // 20%
        maxLeverage: 5,
        stopLoss2N: true,
        pyramidingEnabled: true,
        maxPyramidUnits: 4,

        // Comisiones
        commissionPerTrade: 0.001,     // 0.1% (Binance)
        slippage: 0.0005,              // 0.05%

        // Filtros
        minVolume: 10000000,           // $10M USD volume
        minLiquidity: 50000000,        // $50M average

        // Gestión de posición
        factorN: 'ATR_20h',           // ATR en escala 4h
        unitSizeCalc: 'DYNAMIC',      // Dinámico basado en volatilidad

        // Logs
        verbose: true,
        logLevel: 'INFO'
    },

    /**
     * ═══════════════════════════════════════════════════════════
     * FOREX: Turtle Strategy + HMM (Medium Frequency)
     * ═══════════════════════════════════════════════════════════
     */
    FOREX: {
        enabled: true,
        description: 'Foreign Exchange - Turtle Strategy with Trend Following',

        // Estrategias activas
        strategies: ['TURTLE', 'HMM', 'SHIELD_MODE', 'KELLY'],
        primaryStrategy: 'TURTLE',

        // Timeframe
        timeframe: '1h',
        candleSize: 60,  // 1 hora

        // Regime Selection (v2.7)
        regimeDriven: true,
        hmmStates: 8,

        // Pattern Scanner (Desactivado)
        patternEnabled: false,

        // HMM Configuration
        hmmStates: 8,
        hmmUpdateFrequency: '4h',
        hmmMinConfidence: 0.65,

        // Shield Mode
        shieldModeEnabled: true,
        shieldBlockLateral: true,
        shieldBlockVolatility: false,  // Menos bloqueador que crypto

        // Kelly Criterion (Nuevo en v2.7)
        kellyEnabled: false,  // Agregar en v2.7
        kellyFraction: 0.25,  // Fractional Kelly (25% de f*)

        // Risk Management
        riskPerTrade: 0.01,            // 1% del capital
        maxDailyTrades: 5,
        maxDrawdown: 0.15,             // 15%
        maxLeverage: 5,
        stopLoss2N: true,
        pyramidingEnabled: true,
        maxPyramidUnits: 4,

        // Comisiones
        commissionPerTrade: 0.0002,    // 0.02% (Típico Forex)
        slippage: 0.0001,              // 0.01%

        // Filtros
        minSpread: 0.00005,
        maxSpread: 0.0005,
        minVolume: 1000000000,         // $1B USD volume

        // Gestión de posición
        factorN: 'ATR_20',
        unitSizeCalc: 'DYNAMIC',

        // Logs
        verbose: true,
        logLevel: 'INFO'
    },

    /**
     * ═══════════════════════════════════════════════════════════
     * EQUITY: Turtle + Montecarlo (Low Frequency, Ultra Conservative)
     * ═══════════════════════════════════════════════════════════
     */
    EQUITY: {
        enabled: true,
        description: 'Stocks/ETFs - Conservative Turtle with Montecarlo Risk Analysis',

        // Estrategias activas
        strategies: ['TURTLE', 'HMM', 'MONTECARLO', 'KELLY'],
        primaryStrategy: 'TURTLE',

        // Timeframe
        timeframe: '4h',
        candleSize: 240,  // 4 horas

        // Regime Selection (v2.7)
        regimeDriven: true,
        hmmStates: 8,

        // Pattern Scanner (Desactivado)
        patternEnabled: false,

        // HMM Configuration
        hmmStates: 8,
        hmmUpdateFrequency: '1d',
        hmmMinConfidence: 0.70,

        // Shield Mode
        shieldModeEnabled: true,
        shieldBlockLateral: true,
        shieldBlockVolatility: true,

        // Montecarlo (Nuevo en v2.8)
        montecarloEnabled: false,  // Agregar en v2.8
        montecarloSimulations: 10000,
        montecarloConfidenceLevel: 0.95,

        // Kelly Criterion
        kellyEnabled: false,  // Agregar en v2.7
        kellyFraction: 0.10,  // Ultra conservador: 10% de f*

        // Risk Management
        riskPerTrade: 0.005,           // 0.5% del capital (Ultra conservador)
        maxDailyTrades: 3,
        maxDrawdown: 0.10,             // 10%
        maxLeverage: 2,                // Muy bajo apalancamiento
        stopLoss2N: true,
        pyramidingEnabled: true,
        maxPyramidUnits: 2,            // Max 2 units (vs 4 en crypto)

        // Comisiones
        commissionPerTrade: 0.0005,    // 0.05% (Típico brokers)
        slippage: 0.0002,              // 0.02%

        // Filtros
        minVolume: 10000000,           // $10M average
        minMarketCap: 1000000000,      // $1B market cap

        // Gestión de posición
        factorN: 'ATR_20_4h',
        unitSizeCalc: 'CONSERVATIVE',

        // Logs
        verbose: true,
        logLevel: 'INFO'
    },

    /**
     * ═══════════════════════════════════════════════════════════
     * FUTURES: Turtle Strategy (Medium Frequency, Volatile)
     * ═══════════════════════════════════════════════════════════
     */
    FUTURES: {
        enabled: true,
        description: 'Commodities/Index Futures - Turtle Strategy with Trend Following',

        // Estrategias activas
        strategies: ['TURTLE', 'HMM', 'SHIELD_MODE', 'KELLY'],
        primaryStrategy: 'TURTLE',

        // Timeframe
        timeframe: '15m',
        candleSize: 15,  // 15 minutos

        // Regime Selection (v2.7)
        regimeDriven: true,
        hmmStates: 8,

        // Pattern Scanner (Desactivado)
        patternEnabled: false,

        // HMM Configuration
        hmmStates: 8,
        hmmUpdateFrequency: '1h',
        hmmMinConfidence: 0.65,

        // Shield Mode
        shieldModeEnabled: true,
        shieldBlockLateral: true,
        shieldBlockVolatility: false,  // Menos restrictivo que equity

        // Kelly Criterion
        kellyEnabled: false,  // Agregar en v2.7
        kellyFraction: 0.20,  // 20% de f*

        // Risk Management
        riskPerTrade: 0.01,            // 1% del capital
        maxDailyTrades: 8,
        maxDrawdown: 0.15,             // 15%
        maxLeverage: 5,
        stopLoss2N: true,
        pyramidingEnabled: true,
        maxPyramidUnits: 4,

        // Comisiones
        commissionPerTrade: 0.0003,    // 0.03% (Típico futures)
        slippage: 0.0002,              // 0.02%

        // Filtros
        minVolume: 100000000,          // $100M USD volume

        // Gestión de posición
        factorN: 'ATR_20_15m',
        unitSizeCalc: 'DYNAMIC',

        // Logs
        verbose: true,
        logLevel: 'INFO'
    },

    /**
     * ═══════════════════════════════════════════════════════════
     * UNKNOWN: Ultra Conservative Fallback
     * ═══════════════════════════════════════════════════════════
     */
    UNKNOWN: {
        enabled: true,
        description: 'Unknown Asset - Ultra Conservative Fallback',

        strategies: ['HMM', 'SHIELD_MODE'],
        primaryStrategy: 'HMM',

        timeframe: '1h',

        turtleEnabled: false,
        patternEnabled: false,

        hmmStates: 3,  // Estados simples
        hmmUpdateFrequency: '4h',
        hmmMinConfidence: 0.80,

        shieldModeEnabled: true,
        shieldBlockLateral: true,
        shieldBlockVolatility: true,

        riskPerTrade: 0.005,           // 0.5%
        maxDailyTrades: 2,
        maxDrawdown: 0.05,             // 5%
        maxLeverage: 2,
        stopLoss2N: true,
        pyramidingEnabled: false,

        commissionPerTrade: 0.001,
        slippage: 0.0005,

        verbose: false,
        logLevel: 'WARN'
    }
};

/**
 * FUNCIONES HELPER
 */

/**
 * Obtiene configuración de asset class
 */
function getStrategyConfig(assetClass) {
    return assetStrategies[assetClass] || assetStrategies['UNKNOWN'];
}

/**
 * Valida si asset class está habilitado
 */
function isAssetClassEnabled(assetClass) {
    return assetStrategies[assetClass]?.enabled === true;
}

/**
 * Obtiene timeframe recomendado
 */
function getRecommendedTimeframe(assetClass) {
    return assetStrategies[assetClass]?.timeframe || '1h';
}

/**
 * Obtiene máximo drawdown permitido
 */
function getMaxDrawdown(assetClass) {
    return assetStrategies[assetClass]?.maxDrawdown || 0.05;
}

/**
 * Obtiene riesgo por trade
 */
function getRiskPerTrade(assetClass) {
    return assetStrategies[assetClass]?.riskPerTrade || 0.005;
}

module.exports = {
    assetStrategies,
    getStrategyConfig,
    isAssetClassEnabled,
    getRecommendedTimeframe,
    getMaxDrawdown,
    getRiskPerTrade
};
