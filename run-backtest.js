#!/usr/bin/env node

/**
 * Script de Backtesting
 * Ejecuta la estrategia contra datos históricos
 */

const BacktestEngine = require('./src/backtest/BacktestEngine');
const BoosisTrend = require('./src/strategies/BoosisTrend');
const logger = require('./src/core/logger');

async function main() {
    try {
        logger.info('🚀 Iniciando Motor de Backtesting de Boosis Bot');

        // Configuración del backtest
        const config = {
            symbol: 'BTCUSDT',
            interval: '5m',
            initialBalance: 1000,
            // Descomentar para fechas específicas:
            // startDate: '2025-01-01',
            // endDate: '2025-12-31'
        };

        // Crear instancia de la estrategia
        const strategy = new BoosisTrend();

        // Crear motor de backtest
        const backtest = new BacktestEngine(strategy, config);

        // Ejecutar backtest
        const report = await backtest.run();

        // Evaluar resultados
        if (report.summary.totalReturn > 0) {
            logger.success(`\n✅ ESTRATEGIA RENTABLE: +${report.summary.totalReturn}%`);
        } else {
            logger.warn(`\n⚠️ ESTRATEGIA NO RENTABLE: ${report.summary.totalReturn}%`);
        }

        if (report.performance.winRate >= 50) {
            logger.success(`✅ WIN RATE ACEPTABLE: ${report.performance.winRate}%`);
        } else {
            logger.warn(`⚠️ WIN RATE BAJO: ${report.performance.winRate}%`);
        }

        if (report.performance.profitFactor >= 1.5) {
            logger.success(`✅ PROFIT FACTOR EXCELENTE: ${report.performance.profitFactor}`);
        } else if (report.performance.profitFactor >= 1.0) {
            logger.warn(`⚠️ PROFIT FACTOR MARGINAL: ${report.performance.profitFactor}`);
        } else {
            logger.error(`❌ PROFIT FACTOR NEGATIVO: ${report.performance.profitFactor}`);
        }

        logger.info('\n💡 Revisa el archivo de reporte en /data para más detalles');

        process.exit(0);
    } catch (error) {
        logger.error(`Error fatal en backtesting: ${error.message}`);
        console.error(error.stack);
        process.exit(1);
    }
}

main();
