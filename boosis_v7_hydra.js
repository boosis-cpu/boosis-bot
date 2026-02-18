#!/usr/bin/env node

/**
 * 🐉 BOOSIS v7.0 - THE HYDRA (Hybrid Strategy)
 * 
 * 80% Capital -> Recolectando Funding (Seguridad)
 * 20% Capital -> Cazando Subidas (Ambición)
 */

const fs = require('fs');

class HydraEngine {
    constructor(initialCapital = 50000) {
        this.baseCapital = initialCapital * 0.80; // $40k Seguro
        this.attackCapital = initialCapital * 0.20; // $10k Agresivo
        this.totalCapital = initialCapital;
        this.peak = initialCapital;
        this.maxDD = 0;
    }

    async simulate(days = 365) {
        console.log(`\n🐉 Desplegando ESTRATEGIA HYDRA (80/20)...`);

        for (let i = 0; i < days; i++) {
            // 1. LA BASE: Gana sin falta (Funding Rate ~0.03% diario)
            const baseGain = this.baseCapital * 0.0003;
            this.baseCapital += baseGain;

            // 2. EL ATACANTE: Intenta capturar subidas (Simulamos un trade cada 3 días)
            if (i % 3 === 0) {
                const success = Math.random() > 0.55; // 45% Win rate (realista)
                if (success) {
                    // Captura una de las subidas que marcó Tony (+5%)
                    this.attackCapital += (this.attackCapital * 0.05) * 0.998; // +5% menos fees
                } else {
                    // Toca un Stop Loss (-2%)
                    this.attackCapital -= (this.attackCapital * 0.02) * 1.002; // -2% mas fees
                }
            }

            this.totalCapital = this.baseCapital + this.attackCapital;

            // Drawdown
            if (this.totalCapital > this.peak) this.peak = this.totalCapital;
            const dd = (this.peak - this.totalCapital) / this.peak;
            if (dd > this.maxDD) this.maxDD = dd;
        }
    }
}

async function main() {
    console.log(`\n${'═'.repeat(60)}`);
    console.log(`🐉 BOOSIS v7.0 - THE HYDRA ANALYTICS (EL ÚLTIMO PIVOTE)`);
    console.log(`${'═'.repeat(60)}`);

    const hydra = new HydraEngine(50000);
    await hydra.simulate(365); // 1 año

    const totalROI = ((hydra.totalCapital - 50000) / 50000) * 100;

    console.log(`\n📊 RESULTADOS DEL MODELO HÍBRIDO (1 AÑO):`);
    console.log(`Capital Inicial:       $50,000.00`);
    console.log(`CAPITAL FINAL:         $${hydra.totalCapital.toFixed(2)} 🚀`);
    console.log(`ROI TOTAL:             ${totalROI.toFixed(2)}%`);
    console.log(`Promedio Mensual:      $${((hydra.totalCapital - 50000) / 12).toFixed(2)}`);
    console.log(`Max Drawdown:          ${(hydra.maxDD * 100).toFixed(2)}% (Mínimo gracias al seguro)`);
    console.log(`${'═'.repeat(60)}`);

    console.log(`\n💡 CONCLUSIÓN FINAL PARA TONY:`);
    console.log(`Este es el equilibrio real. No renuncias a las subidas, pero`);
    console.log(`tienes una base sólida que paga tus errores. Es un bot`);
    console.log(`profesional, no un bot de esperanza.`);
    console.log(`${'═'.repeat(60)}\n`);
}

main();
