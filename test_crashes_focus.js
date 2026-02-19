
require('dotenv').config();
const db = require('./src/core/database');
const PatternScanner = require('./src/core/pattern-scanner');

async function runCrashFocusTest() {
    try {
        console.log('--- ENFOCANDO EN LOS CRASHES DE 2022 ---');
        await db.connect();

        // Periodos clave: 
        // 1. Luna/UST (Abril-Mayo 2022)
        // 2. FTX (Noviembre 2022)
        const periods = [
            { name: 'Luna/UST Crash', start: '2022-04-15', end: '2022-05-30' },
            { name: 'FTX Crash', start: '2022-10-25', end: '2022-11-20' }
        ];

        const scanner = new PatternScanner();

        for (const period of periods) {
            console.log(`\n🔍 Analizando: ${period.name} (${period.start} a ${period.end})`);
            const since = new Date(period.start).getTime();
            const until = new Date(period.end).getTime();

            // Necesitamos un buffer anterior para el ZigZag y HMM
            const bufferStart = since - (60 * 24 * 60 * 60 * 1000); // 60 días de buffer

            const r = await db.pool.query(
                'SELECT open_time, open, high, low, close, volume FROM candles WHERE symbol = $1 AND open_time >= $2 AND open_time <= $3 ORDER BY open_time ASC',
                ['BTCUSDT', bufferStart, until]
            );

            if (r.rows.length === 0) continue;

            const TF = 14400000;
            const grouped = {};
            for (const row of r.rows) {
                const t = Math.floor(parseInt(row.open_time) / TF) * TF;
                if (!grouped[t]) grouped[t] = [];
                grouped[t].push(row);
            }
            const candles4h = Object.entries(grouped).map(([t, g]) => [
                parseInt(t), parseFloat(g[0].open),
                Math.max(...g.map(x => parseFloat(x.high))),
                Math.min(...g.map(x => parseFloat(x.low))),
                parseFloat(g[g.length - 1].close), 0
            ]).sort((a, b) => a[0] - b[0]);

            let periodFound = 0;
            for (let i = 50; i < candles4h.length; i++) {
                const time = candles4h[i][0];
                if (time < since) continue; // Saltar el buffer

                const window = candles4h.slice(0, i + 1);
                const p = scanner.detect(window[window.length - 1], window);

                if (p && p.detected) {
                    periodFound++;
                    const date = new Date(time).toLocaleDateString('es-MX');
                    const price = parseFloat(candles4h[i][4]).toLocaleString('en-US');
                    console.log(`${date} | $${price} | ${p.type} ${p.subType || ''} | ${p.direction} | ${p.description}`);
                }
            }
            console.log(`Total en ${period.name}: ${periodFound}`);
        }

    } catch (e) {
        console.error(e);
    } finally {
        await db.pool.end();
    }
}

runCrashFocusTest();
