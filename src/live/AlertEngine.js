
const HMMEngine = require('../core/hmm-engine');
const PatternScanner = require('../core/pattern-scanner');
const notifications = require('../core/notifications');
const logger = require('../core/logger');
const TI = require('../core/technical_indicators');

/**
 * 🚨 ALERT ENGINE
 * 
 * Motor de alertas simplificado que reemplaza la ejecución automática.
 * Escanea el mercado buscando confluencia entre:
 * 1. HMM (Régimen de Mercado)
 * 2. Pattern Scanner (Formaciones Técnicas)
 * 
 * Solo notifica cuando ambos sistemas están de acuerdo.
 */
class AlertEngine {
    constructor() {
        this.hmm = new HMMEngine();
        this.scanner = new PatternScanner();

        // Control de spam: Mapa de última alerta por símbolo y tipo
        // Key: `${symbol}_${patternType}` -> Value: timestamp
        this.lastAlerts = new Map();

        // 4 horas de cooldown para el mismo patrón en el mismo par
        this.COOLDOWN_MS = 4 * 60 * 60 * 1000;

        logger.info('🚨 Alert Engine inicializado: HMM + Pattern Scanner');
    }

    /**
     * Procesa una nueva vela y busca oportunidades
     * @param {string} symbol - Par de trading (ej. BTCUSDT)
     * @param {Array} candles - Array de velas OHLCV [[t,o,h,l,c,v], ...]
     */
    async processCandle(symbol, candles) {
        if (!candles || candles.length < 100) return null;

        try {
            // 1. Entrenar/Actualizar HMM si es necesario
            // El HMM necesita datos para entrenarse inicialmente
            if (!this.hmm.isTrained) {
                await this.hmm.train(candles);
            }

            // 2. Obtener Régimen de Mercado (HMM)
            const regime = this.hmm.predictState(candles, symbol);
            if (!regime) return null;

            // 3. Escanear Patrones de Precios
            const lastCandle = candles[candles.length - 1];
            const pattern = this.scanner.detect(lastCandle, candles);

            // 4. Verificar Confluencia y Alertar
            if (pattern && pattern.detected) {
                const conformed = await this._checkConfluenceAndAlert(symbol, pattern, regime, candles);
                return { pattern, regime, conformed };
            }

            return null;

        } catch (error) {
            logger.error(`[AlertEngine] Error procesando ${symbol}: ${error.message}`);
            return null;
        }
    }

    /**
     * Verifica si el patrón y el régimen coinciden
     */
    async _checkConfluenceAndAlert(symbol, pattern, regime, candles) {
        const lastCandle = candles[candles.length - 1];
        const currentPrice = parseFloat(lastCandle[4]);

        // 4. Trend Filter: EMA 200 (Macro Edge)
        const closes = candles.map(c => parseFloat(c[4]));
        const ema200 = TI.calculateEMA(closes, 200);
        const aboveEma = ema200 ? currentPrice > ema200 : true;

        const isBullish = pattern.direction === 'BULLISH' && aboveEma &&
            (regime.label.includes('ALCISTA') || regime.label.includes('REBOTE'));

        const isBearish = pattern.direction === 'BEARISH' && !aboveEma &&
            (regime.label.includes('BAJISTA') || regime.label.includes('CAÍDA'));

        const isHighVol = regime.label.includes('VOLÁTIL') && pattern.confidence > 0.8;

        if (isBullish || isBearish || isHighVol) {
            const alertKey = `${symbol}_${pattern.type}_${pattern.direction}`;
            const lastTime = this.lastAlerts.get(alertKey) || 0;
            const now = Date.now();

            if (now - lastTime < this.COOLDOWN_MS) {
                return false;
            }

            await this._sendTelegramAlert(symbol, pattern, regime, currentPrice);
            this.lastAlerts.set(alertKey, now);
            return true;
        }
        return false;
    }

    /**
     * Construye y envía el mensaje a Telegram
     */
    async _sendTelegramAlert(symbol, pattern, regime, price) {
        const emoji = pattern.direction === 'BULLISH' ? '🟢' : '🔴';
        const action = pattern.direction === 'BULLISH' ? 'LONG' : 'SHORT';

        const msg = `
${emoji} **ALERTA DE CONFLUENCIA** ${emoji}

**Par:** ${symbol}
**Precio:** $${price.toFixed(2)}

📐 **Patrón Detectado:**
${pattern.type} (${pattern.subType || 'Estándar'})
Confianza: ${(pattern.confidence * 100).toFixed(1)}%
Target: $${pattern.target.toFixed(2)}

🧠 **Régimen HMM:**
${regime.label}
Probabilidad: ${(regime.probability * 100).toFixed(1)}%

🚀 **ACCIÓN SUGERIDA:** ${action}
_Solo entrada manual. Verifica tu setup._
`;

        await notifications.sendTelegram(msg);
        logger.info(`📨 Alerta enviada: ${symbol} ${action} (${pattern.type} + ${regime.label})`);
    }
}

module.exports = new AlertEngine();
