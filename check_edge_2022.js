
require('dotenv').config();
const db = require('./src/core/database');
const PatternScanner = require('./src/core/pattern-scanner');

async function checkEdge() {
    await db.connect();
    console.log('--- Analizando Edge de PatternScanner en 2022 ---');

    try {
        const since = new Date('2022-01-01').getTime();
        const until = new Date('2022-12-31').getTime();

        console.log('Leyendo velas 1m de la DB...');
        const r = await db.pool.query(
            'SELECT open_time, open, high, low, close, volume FROM candles WHERE symbol=$1 AND open_time >= $2 AND open_time <= $3 ORDER BY open_time ASC',
            ['BTCUSDT', since, until]
        );

        console.log(`Velas 1m recuperadas: ${r.rows.length}`);

        const TF = 4 * 60 * 60 * 1000;
        const grouped = {};
        for (const row of r.rows) {
            const time = parseInt(row.open_time);
            const t = Math.floor(time / TF) * TF;
            if (!grouped[t]) grouped[t] = [];
            grouped[t].push([
                time,
                parseFloat(row.open),
                parseFloat(row.high),
                parseFloat(row.low),
                parseFloat(row.close),
                parseFloat(row.volume)
            ]);
        }

        const candles4h = Object.entries(grouped).map(([t, g]) => [
            parseInt(t),
            g[0][1],
            Math.max(...g.map(c => c[2])),
            Math.min(...g.map(c => c[3])),
            g[g.length - 1][4],
            g.reduce((s, c) => s + c[5], 0)
        ]).sort((a, b) => a[0] - b[0]);

        console.log(`Velas 4H generadas: ${candles4h.length}`);

        const scanner = new PatternScanner();
        let found = 0, bullish = 0, bearish = 0;

        console.log('Escaneando patrones...');
        for (let i = 50; i < candles4h.length; i++) {
            const sub = candles4h.slice(0, i + 1);
            const lastCandle = sub[sub.length - 1];
            const p = scanner.detect(lastCandle, sub);
            if (p && p.detected) {
                found++;
                if (p.direction === 'BEARISH') bearish++;
                else bullish++;
            }
        }

        console.log('\n─────────────────────────────────');
        console.log(`Total Alertas: ${found}`);
        console.log(`BEARISH (Venta): ${bearish}`);
        console.log(`BULLISH (Compra): ${bullish}`);
        console.log(`Edge Bearish: ${found > 0 ? ((bearish / found) * 100).toFixed(1) : 0}%`);
        console.log('─────────────────────────────────');

        process.exit(0);
    } catch (err) {
        console.error('Error:', err);
        process.exit(1);
    }
}

checkEdge();
