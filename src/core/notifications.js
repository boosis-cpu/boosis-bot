const axios = require('axios');
const logger = require('./logger');

class NotificationManager {
    constructor() {
        this.discordWebhook = process.env.DISCORD_WEBHOOK_URL;
        this.telegramToken = process.env.TELEGRAM_BOT_TOKEN;
        this.telegramChatId = process.env.TELEGRAM_CHAT_ID;
        this.enabled = false;

        // Verificar si hay al menos un canal configurado
        if (this.discordWebhook || (this.telegramToken && this.telegramChatId)) {
            this.enabled = true;
            logger.info('✅ Sistema de notificaciones activado');
        } else {
            logger.warn('⚠️  No hay canales de notificación configurados (Discord/Telegram)');
        }
    }

    /**
     * Envía notificación a Discord
     */
    async sendDiscord(message, type = 'info') {
        if (!this.discordWebhook) return;

        const colors = {
            success: 3066993,  // Verde
            error: 15158332,   // Rojo
            warning: 15105570, // Amarillo
            info: 3447003      // Azul
        };

        const embed = {
            title: '🤖 Boosis Quant Bot',
            description: message,
            color: colors[type] || colors.info,
            timestamp: new Date().toISOString(),
            footer: {
                text: 'Boosis Trading System'
            }
        };

        try {
            await axios.post(this.discordWebhook, {
                embeds: [embed]
            });
            logger.debug('Discord notification sent');
        } catch (error) {
            logger.error(`Error enviando notificación a Discord: ${error.message}`);
        }
    }

    /**
     * Envía notificación a Telegram
     */
    async sendTelegram(message) {
        if (!this.telegramToken || !this.telegramChatId) return;

        const url = `https://api.telegram.org/bot${this.telegramToken}/sendMessage`;

        try {
            await axios.post(url, {
                chat_id: this.telegramChatId,
                text: `🤖 *Boosis Bot*\n\n${message}`,
                parse_mode: 'Markdown'
            });
            logger.debug('Telegram notification sent');
        } catch (error) {
            logger.error(`Error enviando notificación a Telegram: ${error.message}`);
        }
    }

    /**
     * Envía notificación a todos los canales configurados
     */
    async send(message, type = 'info') {
        if (!this.enabled) return;

        const promises = [];

        if (this.discordWebhook) {
            promises.push(this.sendDiscord(message, type));
        }

        if (this.telegramToken && this.telegramChatId) {
            promises.push(this.sendTelegram(message));
        }

        await Promise.allSettled(promises);
    }

    /**
     * Notifica cuando se ejecuta un trade
     */
    async notifyTrade(trade) {
        const emoji = trade.side === 'BUY' ? '🟢' : '🔴';
        const tradeType = trade.type === 'REAL' ? '💰 REAL' : '📝 PAPER';

        let message = `${emoji} **TRADE EJECUTADO** (${tradeType})\n\n`;
        message += `**Símbolo:** ${trade.symbol}\n`;
        message += `**Acción:** ${trade.side}\n`;
        message += `**Precio:** $${trade.price.toFixed(2)}\n`;
        message += `**Cantidad:** ${trade.amount.toFixed(6)}\n`;

        if (trade.slippage) {
            message += `**Slippage:** ${trade.slippage.toFixed(4)}%\n`;
        }

        if (trade.reason) {
            message += `**Razón:** ${trade.reason}\n`;
        }

        if (trade.balanceUsdt !== undefined) {
            message += `\n**Balance USDT:** $${parseFloat(trade.balanceUsdt).toFixed(2)}`;
        }

        await this.send(message, trade.type === 'REAL' ? 'warning' : 'info');
    }

    /**
     * Notifica una alerta crítica
     */
    async notifyAlert(message) {
        const alertMessage = `🚨 **ALERTA CRÍTICA**\n\n${message}`;
        await this.send(alertMessage, 'error');
    }

    /**
     * Notifica cuando el bot se inicia
     */
    async notifyStartup(config) {
        let message = `✅ **BOT INICIADO**\n\n`;
        message += `**Modo:** ${config.liveTrading ? '💰 LIVE TRADING' : '📝 PAPER TRADING'}\n`;
        message += `**Símbolo:** ${config.symbol}\n`;
        message += `**Estrategia:** ${config.strategy}\n`;
        message += `**Saldo Inicial:** $${parseFloat(config.balance || 0).toFixed(2)} USDT\n`;
        message += `**Servidor:** ${config.hostname || 'Local'}\n`;

        await this.send(message, 'success');
    }

    /**
     * Notifica cuando hay un error crítico
     */
    async notifyError(error, context = '') {
        let message = `❌ **ERROR CRÍTICO**\n\n`;

        if (context) {
            message += `**Contexto:** ${context}\n`;
        }

        message += `**Error:** ${error.message}\n`;

        if (error.stack) {
            const stackLines = error.stack.split('\n').slice(0, 3).join('\n');
            message += `\n**Stack:**\n\`\`\`\n${stackLines}\n\`\`\``;
        }

        await this.send(message, 'error');
    }

    /**
     * Notifica el resumen diario
     */
    async notifyDailySummary(summary) {
        let message = `📊 **RESUMEN DIARIO**\n\n`;
        message += `**Trades:** ${summary.totalTrades}\n`;
        message += `**Ganadores:** ${summary.winningTrades} (${summary.winRate}%)\n`;
        message += `**P&L:** $${summary.pnl.toFixed(2)}\n`;
        message += `**Balance:** $${summary.balance.toFixed(2)}\n`;

        await this.send(message, summary.pnl > 0 ? 'success' : 'warning');
    }
}

module.exports = new NotificationManager();
