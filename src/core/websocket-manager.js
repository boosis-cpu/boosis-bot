// src/core/websocket-manager.js
const WebSocket = require('ws');
const logger = require('./logger');

class WebSocketManager {
    constructor() {
        this.ws = null;
        this.activeSymbols = new Set(); // {'BTCUSDT', 'ETHUSDT', 'XRPUSDT'}
        this.messageHandlers = new Map(); // {symbol: callback}
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = 10;
        this.reconnectDelay = 1000; // ms
        this._lastAlreadyOpenWarn = 0;
    }

    // PASO 1: Agregar símbolo a escuchar
    addSymbol(symbol, callback) {
        if (this.activeSymbols.has(symbol)) {
            logger.warn(`[WS] ${symbol} ya está siendo escuchado`);
            return;
        }

        this.activeSymbols.add(symbol);
        this.messageHandlers.set(symbol, callback);
        logger.info(`[WS] ➕ Símbolo agregado: ${symbol} (Total: ${this.activeSymbols.size})`);

        // Si WebSocket ya está activo, reconfigurar
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            this._updateCombinedStream();
        }
    }

    // PASO 2: Remover símbolo
    removeSymbol(symbol) {
        if (!this.activeSymbols.has(symbol)) {
            logger.warn(`[WS] ${symbol} no está siendo escuchado`);
            return;
        }

        this.activeSymbols.delete(symbol);
        this.messageHandlers.delete(symbol);
        logger.info(`[WS] ➖ Símbolo removido: ${symbol} (Total: ${this.activeSymbols.size})`);

        // Reconfigurar stream
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            this._updateCombinedStream();
        }
    }

    // PASO 3: Construir URL de CombinedStream
    _buildCombinedStreamUrl() {
        if (this.activeSymbols.size === 0) {
            throw new Error('[WS] No hay símbolos para escuchar');
        }

        // Convertir a minúsculas para la URL - CAMBIO: 5m -> 1m para mayor reactividad
        const streams = Array.from(this.activeSymbols)
            .map(symbol => `${symbol.toLowerCase()}@kline_1m`)
            .join('/');

        const url = `wss://stream.binance.com:9443/stream?streams=${streams}`;
        logger.debug(`[WS] URL generada: ${url}`);
        return url;
    }

    // PASO 4: Conectar WebSocket
    async connect() {
        try {
            if (this.ws && this.ws.readyState === WebSocket.OPEN) {
                const now = Date.now();
                // Only warn once per minute to avoid log spam
                if (!this._lastAlreadyOpenWarn || (now - this._lastAlreadyOpenWarn) > 60000) {
                    logger.warn('[WS] ⚠️ Ya hay una conexión abierta');
                    this._lastAlreadyOpenWarn = now;
                }
                return;
            }

            const url = this._buildCombinedStreamUrl();
            logger.info(`[WS] 🔌 Conectando a ${this.activeSymbols.size} símbolo(s)...`);

            this.ws = new WebSocket(url);

            this.ws.on('open', () => {
                logger.success(`[WS] ✅ Conectado. Escuchando: ${Array.from(this.activeSymbols).join(', ')}`);
                this.reconnectAttempts = 0;
            });

            this.ws.on('message', (data) => {
                try {
                    const message = JSON.parse(data);

                    // CombinedStream devuelve {stream: "...", data: {...}}
                    if (message.stream && message.data) {
                        const symbol = this._extractSymbolFromStream(message.stream);
                        const callback = this.messageHandlers.get(symbol);

                        if (callback) {
                            callback(message.data);
                        }
                    }
                } catch (error) {
                    logger.error(`[WS] Error procesando mensaje: ${error.message}`);
                }
            });

            this.ws.on('error', (error) => {
                logger.error(`[WS] ❌ Error: ${error.message}`);
            });

            this.ws.on('close', () => {
                logger.warn(`[WS] ⚠️ Conexión cerrada. Intentando reconectar...`);
                this._reconnect();
            });

            this.ws.on('ping', () => {
                this.ws.pong();
            });

        } catch (error) {
            logger.error(`[WS] ❌ Error conectando: ${error.message}`);
            this._reconnect();
        }
    }

    // PASO 5: Actualizar stream (cuando agregan/remueven símbolos)
    async _updateCombinedStream() {
        try {
            logger.info('[WS] 🔄 Reconfigurando stream...');

            if (this.ws && this.ws.readyState === WebSocket.OPEN) {
                this.ws.close();
                await new Promise(resolve => setTimeout(resolve, 500)); // Esperar cierre
            }

            await this.connect();
        } catch (error) {
            logger.error(`[WS] Error actualizando stream: ${error.message}`);
        }
    }

    // PASO 6: Reconexión con backoff exponencial
    async _reconnect() {
        if (this.reconnectAttempts >= this.maxReconnectAttempts) {
            logger.error(`[WS] ❌ Máximo de intentos de reconexión excedido`);
            return;
        }

        this.reconnectAttempts++;
        const delay = Math.min(this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1), 30000);

        logger.info(`[WS] ⏳ Reintentando en ${delay}ms (intento ${this.reconnectAttempts}/${this.maxReconnectAttempts})`);

        setTimeout(() => {
            this.connect();
        }, delay);
    }

    // PASO 7: Extraer símbolo del stream
    _extractSymbolFromStream(stream) {
        // stream = "btcusdt@kline_5m"
        const parts = stream.split('@');
        return parts[0].toUpperCase(); // "btcusdt" -> "BTCUSDT"
    }

    // PASO 8: Desconectar
    disconnect() {
        if (this.ws) {
            this.ws.close();
            this.ws = null;
            logger.info('[WS] ❌ WebSocket desconectado');
        }
    }

    // PASO 9: Obtener estado
    getStatus() {
        return {
            isConnected: this.ws && this.ws.readyState === WebSocket.OPEN,
            activeSymbols: Array.from(this.activeSymbols),
            totalSymbols: this.activeSymbols.size,
            reconnectAttempts: this.reconnectAttempts,
        };
    }
}

module.exports = new WebSocketManager();
