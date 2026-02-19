// src/core/websocket-manager.js
const WebSocket = require('ws');
const logger = require('./logger');

class WebSocketManager {
    constructor() {
        this.ws = null;
        this.activeSymbols = new Set();
        this.messageHandlers = new Map();
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = 10;
        this.reconnectDelay = 1000;
        this._lastAlreadyOpenWarn = 0;
        this.timeframe = '4h'; // FUENTE ÚNICA DE VERDAD
    }

    setTimeframe(tf) {
        this.timeframe = tf;
        logger.info(`[WS] Timeframe configurado: ${tf}`);
    }

    addSymbol(symbol, callback) {
        if (this.activeSymbols.has(symbol)) {
            logger.warn(`[WS] ${symbol} ya está siendo escuchado`);
            return;
        }
        this.activeSymbols.add(symbol);
        this.messageHandlers.set(symbol, callback);
        logger.info(`[WS] ➕ ${symbol} agregado (Total: ${this.activeSymbols.size})`);

        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            this._updateCombinedStream();
        }
    }

    removeSymbol(symbol) {
        if (!this.activeSymbols.has(symbol)) return;
        this.activeSymbols.delete(symbol);
        this.messageHandlers.delete(symbol);
        logger.info(`[WS] ➖ ${symbol} removido (Total: ${this.activeSymbols.size})`);

        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            this._updateCombinedStream();
        }
    }

    _buildCombinedStreamUrl() {
        if (this.activeSymbols.size === 0) {
            throw new Error('[WS] No hay símbolos activos');
        }
        const streams = Array.from(this.activeSymbols)
            .map(symbol => `${symbol.toLowerCase()}@kline_${this.timeframe}`)
            .join('/');

        const url = `wss://stream.binance.com:9443/stream?streams=${streams}`;
        logger.debug(`[WS] URL generada: ${url}`);
        return url;
    }

    async connect() {
        try {
            if (this.ws && this.ws.readyState === WebSocket.OPEN) {
                const now = Date.now();
                if (!this._lastAlreadyOpenWarn || (now - this._lastAlreadyOpenWarn) > 60000) {
                    logger.warn('[WS] ⚠️ Conexión ya activa');
                    this._lastAlreadyOpenWarn = now;
                }
                return;
            }

            const url = this._buildCombinedStreamUrl();
            logger.info(`[WS] 🔌 Conectando | TF: ${this.timeframe} | Símbolos: ${this.activeSymbols.size}`);

            this.ws = new WebSocket(url);

            this.ws.on('open', () => {
                logger.success(`[WS] ✅ Conectado. Escuchando: ${Array.from(this.activeSymbols).join(', ')}`);
                this.reconnectAttempts = 0;
            });

            this.ws.on('message', (data) => {
                try {
                    const message = JSON.parse(data);
                    if (!message.stream || !message.data) return;

                    const symbol = this._extractSymbolFromStream(message.stream);
                    if (!symbol) return;

                    const callback = this.messageHandlers.get(symbol);
                    if (callback) callback(message.data);

                } catch (error) {
                    logger.error(`[WS] Error procesando mensaje: ${error.message}`);
                }
            });

            this.ws.on('error', (error) => {
                logger.error(`[WS] ❌ Error: ${error.message}`);
            });

            this.ws.on('close', () => {
                logger.warn('[WS] ⚠️ Conexión cerrada. Reconectando...');
                this._reconnect();
            });

            this.ws.on('ping', () => this.ws.pong());

        } catch (error) {
            logger.error(`[WS] ❌ Error conectando: ${error.message}`);
            this._reconnect();
        }
    }

    async _updateCombinedStream() {
        logger.info('[WS] 🔄 Reconfigurando stream...');
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            this.ws.close();
            await new Promise(resolve => setTimeout(resolve, 500));
        }
        await this.connect();
    }

    async _reconnect() {
        if (this.reconnectAttempts >= this.maxReconnectAttempts) {
            logger.error('[WS] ❌ Máximo de reconexiones alcanzado');
            return;
        }
        this.reconnectAttempts++;
        const delay = Math.min(this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1), 30000);
        logger.info(`[WS] ⏳ Reintentando en ${delay}ms (${this.reconnectAttempts}/${this.maxReconnectAttempts})`);
        setTimeout(() => this.connect(), delay);
    }

    _extractSymbolFromStream(stream) {
        // stream format: "btcusdt@kline_4h"
        // Robusto contra cualquier timeframe presente o futuro
        const match = stream.match(/^([a-z0-9]+)@kline_/);
        if (!match) {
            logger.warn(`[WS] Stream con formato inesperado: ${stream}`);
            return null;
        }
        return match[1].toUpperCase();
    }

    disconnect() {
        if (this.ws) {
            this.ws.close();
            this.ws = null;
            logger.info('[WS] ❌ Desconectado');
        }
    }

    getStatus() {
        return {
            isConnected: this.ws && this.ws.readyState === WebSocket.OPEN,
            timeframe: this.timeframe,
            activeSymbols: Array.from(this.activeSymbols),
            totalSymbols: this.activeSymbols.size,
            reconnectAttempts: this.reconnectAttempts,
        };
    }
}

module.exports = new WebSocketManager();
