/**
 * 📋 ORDER MONITOR
 * 
 * Monitorea órdenes ejecutadas en Binance cada 60 segundos.
 * Detecta stops, targets y compras ejecutadas fuera del bot
 * y manda alerta inmediata a Telegram.
 */

const binanceService = require('./binance');
const notifications = require('./notifications');
const logger = require('./logger');

// Símbolos AI Infra a monitorear
const SYMBOLS = ['RENDERUSDT', 'FETUSDT', 'NEARUSDT', 'TAOUSDT', 'WLDUSDT'];

// Guarda el último tradeId visto por símbolo para no repetir alertas
const lastSeenTradeId = {};

class OrderMonitor {
    constructor() {
        this.interval = null;
        this.isRunning = false;
    }

    start() {
        logger.info('[OrderMonitor] 📋 Iniciando monitor de órdenes ejecutadas (cada 60s)');
        this._check(); // Primera verificación inmediata
        this.interval = setInterval(() => this._check(), 60_000);
        this.isRunning = true;
    }

    stop() {
        if (this.interval) {
            clearInterval(this.interval);
            this.interval = null;
            this.isRunning = false;
        }
    }

    async _check() {
        for (const symbol of SYMBOLS) {
            try {
                await this._checkSymbol(symbol);
                await new Promise(r => setTimeout(r, 300)); // Pausa entre requests
            } catch (e) {
                logger.error(`[OrderMonitor] Error en ${symbol}: ${e.message}`);
            }
        }
    }

    async _checkSymbol(symbol) {
        const trades = await binanceService.getMyTrades(symbol, 5);
        if (!trades || trades.length === 0) return;

        // Ordenar por tiempo descendente
        trades.sort((a, b) => b.time - a.time);
        const latest = trades[0];

        // Si ya vimos este trade, ignorar
        const lastId = lastSeenTradeId[symbol];
        if (lastId && latest.id <= lastId) return;

        // Primer run — guardar el último ID sin alertar
        if (!lastId) {
            lastSeenTradeId[symbol] = latest.id;
            logger.info(`[OrderMonitor] ${symbol} — inicializado en tradeId ${latest.id}`);
            return;
        }

        // Hay trades nuevos desde la última verificación
        const newTrades = trades.filter(t => t.id > lastId);
        lastSeenTradeId[symbol] = latest.id;

        for (const trade of newTrades.reverse()) {
            await this._alertTrade(symbol, trade);
        }
    }

    async _alertTrade(symbol, trade) {
        const side = trade.isBuyer ? 'COMPRA' : 'VENTA';
        const emoji = trade.isBuyer ? '🟢' : '🔴';
        const price = parseFloat(trade.price).toFixed(4);
        const qty = parseFloat(trade.qty).toFixed(4);
        const total = (parseFloat(trade.price) * parseFloat(trade.qty)).toFixed(2);
        const time = new Date(trade.time).toLocaleString('es-MX');
        const asset = symbol.replace('USDT', '');

        const msg = `${emoji} ORDEN EJECUTADA EN BINANCE\n\n` +
            `Par: ${symbol}\n` +
            `Accion: ${side}\n` +
            `Precio: $${price}\n` +
            `Cantidad: ${qty} ${asset}\n` +
            `Total: $${total} USDT\n` +
            `Hora: ${time}\n` +
            `TradeID: ${trade.id}`;

        await notifications.sendTelegram(msg);
        logger.info(`[OrderMonitor] ✅ Alerta enviada: ${side} ${qty} ${asset} @ $${price}`);
    }
}

module.exports = new OrderMonitor();
