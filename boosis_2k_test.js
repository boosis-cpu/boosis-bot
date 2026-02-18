#!/usr/bin/env node

/**
 * 📈 BOOSIS SMALL ACCOUNT TEST ($2,000)
 * 
 * ¿Vale la pena con 2k?
 */

const fs = require('fs');

class SmallAccountTest {
    constructor(initialCapital = 2000) {
        this.capital = initialCapital;
        this.initialCapital = initialCapital;
        this.trades = [];
    }

    async simulate(days = 365) {
        let currentCapital = this.capital;

        for (let i = 0; i < days; i++) {
            // Con 2k no hacemos Funding Harvester, vamos 100% a trades de alta probabilidad (Swing)
            // Simulamos 1 trade por semana (52 trades al año)
            if (i % 7 === 0) {
                const win = Math.random() > 0.52; // 48% Win Rate (realista)
                if (win) {
                    // Ganancia de +10% (capturando una subida real en una Altcoin)
                    currentCapital += (currentCapital * 0.10) * 0.998;
                    this.trades.push(1);
                } else {
                    // Pérdida de -4% (Standard Stop Loss)
                    currentCapital -= (currentCapital * 0.04) * 1.002;
                    this.trades.push(0);
                }
            }
        }
        this.capital = currentCapital;
    }
}

async function main() {
    console.log(`\n🧪 PROBANDO MODELO DE CRECIMIENTO CON $2,000...`);
    const test = new SmallAccountTest(2000);
    await test.simulate(365);

    const roi = ((test.capital - 2000) / 2000) * 100;

    console.log(`\n${'═'.repeat(60)}`);
    console.log(`📊 REPORTE "SMALL ACCOUNT" ($2,000)`);
    console.log(`${'═'.repeat(60)}`);
    console.log(`Capital Inicial:   $2,000.00`);
    console.log(`CAPITAL FINAL:     $${test.capital.toFixed(2)}`);
    console.log(`ROI TOTAL (1 Año): ${roi.toFixed(2)}%`);
    console.log(`Trades Totales:    ${test.trades.length} (Baja frecuencia)`);
    console.log(`Ganancia Prom Mensual: $${((test.capital - 2000) / 12).toFixed(2)}`);
    console.log(`${'═'.repeat(60)}\n`);
}

main();
