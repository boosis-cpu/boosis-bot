const Binance = require('binance-api-node').default;
const logger = require('./logger');

class BinanceService {
    constructor() {
        this.client = null;
        this.isLive = process.env.LIVE_TRADING === 'true';

        if (process.env.BINANCE_API_KEY && process.env.BINANCE_SECRET) {
            this.client = Binance({
                apiKey: process.env.BINANCE_API_KEY,
                apiSecret: process.env.BINANCE_SECRET,
            });
            logger.info(`Binance Service inicializado. Modo Real: ${this.isLive}`);
        } else {
            logger.warn('Binance Service: Faltan llaves de API. Operando solo en modo lectura/público.');
            this.client = Binance();
        }
    }

    async getAccountBalance() {
        try {
            if (!process.env.BINANCE_API_KEY) return null;
            const info = await this.client.accountInfo();
            return info.balances.filter(b => parseFloat(b.free) > 0 || parseFloat(b.locked) > 0);
        } catch (error) {
            logger.error(`Error obteniendo balance de Binance: ${error.message}`);
            return null;
        }
    }

    async getSymbolPrice(symbol) {
        try {
            const prices = await this.client.prices({ symbol });
            return parseFloat(prices[symbol]);
        } catch (error) {
            logger.error(`Error obteniendo precio de ${symbol}: ${error.message}`);
            return null;
        }
    }

    async executeOrder(symbol, side, quantity) {
        if (!this.isLive) {
            logger.info(`[SIMULACIÓN] Orden bloqueada por Switch de Seguridad: ${side} ${quantity} ${symbol}`);
            return { status: 'SIMULATED' };
        }

        try {
            logger.warn(`¡EJECUTANDO ORDEN REAL!: ${side} ${quantity} ${symbol}`);
            const result = await this.client.order({
                symbol,
                side,
                quantity,
                type: 'MARKET',
            });
            return result;
        } catch (error) {
            logger.error(`Error ejecutando orden REAL: ${error.message}`);
            throw error;
        }
    }
}

module.exports = new BinanceService();
stone
