const axios = require('axios');
const fs = require('fs');
const path = require('path');
const logger = require('../core/logger');

/**
 * Backtesting Engine
 * Simula la estrategia con datos históricos para validar rentabilidad
 */
class BacktestEngine {
    constructor(strategy, config = {}) {
        this.strategy = strategy;
        this.config = {
            symbol: config.symbol || 'BTCUSDT',
            interval: config.interval || '5m',
            initialBalance: config.initialBalance || 1000,
            startDate: config.startDate || null,
            endDate: config.endDate || null,
            ...config
        };

        this.balance = {
            usdt: this.config.initialBalance,
            asset: 0
        };

        this.trades = [];
        this.candles = [];
        this.equityHistory = [];
    }

    /**
     * Descarga datos históricos de Binance
     */
    async fetchHistoricalData() {
        logger.info(`📥 Descargando datos históricos de ${this.config.symbol}...`);

        const limit = 1000; // Binance max per request
        const interval = this.config.interval;
        let allCandles = [];
        let currentTime = this.config.startDate ? new Date(this.config.startDate).getTime() : Date.now() - (365 * 24 * 60 * 60 * 1000); // 1 year ago
        const endTime = this.config.endDate ? new Date(this.config.endDate).getTime() : Date.now();

        try {
            while (currentTime < endTime) {
                const response = await axios.get('https://api.binance.com/api/v3/klines', {
                    params: {
                        symbol: this.config.symbol,
                        interval: interval,
                        startTime: currentTime,
                        limit: limit
                    }
                });

                if (response.data.length === 0) break;

                const candles = response.data.map(k => ({
                    openTime: k[0],
                    open: parseFloat(k[1]),
                    high: parseFloat(k[2]),
                    low: parseFloat(k[3]),
                    close: parseFloat(k[4]),
                    volume: parseFloat(k[5]),
                    closeTime: k[6]
                }));

                allCandles = allCandles.concat(candles);
                currentTime = candles[candles.length - 1].closeTime + 1;

                logger.debug(`Descargadas ${allCandles.length} velas...`);
            }

            this.candles = allCandles;
            logger.success(`✅ ${this.candles.length} velas históricas descargadas`);

            // Guardar en archivo para reutilizar
            this.saveToFile();

            return this.candles;
        } catch (error) {
            logger.error(`Error descargando datos históricos: ${error.message}`);
            throw error;
        }
    }

    /**
     * Guarda los datos en archivo CSV
     */
    saveToFile() {
        const dataDir = path.join(__dirname, '../data');
        if (!fs.existsSync(dataDir)) {
            fs.mkdirSync(dataDir, { recursive: true });
        }

        const filename = `${this.config.symbol}_${this.config.interval}_historical.json`;
        const filepath = path.join(dataDir, filename);

        fs.writeFileSync(filepath, JSON.stringify(this.candles, null, 2));
        logger.info(`💾 Datos guardados en: ${filepath}`);
    }

    /**
     * Carga datos desde archivo
     */
    loadFromFile() {
        const filename = `${this.config.symbol}_${this.config.interval}_historical.json`;
        const filepath = path.join(__dirname, '../data', filename);

        if (fs.existsSync(filepath)) {
            this.candles = JSON.parse(fs.readFileSync(filepath, 'utf8'));
            logger.success(`✅ ${this.candles.length} velas cargadas desde archivo`);
            return true;
        }
        return false;
    }

    /**
     * Ejecuta el backtest
     */
    async run() {
        logger.info('🧪 Iniciando Backtesting...');
        logger.info(`💰 Balance inicial: $${this.config.initialBalance} USDT`);

        // Intentar cargar desde archivo, si no, descargar
        if (!this.loadFromFile()) {
            await this.fetchHistoricalData();
        }

        if (this.candles.length < 200) {
            throw new Error('No hay suficientes datos históricos para el backtest (mínimo 200 velas)');
        }

        // Simular trading
        const startTime = Date.now();

        for (let i = 200; i < this.candles.length; i++) {
            const currentCandle = this.candles[i];
            // Optimización: Solo tomar las últimas 1000 velas para calcular indicadores
            const startIndex = Math.max(0, i + 1 - 1000);
            const historicalCandles = this.candles.slice(startIndex, i + 1).map(c => [
                c.openTime,
                c.open,
                c.high,
                c.low,
                c.close,
                c.volume,
                c.closeTime
            ]);

            // Ejecutar estrategia
            const signal = this.strategy.onCandle(
                [currentCandle.openTime, currentCandle.open, currentCandle.high, currentCandle.low, currentCandle.close, currentCandle.volume, currentCandle.closeTime],
                historicalCandles
            );

            if (signal) {
                this.executeTrade(signal, currentCandle);
            }

            // Registrar equity cada 100 velas
            if (i % 100 === 0) {
                this.recordEquity(currentCandle.close);
            }
        }

        const endTime = Date.now();
        const duration = ((endTime - startTime) / 1000).toFixed(2);

        logger.success(`✅ Backtesting completado en ${duration}s`);

        return this.generateReport();
    }

    /**
     * Ejecuta un trade simulado
     */
    executeTrade(signal, candle) {
        const fee = 0.001; // 0.1% fee
        const price = candle.close;

        if (signal.action === 'BUY' && this.balance.usdt > 10) {
            const amountUsd = this.balance.usdt;
            const amountAsset = (amountUsd / price) * (1 - fee);

            this.balance.asset += amountAsset;
            this.balance.usdt = 0;

            this.trades.push({
                type: 'BUY',
                price: price,
                amount: amountAsset,
                timestamp: candle.openTime,
                reason: signal.reason,
                equity: this.balance.asset * price
            });

            logger.debug(`[BACKTEST] BUY @ $${price.toFixed(2)} | Reason: ${signal.reason}`);
        } else if (signal.action === 'SELL' && this.balance.asset > 0) {
            const amountAsset = this.balance.asset;
            const amountUsd = (amountAsset * price) * (1 - fee);

            this.balance.usdt += amountUsd;
            this.balance.asset = 0;

            const lastBuy = [...this.trades].reverse().find(t => t.type === 'BUY');
            const profit = lastBuy ? ((price - lastBuy.price) / lastBuy.price) * 100 : 0;

            this.trades.push({
                type: 'SELL',
                price: price,
                amount: amountAsset,
                timestamp: candle.openTime,
                reason: signal.reason,
                equity: amountUsd,
                profit: profit
            });

            logger.debug(`[BACKTEST] SELL @ $${price.toFixed(2)} | Profit: ${profit.toFixed(2)}% | Reason: ${signal.reason}`);
        }
    }

    /**
     * Registra el equity para el gráfico
     */
    recordEquity(price) {
        const equity = this.balance.usdt + (this.balance.asset * price);
        this.equityHistory.push({
            timestamp: Date.now(),
            value: equity
        });
    }

    /**
     * Genera reporte de resultados
     */
    generateReport() {
        const finalEquity = this.balance.usdt + (this.balance.asset * (this.candles[this.candles.length - 1].close));
        const totalReturn = ((finalEquity - this.config.initialBalance) / this.config.initialBalance) * 100;

        const buyTrades = this.trades.filter(t => t.type === 'BUY');
        const sellTrades = this.trades.filter(t => t.type === 'SELL');

        const winningTrades = sellTrades.filter(t => t.profit > 0);
        const losingTrades = sellTrades.filter(t => t.profit <= 0);

        const winRate = sellTrades.length > 0 ? (winningTrades.length / sellTrades.length) * 100 : 0;

        const avgWin = winningTrades.length > 0
            ? winningTrades.reduce((sum, t) => sum + t.profit, 0) / winningTrades.length
            : 0;

        const avgLoss = losingTrades.length > 0
            ? losingTrades.reduce((sum, t) => sum + Math.abs(t.profit), 0) / losingTrades.length
            : 0;

        const profitFactor = avgLoss > 0 ? avgWin / avgLoss : 0;

        const report = {
            summary: {
                initialBalance: this.config.initialBalance,
                finalEquity: parseFloat(finalEquity.toFixed(2)),
                totalReturn: parseFloat(totalReturn.toFixed(2)),
                totalTrades: this.trades.length,
                buyTrades: buyTrades.length,
                sellTrades: sellTrades.length
            },
            performance: {
                winningTrades: winningTrades.length,
                losingTrades: losingTrades.length,
                winRate: parseFloat(winRate.toFixed(2)),
                avgWin: parseFloat(avgWin.toFixed(2)),
                avgLoss: parseFloat(avgLoss.toFixed(2)),
                profitFactor: parseFloat(profitFactor.toFixed(2))
            },
            trades: this.trades,
            equityHistory: this.equityHistory
        };

        this.printReport(report);
        this.saveReport(report);

        return report;
    }

    /**
     * Imprime el reporte en consola
     */
    printReport(report) {
        console.log('\n');
        console.log('═══════════════════════════════════════════════════════');
        console.log('           📊 REPORTE DE BACKTESTING');
        console.log('═══════════════════════════════════════════════════════');
        console.log('');
        console.log('💰 RESUMEN FINANCIERO:');
        console.log(`   Balance Inicial:    $${report.summary.initialBalance.toFixed(2)}`);
        console.log(`   Balance Final:      $${report.summary.finalEquity.toFixed(2)}`);
        console.log(`   Retorno Total:      ${report.summary.totalReturn > 0 ? '+' : ''}${report.summary.totalReturn}%`);
        console.log('');
        console.log('📈 ESTADÍSTICAS DE TRADING:');
        console.log(`   Total de Trades:    ${report.summary.totalTrades}`);
        console.log(`   Compras:            ${report.summary.buyTrades}`);
        console.log(`   Ventas:             ${report.summary.sellTrades}`);
        console.log('');
        console.log('🎯 RENDIMIENTO:');
        console.log(`   Trades Ganadores:   ${report.performance.winningTrades}`);
        console.log(`   Trades Perdedores:  ${report.performance.losingTrades}`);
        console.log(`   Win Rate:           ${report.performance.winRate}%`);
        console.log(`   Ganancia Promedio:  +${report.performance.avgWin}%`);
        console.log(`   Pérdida Promedio:   -${report.performance.avgLoss}%`);
        console.log(`   Profit Factor:      ${report.performance.profitFactor}`);
        console.log('');
        console.log('═══════════════════════════════════════════════════════');
        console.log('');
    }

    /**
     * Guarda el reporte en archivo
     */
    saveReport(report) {
        const dataDir = path.join(__dirname, '../data');
        if (!fs.existsSync(dataDir)) {
            fs.mkdirSync(dataDir, { recursive: true });
        }

        const timestamp = new Date().toISOString().replace(/:/g, '-').split('.')[0];
        const filename = `backtest_report_${timestamp}.json`;
        const filepath = path.join(dataDir, filename);

        fs.writeFileSync(filepath, JSON.stringify(report, null, 2));
        logger.success(`📄 Reporte guardado en: ${filepath}`);
    }
}

module.exports = BacktestEngine;
