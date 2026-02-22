const axios = require('axios');
const crypto = require('crypto');
const logger = require('./logger');

const CredentialsManager = require('./credentials-manager');

class BinanceService {
    constructor() {
        this.apiKey = null;
        this.apiSecret = null;
        this.baseUrl = 'https://api.binance.com/api/v3';
    }

    async initialize() {
        try {
            const hasCreds = await CredentialsManager.hasCredentials('binance');
            if (hasCreds) {
                const creds = await CredentialsManager.getCredentials('binance');
                this.apiKey = creds.apiKey;
                this.apiSecret = creds.apiSecret;
                logger.info('[Binance] ✅ Credenciales cargadas desde BD (Encriptadas)');
            } else {
                logger.warn('[Binance] ⚠️  No hay credenciales en DB. Usando .env (Fallback)');
                this.apiKey = process.env.BINANCE_API_KEY;
                this.apiSecret = process.env.BINANCE_SECRET;
            }
        } catch (error) {
            logger.error(`[Binance] Error inicializando credenciales: ${error.message}`);
        }

        if (!this.apiKey || !this.apiSecret) {
            logger.warn('⚠️  Binance API credentials not configured. Real trading disabled.');
        }
    }

    /**
     * Genera firma HMAC SHA256 para autenticación
     */
    _generateSignature(queryString) {
        return crypto
            .createHmac('sha256', this.apiSecret)
            .update(queryString)
            .digest('hex');
    }

    /**
     * Realiza request autenticado a Binance
     */
    async _authenticatedRequest(endpoint, params = {}) {
        if (!this.apiKey || !this.apiSecret) {
            throw new Error('Binance API credentials not configured');
        }

        const timestamp = Date.now();
        const queryParams = { ...params, timestamp };

        // Construir query string
        const queryString = Object.keys(queryParams)
            .map(key => `${key}=${queryParams[key]}`)
            .join('&');

        // Generar firma
        const signature = this._generateSignature(queryString);
        const url = `${this.baseUrl}${endpoint}?${queryString}&signature=${signature}`;

        try {
            const response = await axios.get(url, {
                headers: {
                    'X-MBX-APIKEY': this.apiKey
                }
            });
            return response.data;
        } catch (error) {
            logger.error(`Binance API Error: ${error.response?.data?.msg || error.message}`);
            throw error;
        }
    }

    /**
     * Obtiene el balance de la cuenta
     */
    async getAccountBalance() {
        try {
            const accountInfo = await this._authenticatedRequest('/account');

            // Filtrar solo balances con fondos
            const balances = accountInfo.balances
                .filter(b => parseFloat(b.free) > 0 || parseFloat(b.locked) > 0)
                .map(b => ({
                    asset: b.asset,
                    free: parseFloat(b.free),
                    locked: parseFloat(b.locked),
                    total: parseFloat(b.free) + parseFloat(b.locked)
                }));

            logger.success(`✅ Balance obtenido: ${balances.length} activos`);
            return balances;
        } catch (error) {
            logger.error(`Error obteniendo balance de Binance: ${error.message}`);
            throw error;
        }
    }

    /**
     * Formatea cantidad según los filtros de Binance
     */
    formatQuantity(quantity, symbol = 'BTCUSDT') {
        // Para BTC, usar 6 decimales (0.000001)
        // Para otros, ajustar según necesidad
        if (symbol.includes('BTC')) {
            return parseFloat(quantity.toFixed(6));
        }
        return parseFloat(quantity.toFixed(8));
    }

    /**
     * Ejecuta una orden MARKET en Binance
     */
    async executeOrder(symbol, side, quantity) {
        if (!this.apiKey || !this.apiSecret) {
            throw new Error('Binance API credentials not configured');
        }

        const timestamp = Date.now();
        const params = {
            symbol: symbol,
            side: side.toUpperCase(), // BUY o SELL
            type: 'MARKET',
            quantity: this.formatQuantity(quantity, symbol),
            timestamp: timestamp
        };

        const queryString = Object.keys(params)
            .map(key => `${key}=${params[key]}`)
            .join('&');

        const signature = this._generateSignature(queryString);
        const url = `${this.baseUrl}/order?${queryString}&signature=${signature}`;

        try {
            logger.warn(`🚨 EJECUTANDO ORDEN REAL: ${side} ${quantity} ${symbol}`);

            const response = await axios.post(url, null, {
                headers: {
                    'X-MBX-APIKEY': this.apiKey
                }
            });

            logger.success(`✅ Orden ejecutada: ${response.data.orderId}`);
            return response.data;
        } catch (error) {
            const errorMsg = error.response?.data?.msg || error.message;
            logger.error(`❌ Error ejecutando orden: ${errorMsg}`);
            throw new Error(errorMsg);
        }
    }

    /**
     * Obtiene precio actual de un símbolo
     */
    async getCurrentPrice(symbol = 'BTCUSDT') {
        try {
            const response = await axios.get(`${this.baseUrl}/ticker/price`, {
                params: { symbol }
            });
            return parseFloat(response.data.price);
        } catch (error) {
            throw error;
        }
    }

    /**
     * Obtiene velas directamente de la API pública de Binance
     */
    async getKlines(symbol, interval, limit = 500) {
        try {
            const response = await axios.get(`${this.baseUrl}/klines`, {
                params: { symbol, interval, limit }
            });
            return response.data; // [[t,o,h,l,c,v...], ...]
        } catch (error) {
            logger.error(`[Binance] Error fetching klines: ${error.message}`);
            return [];
        }
    }

    /**
     * Verifica si las credenciales son válidas
     */
    async testConnection() {
        try {
            await this._authenticatedRequest('/account');
            logger.success('✅ Conexión a Binance API exitosa');
            return true;
        } catch (error) {
            logger.error(`❌ Fallo en conexión a Binance: ${error.message}`);
            return false;
        }
    }

    /**
     * Obtiene órdenes abiertas para un símbolo
     */
    async getOpenOrders(symbol = 'BTCUSDT') {
        try {
            return await this._authenticatedRequest('/openOrders', { symbol });
        } catch (error) {
            logger.error(`Error obteniendo órdenes abiertas: ${error.message}`);
            throw error;
        }
    }

    /**
     * Obtiene el balance enriquecido con precios en USD
     */
    async getEnrichedBalance() {
        try {
            const balances = await this.getAccountBalance();

            // Obtener precios de todos los activos
            const enrichedBalances = await Promise.all(
                balances.map(async (balance) => {
                    let priceUSD = 0;
                    let symbol = '';

                    try {
                        // Si ya es USDT, el precio es 1
                        if (balance.asset === 'USDT') {
                            priceUSD = 1;
                        } else {
                            // Intentar obtener precio contra USDT
                            symbol = `${balance.asset}USDT`;
                            priceUSD = await this.getCurrentPrice(symbol);
                        }
                    } catch (error) {
                        // Si no existe el par contra USDT, intentar contra BTC
                        try {
                            symbol = `${balance.asset}BTC`;
                            const priceBTC = await this.getCurrentPrice(symbol);
                            const btcUSD = await this.getCurrentPrice('BTCUSDT');
                            priceUSD = priceBTC * btcUSD;
                        } catch (error2) {
                            // Fallback para MXN si Binance no da el par
                            if (balance.asset === 'MXN') {
                                priceUSD = 1 / 20.0; // Tasa base aprox (1 USD = 20 MXN)
                            } else {
                                priceUSD = 0;
                            }
                        }
                    }

                    return {
                        ...balance,
                        priceUSD,
                        valueUSD: balance.total * priceUSD
                    };
                })
            );

            // Calcular total en USD
            const totalUSD = enrichedBalances.reduce((sum, b) => sum + b.valueUSD, 0);

            return {
                balances: enrichedBalances,
                totalUSD
            };
        } catch (error) {
            logger.error(`Error obteniendo balance enriquecido: ${error.message}`);
            throw error;
        }
    }

    /**
     * Obtiene trades ejecutados para un símbolo (órdenes completadas)
     */
    async getMyTrades(symbol, limit = 10) {
        try {
            return await this._authenticatedRequest('/myTrades', { symbol, limit });
        } catch (error) {
            logger.error(`[Binance] Error obteniendo trades de ${symbol}: ${error.message}`);
            return [];
        }
    }
}

module.exports = new BinanceService();
