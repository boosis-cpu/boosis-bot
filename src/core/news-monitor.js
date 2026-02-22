/**
 * 🗞️ NEWS MONITOR
 * 
 * Monitorea NewsAPI cada 30 minutos buscando noticias importantes
 * sobre RENDER, FET y NEAR. Si detecta keywords críticos, manda
 * alerta a Telegram con score de impacto.
 */

const axios = require('axios');
const notifications = require('./notifications');
const logger = require('./logger');

// Keywords de alto impacto — si aparecen en el título, es alerta
const HIGH_IMPACT_KEYWORDS = [
    'NVIDIA', 'partnership', 'mainnet', 'launch', 'hack', 'exploit',
    'SEC', 'ban', 'China', 'regulation', 'acquisition', 'listing',
    'Binance', 'Coinbase', 'ETF', 'upgrade', 'airdrop', 'burn',
    'GPU', 'compute', 'AI infrastructure', 'OpenAI', 'Microsoft',
];

const SYMBOLS = [
    { name: 'RENDER', query: 'Render Network GPU crypto' },
    { name: 'FET', query: 'Fetch AI autonomous agents crypto' },
    { name: 'NEAR', query: 'NEAR Protocol AI blockchain' },
];

// Guarda títulos ya alertados para no repetir
const alertedTitles = new Set();

class NewsMonitor {
    constructor() {
        this.apiKey = process.env.NEWS_API_KEY;
        this.interval = null;
        this.isRunning = false;
    }

    start() {
        if (!this.apiKey) {
            logger.warn('[NewsMonitor] NEWS_API_KEY no configurada — monitor desactivado');
            return;
        }

        logger.info('[NewsMonitor] 🗞️ Iniciando monitor de noticias AI Infra (cada 30 min)');
        this._check(); // Primera verificación inmediata
        this.interval = setInterval(() => this._check(), 30 * 60 * 1000);
        this.isRunning = true;
    }

    stop() {
        if (this.interval) {
            clearInterval(this.interval);
            this.interval = null;
            this.isRunning = false;
            logger.info('[NewsMonitor] Monitor detenido');
        }
    }

    async _check() {
        logger.info('[NewsMonitor] Verificando noticias...');
        for (const symbol of SYMBOLS) {
            try {
                await this._checkSymbol(symbol);
                // Pequeña pausa entre requests para respetar rate limit
                await new Promise(r => setTimeout(r, 1000));
            } catch (e) {
                logger.error(`[NewsMonitor] Error en ${symbol.name}: ${e.message}`);
            }
        }
    }

    async _checkSymbol({ name, query }) {
        const url = `https://newsapi.org/v2/everything?q=${encodeURIComponent(query)}&sortBy=publishedAt&pageSize=5&language=en&apiKey=${this.apiKey}`;
        const res = await axios.get(url);
        const data = res.data;

        if (data.status !== 'ok' || !data.articles) return;

        for (const article of data.articles) {
            // Skip si ya alertamos este artículo
            if (alertedTitles.has(article.title)) continue;

            const score = this._scoreArticle(article.title, article.description);
            if (score >= 2) {
                alertedTitles.add(article.title);
                await this._sendAlert(name, article, score);
            }
        }
    }

    _scoreArticle(title = '', description = '') {
        const text = (title + ' ' + description).toUpperCase();
        let score = 0;
        const found = [];

        for (const kw of HIGH_IMPACT_KEYWORDS) {
            if (text.includes(kw.toUpperCase())) {
                score++;
                found.push(kw);
            }
        }

        return score;
    }

    async _sendAlert(symbol, article, score) {
        const emoji = score >= 4 ? '🚨' : score >= 3 ? '⚡' : '📰';
        const impact = score >= 4 ? 'ALTO IMPACTO' : score >= 3 ? 'IMPACTO MEDIO' : 'A MONITOREAR';

        const msg = `${emoji} *NOTICIA ${impact}* — $${symbol}\n\n` +
            `*${article.title}*\n\n` +
            `📌 ${article.description ? article.description.substring(0, 150) + '...' : 'Sin descripción'}\n\n` +
            `🔗 ${article.url}\n` +
            `⏱️ ${new Date(article.publishedAt).toLocaleString('es-MX')}\n` +
            `📊 Score de impacto: ${score}/10`;

        await notifications.sendTelegram(msg);
        logger.info(`[NewsMonitor] ✅ Alerta enviada: ${symbol} — "${article.title}" (score: ${score})`);
    }
}

module.exports = new NewsMonitor();
