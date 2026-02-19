// src/core/regime-portfolio-manager.js
const logger = require('./logger');
const HMMEngine = require('./hmm-engine');

/**
 * RegimePortfolioManager v1.0
 * 
 * No tradea. Lee el mercado y decide CUÁNDO y CUÁNTO mover capital.
 * Lógica: Detectar régimen por par → Rankear oportunidades → Rotar capital.
 */
class RegimePortfolioManager {
    constructor(totalCapital = 1000) {
        this.totalCapital = totalCapital;
        this.regimes = new Map();      // symbol → último régimen detectado
        this.allocations = new Map();  // symbol → capital asignado actualmente
        this.hmms = new Map();         // symbol → HMMEngine propio por par
        this.lastRotation = 0;
        this.rotationCooldownMs = 4 * 60 * 60 * 1000; // Rotar máximo una vez por vela 4h

        // Reglas de comportamiento por régimen
        this.regimeRules = {
            ALCISTA: { action: 'HOLD', allocWeight: 1.0, description: 'Mantener, dejar correr' },
            ACUMULACIÓN: { action: 'BUY', allocWeight: 0.8, description: 'Comprar gradualmente' },
            LATERAL: { action: 'WAIT', allocWeight: 0.0, description: 'No hacer nada' },
            BAJISTA: { action: 'SELL', allocWeight: 0.0, description: 'Salir o no entrar' },
            VOLÁTIL: { action: 'REDUCE', allocWeight: 0.3, description: 'Reducir exposición' },
            DISTRIBUCIÓN: { action: 'SELL', allocWeight: 0.0, description: 'Vender parcialmente' },
            TRANSICIÓN: { action: 'WAIT', allocWeight: 0.2, description: 'Esperar confirmación' },
        };

        // Cuánto del capital total puede estar en riesgo simultáneamente
        this.maxExposure = 0.80;       // Máximo 80% del capital invertido
        this.maxPerPair = 0.30;        // Máximo 30% del capital en un solo par
        this.minConfidence = 0.60;     // Confianza mínima del HMM para actuar
    }

    /**
     * Registrar un par en el portfolio
     */
    registerPair(symbol) {
        if (!this.hmms.has(symbol)) {
            this.hmms.set(symbol, new HMMEngine(8));
            this.regimes.set(symbol, { label: 'TRANSICIÓN', probability: 0 });
            this.allocations.set(symbol, 0);
            logger.info(`[Portfolio] ✅ Par registrado: ${symbol}`);
        }
    }

    /**
     * Actualizar régimen de un par con nuevas velas
     * Llamar cada vez que llega una vela 4h cerrada
     */
    async updateRegime(symbol, candles) {
        const hmm = this.hmms.get(symbol);
        if (!hmm) return null;

        // Entrenar si tiene suficientes datos y no está entrenado
        if (!hmm.isTrained && candles.length >= 200) {
            await hmm.train(candles.slice(-500), 30);
        }

        if (!hmm.isTrained) return null;

        const prediction = hmm.predictState(candles, symbol);
        if (!prediction) return null;

        this.regimes.set(symbol, {
            label: prediction.label,
            probability: prediction.probability,
            volatility: prediction.volatility,
            state: prediction.state,
            updatedAt: Date.now()
        });

        return prediction;
    }

    /**
     * Motor de decisión principal
     * Devuelve lista de acciones a ejecutar
     */
    decide(currentPositions, currentBalanceUsdt) {
        const now = Date.now();
        const actions = [];

        // Cooldown: no rotar demasiado seguido
        if (now - this.lastRotation < this.rotationCooldownMs) {
            return [];
        }

        // Rankear todos los pares por atractivo
        const ranked = this._rankPairs();

        for (const { symbol, regime, score } of ranked) {
            const rule = this._getRule(regime.label);
            const hasPosition = currentPositions.has(symbol);
            const confidence = regime.probability;

            if (confidence < this.minConfidence) continue;

            // ACCIÓN: COMPRAR (régimen de acumulación o alcista sin posición)
            if (rule.action === 'BUY' && !hasPosition) {
                const allocation = this._calculateAllocation(symbol, score, currentBalanceUsdt);
                if (allocation >= 10) {
                    actions.push({
                        symbol,
                        action: 'BUY',
                        amount: allocation,
                        reason: `Régimen: ${regime.label} (${(confidence * 100).toFixed(0)}% confianza)`,
                        score
                    });
                }
            }

            // ACCIÓN: VENDER (régimen bajista o distribución con posición abierta)
            else if ((rule.action === 'SELL' || rule.action === 'REDUCE') && hasPosition) {
                const sellPct = rule.action === 'SELL' ? 1.0 : 0.50;
                actions.push({
                    symbol,
                    action: 'SELL',
                    sellPercent: sellPct,
                    reason: `Régimen: ${regime.label} (${(confidence * 100).toFixed(0)}% confianza)`,
                    score
                });
            }

            // ACCIÓN: ROTAR (mejor oportunidad detectada, salir de peor para entrar en mejor)
            else if (rule.action === 'BUY' && !hasPosition) {
                const worstPosition = this._findWorstCurrentPosition(currentPositions);
                if (worstPosition && score > (this.regimes.get(worstPosition)?.score || 0) + 0.3) {
                    actions.push({
                        symbol: worstPosition,
                        action: 'ROTATE_OUT',
                        reason: `Rotación: mejor oportunidad en ${symbol}`,
                        rotateInto: symbol
                    });
                }
            }
        }

        if (actions.length > 0) {
            this.lastRotation = now;
            logger.info(`[Portfolio] 🔄 ${actions.length} acciones generadas`);
        }

        return actions;
    }

    /**
     * Rankear pares por score de atractivo
     */
    _rankPairs() {
        const ranked = [];

        for (const [symbol, regime] of this.regimes.entries()) {
            const rule = this._getRule(regime.label);
            const score = rule.allocWeight * (regime.probability || 0);

            ranked.push({ symbol, regime, score, rule });
        }

        return ranked.sort((a, b) => b.score - a.score);
    }

    /**
     * Calcular cuánto capital asignar a un par
     */
    _calculateAllocation(symbol, score, availableUsdt) {
        const maxPerPair = this.totalCapital * this.maxPerPair;
        const currentExposure = Array.from(this.allocations.values()).reduce((a, b) => a + b, 0);
        const maxNewAllocation = (this.totalCapital * this.maxExposure) - currentExposure;

        if (maxNewAllocation <= 0) return 0;

        // Asignación proporcional al score
        const baseAllocation = Math.min(
            availableUsdt * 0.30,   // Máximo 30% del balance disponible por trade
            maxPerPair,
            maxNewAllocation
        ) * score;

        return Math.floor(baseAllocation * 100) / 100;
    }

    _getRule(label) {
        for (const [key, rule] of Object.entries(this.regimeRules)) {
            if (label && label.toUpperCase().includes(key)) return rule;
        }
        return this.regimeRules.TRANSICIÓN;
    }

    _findWorstCurrentPosition(currentPositions) {
        let worst = null;
        let worstScore = Infinity;

        for (const symbol of currentPositions.keys()) {
            const regime = this.regimes.get(symbol);
            if (!regime) continue;
            const rule = this._getRule(regime.label);
            const score = rule.allocWeight * (regime.probability || 0);
            if (score < worstScore) {
                worstScore = score;
                worst = symbol;
            }
        }

        return worst;
    }

    /**
     * Reporte del estado del portfolio
     */
    getReport() {
        const report = [];
        for (const [symbol, regime] of this.regimes.entries()) {
            const rule = this._getRule(regime.label);
            report.push({
                symbol,
                regime: regime.label,
                confidence: regime.probability,
                action: rule.action,
                description: rule.description,
                allocation: this.allocations.get(symbol) || 0
            });
        }
        return report.sort((a, b) => b.confidence - a.confidence);
    }

    updateCapital(newCapital) {
        this.totalCapital = newCapital;
    }

    updateAllocation(symbol, amount) {
        this.allocations.set(symbol, amount);
    }
}

module.exports = RegimePortfolioManager;
