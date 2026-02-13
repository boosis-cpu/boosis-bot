const axios = require('axios');
const logger = require('./logger');

class NotificationService {
    constructor() {
        this.token = process.env.TELEGRAM_BOT_TOKEN;
        this.chatId = process.env.TELEGRAM_CHAT_ID;
        this.enabled = !!(this.token && this.chatId);

        if (!this.enabled) {
            logger.warn('Notifications disabled: TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID missing in .env');
        }
    }

    async send(message) {
        if (!this.enabled) return;

        const url = `https://api.telegram.org/bot${this.token}/sendMessage`;
        try {
            await axios.post(url, {
                chat_id: this.chatId,
                text: message,
                parse_mode: 'HTML'
            });
        } catch (err) {
            logger.error(`Failed to send Telegram notification: ${err.message}`);
        }
    }

    async notifyTrade(trade) {
        const emoji = trade.side === 'BUY' ? '🟢' : '🔴';
        const message = `
${emoji} <b>NUEVA OPERACIÓN</b> ${emoji}
<b>Símbolo:</b> ${trade.symbol}
<b>Acción:</b> ${trade.side}
<b>Precio:</b> $${trade.price}
<b>Cantidad:</b> ${trade.amount}
<b>Motivo:</b> ${trade.reason || 'N/A'}
<b>Billetera:</b> USDT $${trade.balanceUsdt.toFixed(2)} | BTC ${trade.balanceAsset.toFixed(6)}
        `;
        return this.send(message);
    }

    async notifyAlert(alert) {
        const message = `⚠️ <b>SISTEMA:</b> ${alert}`;
        return this.send(message);
    }
}

module.exports = new NotificationService();
