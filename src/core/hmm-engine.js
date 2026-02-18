
// src/core/hmm-engine.js
const logger = require('./logger');
const BOOSISv27RiskManager = require('./boosis_v27_risk_management');

/**
 * HMM Engine para Boosis Quant Bot - "MEDALLION UPGRADE"
 * Versión v2.6.5: Optimizada con Buffers Reutilizables (Zero-Allocation)
 */
class HMMEngine {
    constructor(nStates = 8) {
        this.N = nStates;
        this.D = 2; // [Price, Volume]
        this._initBuffers();
        this.riskManager = new BOOSISv27RiskManager(10000);
        this.symbol = 'BTCUSDT';  // Default, se actualiza en predictState
        this.adaptiveWindowEnabled = true;
    }

    _initBuffers() {
        this.pi = new Float64Array(this.N).fill(-Math.log(this.N));
        this.A = Array.from({ length: this.N }, () => new Float64Array(this.N).fill(-Math.log(this.N)));
        this.means = Array.from({ length: this.N }, () => new Float64Array(this.D));
        this.vars = Array.from({ length: this.N }, () => new Float64Array(this.D).fill(1e-4));
        this.featureWeights = new Float64Array(this.D).fill(1.0);
        this.stateLabels = [];
        this.isTrained = false;

        // Buffers de trabajo para evitar GC
        this._termBuffer = new Float64Array(this.N);
    }

    initialize(data) {
        const obs = this._calculateObservations(data);
        for (let i = 0; i < this.N; i++) {
            this.pi[i] = Math.log(1 / this.N);
            for (let j = 0; j < this.N; j++) {
                this.A[i][j] = Math.log(i === j ? 0.95 : 0.05 / (this.N - 1));
            }

            for (let d = 0; d < this.D; d++) {
                const dimData = obs.map(o => o[d]);
                const globalMean = dimData.reduce((a, b) => a + b, 0) / dimData.length;
                const globalVar = Math.max(dimData.reduce((a, b) => a + Math.pow(b - globalMean, 2), 0) / dimData.length, 1e-8);
                this.means[i][d] = globalMean + (Math.random() - 0.5) * Math.sqrt(globalVar);
                this.vars[i][d] = globalVar * (0.5 + Math.random());
            }
        }
    }

    async train(data, maxIter = 50) {
        const obs = this._calculateObservations(data);
        const T = obs.length;
        if (T < 100) return;

        if (!this.isTrained) this.initialize(data);
        let prevLL = -Infinity;

        for (let iter = 0; iter < maxIter; iter++) {
            const alpha = this._forwardLog(obs);
            const beta = this._backwardLog(obs);
            const logLL = this._logSumExp(alpha[T - 1]);

            if (isNaN(logLL) || logLL === -Infinity) break;

            const gamma = this._calculateGammaLog(alpha, beta, logLL);
            const xi = this._calculateXiLog(alpha, beta, obs, logLL);

            this._updateParametersLog(obs, gamma, xi);

            if (iter > 0 && Math.abs(logLL - prevLL) < 0.1) break;
            prevLL = logLL;
        }

        this._identifyStates();
        this.isTrained = true;
    }

    _forwardLog(obs) {
        const T = obs.length;
        const alpha = Array.from({ length: T }, () => new Float64Array(this.N).fill(-Infinity));

        for (let i = 0; i < this.N; i++) alpha[0][i] = this.pi[i] + this._logMultivariatePDF(obs[0], i);

        for (let t = 1; t < T; t++) {
            for (let j = 0; j < this.N; j++) {
                for (let i = 0; i < this.N; i++) this._termBuffer[i] = alpha[t - 1][i] + this.A[i][j];
                alpha[t][j] = this._logSumExp(this._termBuffer) + this._logMultivariatePDF(obs[t], j);
            }
        }
        return alpha;
    }

    _backwardLog(obs) {
        const T = obs.length;
        const beta = Array.from({ length: T }, () => new Float64Array(this.N).fill(0));

        for (let t = T - 2; t >= 0; t--) {
            for (let i = 0; i < this.N; i++) {
                for (let j = 0; j < this.N; j++) this._termBuffer[j] = this.A[i][j] + this._logMultivariatePDF(obs[t + 1], j) + beta[t + 1][j];
                beta[t][i] = this._logSumExp(this._termBuffer);
            }
        }
        return beta;
    }

    _logSumExp(arr) {
        let max = -Infinity;
        for (let i = 0; i < arr.length; i++) if (arr[i] > max) max = arr[i];
        if (max === -Infinity) return -Infinity;

        let sum = 0;
        for (let i = 0; i < arr.length; i++) sum += Math.exp(arr[i] - max);
        return max + Math.log(sum);
    }

    _logMultivariatePDF(x, state) {
        let logProb = 0;
        const m = this.means[state];
        const v = this.vars[state];
        for (let d = 0; d < this.D; d++) {
            logProb += -0.5 * (Math.log(2 * Math.PI * v[d]) + Math.pow(x[d] - m[d], 2) / v[d]);
        }
        return logProb;
    }

    _calculateGammaLog(alpha, beta, logLL) {
        const T = alpha.length;
        const gamma = Array.from({ length: T }, () => new Float64Array(this.N));
        for (let t = 0; t < T; t++) {
            for (let i = 0; i < this.N; i++) gamma[t][i] = Math.exp(alpha[t][i] + beta[t][i] - logLL);
        }
        return gamma;
    }

    _calculateXiLog(alpha, beta, obs, logLL) {
        const T = alpha.length;
        const xi = Array.from({ length: T - 1 }, () => Array.from({ length: this.N }, () => new Float64Array(this.N)));
        for (let t = 0; t < T - 1; t++) {
            for (let i = 0; i < this.N; i++) {
                for (let j = 0; j < this.N; j++) {
                    xi[t][i][j] = Math.exp(alpha[t][i] + this.A[i][j] + this._logMultivariatePDF(obs[t + 1], j) + beta[t + 1][j] - logLL);
                }
            }
        }
        return xi;
    }

    _updateParametersLog(obs, gamma, xi) {
        const T = obs.length;
        for (let i = 0; i < this.N; i++) {
            let sumGamma = 0;
            for (let t = 0; t < T; t++) sumGamma += gamma[t][i];

            this.pi[i] = Math.log(Math.max(gamma[0][i], 1e-12));

            let sumGammaP = sumGamma - gamma[T - 1][i];
            for (let j = 0; j < this.N; j++) {
                let sumXi = 0;
                for (let t = 0; t < T - 1; t++) sumXi += xi[t][i][j];
                this.A[i][j] = Math.log(Math.max(sumXi / (sumGammaP || 1e-12), 1e-12));
            }

            for (let d = 0; d < this.D; d++) {
                let meanNum = 0;
                for (let t = 0; t < T; t++) meanNum += gamma[t][i] * obs[t][d];
                this.means[i][d] = meanNum / (sumGamma || 1e-12);

                let varNum = 0;
                for (let t = 0; t < T; t++) varNum += gamma[t][i] * Math.pow(obs[t][d] - this.means[i][d], 2);
                this.vars[i][d] = Math.max(varNum / (sumGamma || 1e-12), 1e-9);
            }
        }
    }

    predictState(data, symbol = null) {
        if (!this.isTrained) return null;
        if (!data || data.length < 2) return null;

        // GUARDAR SÍMBOLO PARA VENTANA ADAPTATIVA
        if (symbol) {
            this.symbol = symbol;
        }

        // CALCULAR VOLATILIDAD RECIENTE
        const recentCandles = data.slice(-50);
        const closes = recentCandles.map(c => parseFloat(c[4]));
        const returns = [];
        for (let i = 1; i < closes.length; i++) {
            returns.push((closes[i] - closes[i - 1]) / closes[i - 1]);
        }
        const meanReturn = returns.reduce((a, b) => a + b, 0) / (returns.length || 1);
        const volatility = Math.sqrt(
            returns.reduce((a, b) => a + Math.pow(b - meanReturn, 2), 0) / (returns.length || 1)
        );

        // OBTENER VENTANA ADAPTATIVA BASADA EN VOLATILIDAD
        const hmmWindow = this.riskManager.getHMMWindowSize(this.symbol, volatility);

        // USAR hmmWindow EN LUGAR DE WINDOW FIJO
        const count = Math.min(hmmWindow, data.length);
        const slicedData = data.slice(-count);
        const obs = this._calculateObservations(slicedData);
        const T = obs.length;
        if (T === 0) return null;

        // ACTUALIZAR RISK MANAGER CON VOLATILIDAD RECIENTE
        if (volatility > 0) {
            this.riskManager.updateVolatilityScaler(volatility);
        }

        const delta = Array.from({ length: T }, () => new Float64Array(this.N).fill(-Infinity));
        const psi = Array.from({ length: T }, () => new Int32Array(this.N));

        for (let i = 0; i < this.N; i++) delta[0][i] = this.pi[i] + this._logMultivariatePDF(obs[0], i);

        for (let t = 1; t < T; t++) {
            for (let j = 0; j < this.N; j++) {
                for (let i = 0; i < this.N; i++) {
                    const val = delta[t - 1][i] + this.A[i][j];
                    if (val > delta[t][j]) {
                        delta[t][j] = val;
                        psi[t][j] = i;
                    }
                }
                delta[t][j] += this._logMultivariatePDF(obs[t], j);
            }
        }

        let maxProb = -Infinity;
        let lastState = 0;
        for (let i = 0; i < this.N; i++) {
            if (delta[T - 1][i] > maxProb) {
                maxProb = delta[T - 1][i];
                lastState = i;
            }
        }

        return {
            state: lastState,
            probability: Math.exp(maxProb),
            label: this.stateLabels[lastState] || 'TRANSICIÓN',
            // METADATA v2.7
            volatility: volatility,
            hmmWindow: hmmWindow,
            adaptiveWindowUsed: this.adaptiveWindowEnabled,
            symbol: this.symbol,
            riskMetrics: {
                kellyFraction: this.riskManager.kellyFraction,
                circuitBreakerActive: this.riskManager.circuitBreakerActive,
                volatilityScaler: this.riskManager.volatilityScaler
            }
        };
    }

    _identifyStates() {
        this.stateLabels = this.means.map((m, i) => {
            const pM = m[0];
            const pV = this.vars[i][0];
            const direction = pM > 0 ? "ALCISTA" : "BAJISTA";
            const volatility = pV > 1e-4 ? "VOLÁTIL" : "ESTABLE";

            if (volatility === "VOLÁTIL") {
                return `🎰 ${volatility} ${direction}`;
            } else {
                if (Math.abs(pM) < 1e-5) return "💤 LATERAL";
                return `📈 ${direction} ${volatility}`;
            }
        });
    }

    _calculateObservations(data) {
        const obs = [];
        for (let i = 1; i < data.length; i++) {
            obs.push([Math.log(parseFloat(data[i][4]) / parseFloat(data[i - 1][4])), Math.log((parseFloat(data[i][5]) || 1) / (parseFloat(data[i - 1][5]) || 1))]);
        }
        return obs;
    }

    getAdaptiveWindowSize(symbol, volatility) {
        if (!this.riskManager) {
            return 100;
        }
        return this.riskManager.getHMMWindowSize(symbol, volatility);
    }

    getRiskMetrics() {
        if (!this.riskManager) {
            return null;
        }
        return this.riskManager.getMetrics();
    }
}

module.exports = HMMEngine;
