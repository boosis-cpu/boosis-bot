
require('dotenv').config();
const db = require('./src/core/database');
const PatternScanner = require('./src/core/pattern-scanner');

async function analyzeUserDates() {
    try {
        await db.connect();
        const scanner = new PatternScanner();

        const periods = [
            { name: 'Mayo 2021 (Peak & Crash)', start: '2021-04-15', end: '2021-05-30' },
            { name: 'Abril 2024 (Halving / Sells)', start: '2024-03-25', end: '2024-04-30' }
        ];

        for (const period of periods) {
            console.log(`\n--- ANALIZANDO: ${period.name} ---`);
            const start = new Date(period.start).getTime();
            const end = new Date(period.end).getTime();
            const buffer = 60 * 24 * 60 * 60 * 1000;

            const r = await db.pool.query(
                'SELECT open_time, open, high, low, close FROM candles WHERE symbol = $1 AND open_time >= $2 AND open_time <= $3 ORDER BY open_time ASC',
                ['BTCUSDT', start - buffer, end]
            );

            if (r.rows.length === 0) {
                console.log(`No hay datos para ${period.name}`);
                continue;
            }

            const TF = 14400000;
            const grouped = {};
            for (const row of r.rows) {
                const t = Math.floor(parseInt(row.open_time) / TF) * TF;
                if (!grouped[t]) grouped[t] = [];
                grouped[t].push(row);
            }
            const candles4h = Object.entries(grouped).map(([t, g]) => [
                parseInt(t),
                parseFloat(g[0].open),
                Math.max(...g.map(x => parseFloat(x.high))),
                Math.min(...g.map(x => parseFloat(x.low))),
                parseFloat(g[g.length - 1].close),
                0
            ]).sort((a, b) => a[0] - b[0]);

            for (let i = 50; i < candles4h.length; i++) {
                if (candles4h[i][0] < start) continue;
                const window = candles4h.slice(0, i + 1);
                const p = scanner.detect(window[window.length - 1], window);
                if (p && p.detected) {
                    console.log(`${new Date(candles4h[i][0]).toLocaleDateString('es-MX')} | $${candles4h[i][4]} | ${p.type} ${p.subType || ''} | ${p.direction}`);
                }
            }
        }
    } catch (e) { console.error(e); }
    finally { await db.pool.end(); }
}
analyzeUserDates();
