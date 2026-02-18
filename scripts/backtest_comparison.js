/**
 * BACKTEST COMPARATIVO: v2.5 vs v2.6 Medallion
 * 
 * Este script realiza una simulación de alta fidelidad inyectando velas reales
 * en dos instancias de TradingPairManager con diferentes configuraciones.
 */

const db = require('../src/core/database');
const logger = require('../src/core/logger');
const DataMiner = require('../src/core/data_miner');
const TradingPairManager = require('../src/core/trading-pair-manager');

// Importar Estrategias
const BoosisTrend = require('../src/strategies/BoosisTrend');
const TurtleStrategy = require('../src/strategies/TurtleStrategy');

async function runComparison(symbol, days = 30) {
    logger.info(`\n📊 INICIANDO COMPARATIVA: ${symbol} (${days} días)`);

    // 1. Asegurar Datos en DB
    logger.info(`[Miner] Sincronizando datos...`);
    await DataMiner.mineToDatabase(symbol, '1m', days);

    // 2. Cargar Datos
    const candles = await db.getRecentCandles(symbol, days * 1440);
    logger.info(`[Backtest] ${candles.length} velas cargadas.`);

    if (candles.length < 1000) {
        logger.error('Fondos insuficientes de datos para el backtest.');
        return;
    }

    // 3. Inicializar Entornos

    // --- ESCENARIO v2.5 (Referencia) ---
    // Simulamos la lógica vieja inyectando manualmente los parámetros
    const strategyV25 = new BoosisTrend();
    const managerV25 = new TradingPairManager(symbol, strategyV25);
    // Forzamos configuración v2.5
    managerV25.hmm = new (require('../src/core/hmm-engine'))(3); // 3 estados originales
    managerV25.turtleMode = false; //v2.5 no tenía modo tortuga

    // --- ESCENARIO v2.6 (Medallion Professional) ---
    const strategyV26 = new BoosisTrend(); // Usamos la misma base pero el manager activará TurtleMode
    const managerV26 = new TradingPairManager(symbol, strategyV26);
    // Manager v2.6 ya viene por defecto con 8 estados y TurtleStrategy avanzada

    const results = {
        v25: { balance: 10000, trades: 0, wins: 0, pnl: 0, maxDD: 0, peak: 10000 },
        v26: { balance: 10000, trades: 0, wins: 0, pnl: 0, maxDD: 0, peak: 10000 }
    };

    // 4. Bucle de Simulación (Vela por Vela)
    logger.info(`[Sim] Ejecutando simulación dual...`);

    // Simulamos paso del tiempo
    for (let i = 0; i < candles.length; i++) {
        const candle = candles[i];

        // Ejecutar v2.5
        const signal25 = await managerV25.onCandleClosed(candle);
        if (signal25) {
            handleTrade(results.v25, signal25, managerV25);
        }

        // Ejecutar v2.6
        const signal26 = await managerV26.onCandleClosed(candle);
        if (signal26) {
            handleTrade(results.v26, signal26, managerV26);
        }

        // Update Drawdown track
        updateDD(results.v25);
        updateDD(results.v26);

        if (i % 10000 === 0) logger.debug(`Progreso: ${((i / candles.length) * 100).toFixed(1)}%`);
    }

    // 5. Resultados Finales
    formatReport(symbol, results);
}

function handleTrade(res, signal, manager) {
    if (signal.action === 'BUY') {
        const amount = (res.balance * 0.98) / signal.price;
        manager.recordTrade({
            action: 'OPEN',
            position: { entryPrice: signal.price, amount: amount }
        });
        res.balance -= (amount * signal.price) * 1.001; // Incluye fee
    } else if (signal.action === 'SELL' && manager.activePosition) {
        const pos = manager.activePosition;
        const revenue = (pos.amount * signal.price) * 0.999;
        const pnl = revenue - (pos.amount * pos.entryPrice);

        res.balance += revenue;
        res.trades++;
        if (pnl > 0) res.wins++;
        res.pnl += pnl;

        manager.recordTrade({
            action: 'CLOSE',
            pnlValue: pnl,
            pnl: (signal.price / pos.entryPrice - 1) * 100
        });
    }
}

function updateDD(res) {
    if (res.balance > res.peak) res.peak = res.balance;
    const dd = (res.peak - res.balance) / res.peak;
    if (dd > res.maxDD) res.maxDD = dd;
}

function formatReport(symbol, res) {
    const v25ROI = ((res.v25.balance / 10000) - 1) * 100;
    const v26ROI = ((res.v26.balance / 10000) - 1) * 100;
    const deltaROI = v26ROI - v25ROI;

    console.log(`\n==================================================`);
    console.log(`🏆 REPORTE FINAL: ${symbol}`);
    console.log(`==================================================`);
    console.log(`MÉTRICA        | v2.5 (Old) | v2.6 (Medallion) | Δ`);
    console.log(`--------------------------------------------------`);
    console.log(`Balance Final  | $${res.v25.balance.toFixed(2)} | $${res.v26.balance.toFixed(2)} | +$${(res.v26.balance - res.v25.balance).toFixed(2)}`);
    console.log(`ROI Total      | ${v25ROI.toFixed(2)}% | ${v26ROI.toFixed(2)}% | ${deltaROI > 0 ? '+' : ''}${deltaROI.toFixed(2)}%`);
    console.log(`Max Drawdown   | ${(res.v25.maxDD * 100).toFixed(2)}% | ${(res.v26.maxDD * 100).toFixed(2)}% | ${((res.v25.maxDD - res.v26.maxDD) * 100).toFixed(2)}% mejora`);
    console.log(`Win Rate       | ${((res.v25.wins / (res.v25.trades || 1)) * 100).toFixed(1)}% | ${((res.v26.wins / (res.v26.trades || 1)) * 100).toFixed(1)}% | +${(((res.v26.wins / (res.v26.trades || 1)) - (res.v25.wins / (res.v25.trades || 1))) * 100).toFixed(1)}%`);
    console.log(`Total Trades   | ${res.v25.trades} | ${res.v26.trades} | +${res.v26.trades - res.v25.trades}`);
    console.log(`--------------------------------------------------`);

    if (deltaROI > 0) {
        console.log(`🚀 v2.6 es un ${(deltaROI / (Math.abs(v25ROI) || 1) * 100).toFixed(1)}% más eficiente que v2.5`);
    }
}

// Ejecutar para BTC
runComparison('BTCUSDT', 30); // Empezamos con 30 días para validación rápida
