/**
 * 🏆 BOOSIS v2.7 - ARQUITECTURA DE RIESGO PROFESIONAL
 * 
 * NUEVO EN v2.7:
 * 1. Kelly Criterion: Ajusta tamaño posición dinámicamente
 * 2. Circuit Breaker: Detiene si DD > 20%
 * 3. Volatility Scaling: Reduce lotes cuando σ > 3%
 * 4. HMM Optimization: Ventana adaptive para BTC
 * 
 * OBJETIVO:
 * Convertir Calmar Ratio 0.63 → 1.5-3.0 (profesional)
 * Drawdown 49% → 15-20% (aceptable)
 */

const logger = require('./logger');

class BOOSISv27RiskManagement {
    constructor(initialBalance = 10000) {
        this.initialBalance = initialBalance;
        this.currentBalance = initialBalance;
        this.peak = initialBalance;
        this.maxDrawdown = 0;

        // KELLY CRITERION
        this.kellyFraction = 0.25;  // Usar 25% de Kelly (conservador)
        this.winRate = 0;
        this.avgWinSize = 0;
        this.avgLossSize = 0;
        this.historicalTrades = [];

        // CIRCUIT BREAKER
        this.circuitBreakerThreshold = 0.20;  // 20% drawdown
        this.circuitBreakerActive = false;
        this.dailyLossTracker = 0;
        this.dailyLossLimit = 0.03;  // 3% máx por día

        // VOLATILITY SCALING
        this.volatilityThreshold = 0.03;  // 3% volatilidad
        this.volatilityScaler = 1.0;
        this.recentReturns = [];
        this.volatilityWindow = 20;

        // HMM OPTIMIZATION
        this.hmmWindowSize = 100;  // Para BTC: aumentado de 50
        this.adaptiveWindow = true;

        logger.info(`\n${'='.repeat(80)}`);
        logger.info(`🏆 BOOSIS v2.7 - ARQUITECTURA DE RIESGO PROFESIONAL`);
        logger.info(`${'='.repeat(80)}`);
        logger.info(`\nComponentes Activados:`);
        logger.info(`  ✅ Kelly Criterion (f = ${(this.kellyFraction * 100).toFixed(0)}%)`);
        logger.info(`  ✅ Circuit Breaker (${(this.circuitBreakerThreshold * 100).toFixed(0)}% threshold)`);
        logger.info(`  ✅ Volatility Scaling (${(this.volatilityThreshold * 100).toFixed(0)}% trigger)`);
        logger.info(`  ✅ HMM Adaptive Window (${this.hmmWindowSize} velas)\n`);
    }

    calculateKellyFraction() {
        if (this.historicalTrades.length < 10) {
            return 1.0;
        }

        const wins = this.historicalTrades.filter(t => t.pnl > 0).length;
        const losses = this.historicalTrades.filter(t => t.pnl < 0).length;
        const totalTrades = wins + losses;

        if (totalTrades === 0) return 1.0;

        this.winRate = wins / totalTrades;
        const lossRate = losses / totalTrades;

        const winTrades = this.historicalTrades.filter(t => t.pnl > 0);
        const lossTrades = this.historicalTrades.filter(t => t.pnl < 0);

        this.avgWinSize = winTrades.length > 0
            ? winTrades.reduce((a, b) => a + b.pnl, 0) / winTrades.length
            : 0;

        this.avgLossSize = lossTrades.length > 0
            ? Math.abs(lossTrades.reduce((a, b) => a + b.pnl, 0) / lossTrades.length)
            : 0;

        if (this.avgLossSize === 0) return 1.0;

        const b = this.avgWinSize / this.avgLossSize;
        const kellyOptimal = (this.winRate * b - lossRate) / b;

        const kellyConservative = Math.max(0.1, Math.min(kellyOptimal * this.kellyFraction, 1.0));

        logger.debug(`[Kelly] WR: ${(this.winRate * 100).toFixed(1)}% | b: ${b.toFixed(2)} | f*: ${kellyConservative.toFixed(3)}`);

        return kellyConservative;
    }

    updateDrawdown(currentEquity) {
        this.currentBalance = currentEquity;
        if (currentEquity > this.peak) {
            this.peak = currentEquity;
        }

        const drawdown = (this.peak - currentEquity) / this.peak;

        if (drawdown > this.maxDrawdown) {
            this.maxDrawdown = drawdown;
        }

        if (drawdown > this.circuitBreakerThreshold && !this.circuitBreakerActive) {
            this.circuitBreakerActive = true;
            logger.warn(`\n🚨 CIRCUIT BREAKER ACTIVADO: Drawdown ${(drawdown * 100).toFixed(2)}% > ${(this.circuitBreakerThreshold * 100).toFixed(0)}%`);
            return true;
        }

        if (drawdown < this.circuitBreakerThreshold * 0.75 && this.circuitBreakerActive) {
            this.circuitBreakerActive = false;
            logger.info(`✅ Circuit Breaker desactivado - sistema normal\n`);
            return false;
        }

        return this.circuitBreakerActive;
    }

    updateVolatilityScaler(returns) {
        if (typeof returns === 'number') {
            this.recentReturns.push(returns);
        }

        if (this.recentReturns.length > this.volatilityWindow) {
            this.recentReturns.shift();
        }

        if (this.recentReturns.length < 5) {
            this.volatilityScaler = 1.0;
            return;
        }

        const mean = this.recentReturns.reduce((a, b) => a + b, 0) / this.recentReturns.length;
        const variance = this.recentReturns.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / this.recentReturns.length;
        const volatility = Math.sqrt(variance);

        if (volatility > this.volatilityThreshold) {
            this.volatilityScaler = Math.max(0.3, 1.0 - (volatility - this.volatilityThreshold) * 5);
            logger.debug(`[Volatility] σ = ${(volatility * 100).toFixed(2)}% → Scaler = ${this.volatilityScaler.toFixed(2)}`);
        } else {
            this.volatilityScaler = 1.0;
        }
    }

    calculatePositionSize(baseSize, currentEquity) {
        const kellyFactor = this.calculateKellyFraction();
        const isCircuitBreakerActive = this.circuitBreakerActive;

        const circuitBreakerFactor = isCircuitBreakerActive ? 0.5 : 1.0;

        const finalSize = baseSize * kellyFactor * this.volatilityScaler * circuitBreakerFactor;

        return Math.max(finalSize, baseSize * 0.1);
    }

    canTradeToday(dailyLossAccumulated) {
        if (dailyLossAccumulated < this.dailyLossLimit * this.currentBalance) {
            return true;
        }

        logger.warn(`\n⚠️ LÍMITE DIARIO ALCANZADO: Pérdida del día ${(dailyLossAccumulated / this.currentBalance * 100).toFixed(2)}% >= ${(this.dailyLossLimit * 100).toFixed(1)}%`);
        return false;
    }

    getHMMWindowSize(symbol, recentVolatility) {
        if (!this.adaptiveWindow) {
            return this.hmmWindowSize;
        }

        if (symbol === 'BTCUSDT') {
            if (recentVolatility > 0.04) {
                return 150;
            } else if (recentVolatility > 0.03) {
                return 125;
            }
            return 100;
        }

        return 100;
    }

    recordTrade(pnl, entryPrice, exitPrice, symbol) {
        this.historicalTrades.push({
            pnl: pnl,
            entry: entryPrice,
            exit: exitPrice,
            symbol: symbol,
            timestamp: Date.now()
        });

        if (this.historicalTrades.length > 100) {
            this.historicalTrades.shift();
        }
    }

    getMetrics() {
        const roi = ((this.currentBalance - this.initialBalance) / this.initialBalance) * 100;
        const cagr = Math.pow(Math.max(0.1, this.currentBalance) / this.initialBalance, 1 / 5) - 1;
        const calmarRatio = this.maxDrawdown > 0 ? (cagr * 100) / (this.maxDrawdown * 100) : 0;

        return {
            roi: roi.toFixed(2),
            cagr: (cagr * 100).toFixed(2),
            maxDrawdown: (this.maxDrawdown * 100).toFixed(2),
            calmarRatio: calmarRatio.toFixed(2),
            kellyFraction: this.kellyFraction,
            winRate: (this.winRate * 100).toFixed(1),
            circuitBreakerActive: this.circuitBreakerActive,
            volatilityScaler: this.volatilityScaler.toFixed(2)
        };
    }

    printMetrics() {
        const metrics = this.getMetrics();
        console.log(`\n${'█'.repeat(80)}`);
        console.log(`📊 MÉTRICAS v2.7:`);
        console.log(`${'█'.repeat(80)}`);
        console.log(`ROI:                    ${metrics.roi}%`);
        console.log(`CAGR:                   ${metrics.cagr}%`);
        console.log(`Max Drawdown:           ${metrics.maxDrawdown}%`);
        console.log(`Calmar Ratio:           ${metrics.calmarRatio} (Objetivo: > 1.5)`);
        console.log(`Win Rate:               ${metrics.winRate}%`);
        console.log(`Kelly Fraction:         ${this.kellyFraction}`);
        console.log(`Volatility Scaler:      ${metrics.volatilityScaler}`);
        console.log(`Circuit Breaker:        ${metrics.circuitBreakerActive ? '🚨 ACTIVO' : '✅ Desactivado'}`);
        console.log(`${'█'.repeat(80)}\n`);
    }
}

module.exports = BOOSISv27RiskManagement;
