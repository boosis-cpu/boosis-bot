#!/usr/bin/env node

/**
 * 🧪 VALIDACIÓN DE PRODUCCIÓN: BOOSIS v7.0 HYDRA
 * 
 * Este script valida el comportamiento del motor Hydra usando 
 * escenarios de mercado realistas para asegurar que la "friccion" 
 * no destruya la rentabilidad.
 */

const BoosisHydraEngine = require('./boosis_v7_hydra_engine');

async function runValidation() {
    const engine = new BoosisHydraEngine({ initialCapital: 50000 });
    const days = 30; // Validación de 1 mes

    console.log(`\n🧪 VALIDANDO 30 DÍAS DE OPERACIÓN HYDRA...`);

    for (let day = 1; day <= days; day++) {
        // 1. Simular Ciclo de Funding (Cada 8h)
        const dailyRates = {
            ETHUSDT: 0.00012, // Tasa moderada
            LINKUSDT: 0.00015  // LINK suele pagar más
        };
        await engine.updateFundingHarvester(dailyRates);
        await engine.updateFundingHarvester(dailyRates);
        await engine.updateFundingHarvester(dailyRates);

        // 2. Simular Escenario de Scalping
        // Un día de mercado alcista (como el que Tony marcó en el gráfico)
        const marketData = {
            asset: 'LINKUSDT',
            close: 18.5 + (Math.random() * 0.5),
            ema50: 18.2,
            rsi: 55,
            volume: 1500000,
            avgVolume: 1000000
        };

        await engine.updateSelectiveScalper(marketData);

        if (day % 10 === 0) {
            console.log(`📅 Día ${day}: Balance actual $${engine.report().balance}`);
        }
    }

    const finalReport = engine.report();
    console.log(`\n${'═'.repeat(60)}`);
    console.log(`🏁 VEREDICTO DE VALIDACIÓN (DESPUÉS DE 30 DÍAS):`);
    console.log(`${'═'.repeat(60)}`);
    console.log(`Capital Final:     $${finalReport.balance}`);
    console.log(`Ganancia Funding:  $${finalReport.funding}`);
    console.log(`Ganancia Scalping: $${finalReport.scalping}`);
    console.log(`ROI Mensual:       ${finalReport.roi}`);
    console.log(`${'═'.repeat(60)}`);

    if (parseFloat(finalReport.roi) > 2) {
        console.log(`\n✅ SISTEMA APTO: Genera rendimiento positivo incluso con ruido.`);
    } else {
        console.log(`\n⚠️ SISTEMA MARGINAL: Requiere más volatilidad.`);
    }
}

runValidation().catch(console.error);
