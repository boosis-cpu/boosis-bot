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
            this.loadExchangeInfo();
        } else {
            logger.warn('Binance Service: Faltan llaves de API. Operando solo en modo lectura/público.');
            this.client = Binance();
        }
    }

    async loadExchangeInfo() {
        try {
            const info = await this.client.exchangeInfo();
            this.exchangeInfo = info.symbols.find(s => s.symbol === 'BTCUSDT');
            logger.info('Exchange info para BTCUSDT cargado.');
        } catch (err) {
            logger.error(`Error cargando exchange info: ${err.message}`);
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

    formatQuantity(quantity) {
        if (!this.exchangeInfo) return parseFloat(quantity.toFixed(5));

        const lotSize = this.exchangeInfo.filters.find(f => f.filterType === 'LOT_SIZE');
        if (!lotSize) return parseFloat(quantity.toFixed(5));

        const stepSize = parseFloat(lotSize.stepSize);
        const precision = Math.log10(1 / stepSize);
        return parseFloat(quantity.toFixed(precision));
    }

    async executeOrder(symbol, side, quantity) {
        if (!this.isLive) {
            logger.info(`[SIMULACIÓN] Orden bloqueada por Switch de Seguridad: ${side} ${quantity} ${symbol}`);
            return { status: 'SIMULATED', orderId: 'MOCK_' + Date.now() };
        }

        try {
            // Safety check: Minimum notional usually 10 USDT
            const prices = await this.client.prices({ symbol });
            const price = parseFloat(prices[symbol]);
            if (quantity * price < 10.1) { // 10.1 to be safe
                throw new Error(`Orden rechazada: El valor total (${(quantity * price).toFixed(2)} USDT) es inferior al mínimo de 10 USDT.`);
            }

            logger.warn(`¡EJECUTANDO ORDEN REAL!: ${side} ${quantity} ${symbol}`);
            const result = await this.client.order({
                symbol,
                side,
                quantity,
                type: 'MARKET',
            });
            return result;
        } catch (error) {
            logger.error(`Error ejecutando orden REAL en Binance: ${error.message}`);
            throw error;
        }
    }
}

module.exports = new BinanceService();
