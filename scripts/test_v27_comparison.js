#!/usr/bin/env node

/**
 * 🏆 TEST COMPARATIVO: v2.6 (Actual) vs v2.7 (Riesgo Profesional)
 * 
 * Valida:
 * 1. ¿Logramos reducir el Drawdown del 49% al 15-20%?
 * 2. ¿Mejora el Calmar Ratio?
 * 3. ¿El sistema es más robusto con Kelly y Circuit Breaker?
 */

require('dotenv').config();

const db = require('../src/core/database');
const logger = require('../src/core/logger');
const HMMEngine = require('../src/core/hmm-engine');
const TurtleStrategy = require('../src/strategies/TurtleStrategy');
const fs = require('fs');

async function runV27Comparison() {
    const symbol = 'BTCUSDT';
    const timeframe = '1d';
    const days = 365 * 5; // 5 años para ver ciclos completos
    const startTime = Date.now();

    logger.info(`\n${'='.repeat(80)}`);
    logger.info(`🏆 TEST COMPARATIVO: v2.6 vs v2.7 (Risk Management Upgrade)`);
    logger.info(`${'='.repeat(80)}\n`);

    try {
        await db.init();
        const candles = await db.getRecentCandles(symbol, days, timeframe);

        if (candles.length < 200) {
            logger.error('No hay suficientes datos diarios en la DB. Corre scripts/test_2d_btc_turtle_daily.js primero.');
            process.exit(1);
        }

        logger.info(`📊 Analizando ${candles.length} velas diarias de ${symbol}...\n`);

        // ═══════════════════════════════════════════════════════════════════════
        // SIMULACIÓN v2.6 (STABLE - REFERENCIA)
        // ═══════════════════════════════════════════════════════════════════════

        logger.info(`[v2.6] Ejecutando simulación de referencia...`);
        const results26 = await runSimulation(candles, false);

        // ═══════════════════════════════════════════════════════════════════════
        // SIMULACIÓN v2.7 (PROFESSIONAL RISK)
        // ═══════════════════════════════════════════════════════════════════════

        logger.info(`[v2.7] Ejecutando simulación con Kelly + Circuit Breaker...`);
        const results27 = await runSimulation(candles, true);

        // ═══════════════════════════════════════════════════════════════════════
        // COMPARATIVA Y REPORTE
        // ═══════════════════════════════════════════════════════════════════════

        console.log(`\n${'█'.repeat(80)}`);
        console.log(`📊 TABLA COMPARATIVA FINAL: v2.6 vs v2.7`);
        console.log(`${'█'.repeat(80)}\n`);

        console.log(`Métrica           v2.6 (Actual)    v2.7 (vRisk)     Mejora / Cambio`);
        console.log(`${'─'.repeat(80)}`);

        const roiDelta = (parseFloat(results27.roi) - parseFloat(results26.roi)).toFixed(2);
        const ddDelta = (parseFloat(results26.maxDrawdown) - parseFloat(results27.maxDrawdown)).toFixed(2);
        const calmar26 = (parseFloat(results26.roi) / 5) / parseFloat(results26.maxDrawdown);
        const calmar27 = (parseFloat(results27.roi) / 5) / parseFloat(results27.maxDrawdown);

        console.log(`ROI Total:        ${results26.roi.padEnd(16)} ${results27.roi.padEnd(16)} ${roiDelta}%`);
        console.log(`Max Drawdown:     ${results26.maxDrawdown.padEnd(16)} ${results27.maxDrawdown.padEnd(16)} ✅ ${ddDelta} pts`);
        console.log(`Calmar Ratio:     ${calmar26.toFixed(2).padEnd(16)} ${calmar27.toFixed(2).padEnd(16)} ✅ ${(calmar27 / calmar26).toFixed(1)}x mejor`);
        console.log(`Win Rate:         ${results26.winRate.padEnd(16)} ${results27.winRate.padEnd(16)} ${(parseFloat(results27.winRate) - parseFloat(results26.winRate)).toFixed(1)}%`);
        console.log(`Final Balance:    $${results26.finalBalance.padEnd(15)} $${results27.finalBalance.padEnd(15)}`);
        console.log(`${'─'.repeat(80)}\n`);

        const verdict = parseFloat(results27.maxDrawdown) < 25
            ? "✅✅ v2.7 ES APTA PARA DINERO REAL (Riesgo controlado)"
            : "⚠️ v2.7 Mejoró pero el riesgo sigue siendo considerable";

        console.log(`\n${'█'.repeat(80)}`);
        console.log(`VEREDICTO: ${verdict}`);
        console.log(`${'█'.repeat(80)}\n`);

        // Guardar
        const finalReport = {
            timestamp: new Date().toISOString(),
            v26: results26,
            v27: results27,
            improvement: {
                ddReduction: ddDelta,
                calmarBoost: (calmar27 / calmar26).toFixed(2)
            }
        };
        fs.writeFileSync('test_v27_comparison.json', JSON.stringify(finalReport, null, 2));

        logger.info(`✅ Reporte guardado en test_v27_comparison.json`);
        process.exit(0);

    } catch (error) {
        logger.error(`❌ Error en Test: ${error.message}`);
        console.error(error);
        process.exit(1);
    }
}

async function runSimulation(candles, useV27) {
    const turtle = new TurtleStrategy(20, 10, 55, 20);
    const hmm = new HMMEngine(8);

    // Desactivar risk manager en turtle si es v2.6 (simulado)
    if (!useV27) {
        // Mocking para que se comporte como v2.6
        turtle.riskManager.calculatePositionSize = (b) => b;
        turtle.riskManager.canTradeToday = () => true;
        turtle.riskManager.updateDrawdown = () => false;
        turtle.riskManager.updateVolatilityScaler = () => { };
    }

    // Entrenar HMM inicial
    await hmm.train(candles.slice(0, 500), 10);

    let balance = 10000;
    let peak = balance;
    let maxDD = 0;
    let activePosition = null;
    const trades = [];

    // Simulación
    for (let i = 500; i < candles.length; i++) {
        const candle = candles[i];
        const close = parseFloat(candle[4]);

        const hmmPred = hmm.predictState(candles.slice(i - 100, i), 'BTCUSDT');

        const signal = turtle.onCandle(
            candle,
            candles.slice(Math.max(0, i - 200), i),
            !!activePosition,
            activePosition,
            balance,
            hmmPred
        );

        // Entrada
        if (!activePosition && signal && signal.action === 'BUY') {
            const entryPrice = close;
            const size = signal.v27?.positionSize || balance * 0.95; // Si no hay v27, usa casi todo (v2.6 style)
            activePosition = {
                entryPrice: entryPrice,
                amount: size / entryPrice,
                target: signal.target || entryPrice * 1.5,
                stopLoss: signal.stopLoss || entryPrice * 0.90,
                entryTime: candle[0]
            };
            balance -= activePosition.amount * entryPrice * 0.0005;
        }

        // Salida
        if (activePosition) {
            let exitPrice = null;
            let reason = '';

            if (close >= activePosition.target) {
                exitPrice = close;
                reason = 'Target';
            } else if (close <= activePosition.stopLoss) {
                exitPrice = close;
                reason = 'StopLoss';
            } else if (signal && signal.action === 'SELL') {
                exitPrice = close;
                reason = 'Turtle';
            }

            if (exitPrice) {
                const pnl = (exitPrice - activePosition.entryPrice) / activePosition.entryPrice;
                balance += activePosition.amount * exitPrice * 0.9995;
                trades.push({ pnl: pnl * 100, success: pnl > 0 });

                // Actualizar risk manager si es v2.7
                if (useV27) {
                    turtle.riskManager.recordTrade(pnl, activePosition.entryPrice, exitPrice, 'BTCUSDT');
                    turtle.riskManager.updateVolatilityScaler(pnl);
                    turtle.riskManager.updateDrawdown(balance);
                }

                activePosition = null;
            }
        }

        const equity = balance + (activePosition ? activePosition.amount * (close - activePosition.entryPrice) : 0);
        if (equity > peak) peak = equity;
        const dd = (peak - equity) / peak;
        if (dd > maxDD) maxDD = dd;
    }

    const roi = ((balance - 10000) / 10000) * 100;
    const wins = trades.filter(t => t.success).length;
    const winRate = (wins / (trades.length || 1)) * 100;

    return {
        roi: roi.toFixed(2),
        maxDrawdown: (maxDD * 100).toFixed(2),
        winRate: winRate.toFixed(1),
        trades: trades.length,
        finalBalance: balance.toFixed(2)
    };
}

runV27Comparison();
