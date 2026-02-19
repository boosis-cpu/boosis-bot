
require('dotenv').config();
const db = require('./src/core/database');
const PatternScanner = require('./src/core/pattern-scanner');

async function run2022CrashTest() {
    try {
        console.log('--- TEST PATTERN SCANNER: EL CRASH DE 2022 ---');
        await db.connect();

        const since = new Date('2022-01-01').getTime();
        const until = new Date('2022-12-31').getTime();

        console.log('Cargando velas de 2022 (BTCUSDT)...');
        const r = await db.pool.query(
            'SELECT open_time, open, high, low, close, volume FROM candles WHERE symbol = $1 AND open_time >= $2 AND open_time <= $3 ORDER BY open_time ASC',
            ['BTCUSDT', since, until]
        );

        if (r.rows.length === 0) {
            console.log('No se encontraron datos para 2022.');
            return;
        }

        console.log(`Velas 1m cargadas: ${r.rows.length}`);

        // Agregación a 4H
        const TF = 14400000; // 4h
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
            g.reduce((a, b) => a + parseFloat(b.volume), 0)
        ]).sort((a, b) => a[0] - b[0]);

        console.log(`Velas 4H generadas: ${candles4h.length}`);

        const scanner = new PatternScanner();
        let found = 0;

        console.log('\nFECHA      | PRECIO | PATRÓN | DIRECCIÓN | CONF | DESCRIPCIÓN');
        console.log('-----------|--------|--------|-----------|------|------------');

        for (let i = 50; i < candles4h.length; i++) {
            const window = candles4h.slice(0, i + 1);
            const p = scanner.detect(window[window.length - 1], window);

            if (p && p.detected) {
                found++;
                const date = new Date(window[i][0]).toLocaleDateString('es-MX', { month: 'short', day: '2-digit' });
                const price = parseFloat(window[i][4]).toLocaleString('en-US', { maximumFractionDigits: 0 });
                console.log(`${date.padEnd(10)} | $${price.padStart(6)} | ${p.type.padEnd(7)} | ${p.direction.padEnd(9)} | ${p.confidence.toFixed(2)} | ${p.description}`);
            }
        }

        console.log(`\n--- RESULTADO FINAL ---`);
        console.log(`Total detectado en 2022: ${found} patrones`);
        if (found > 0) console.log('✅ El scanner identifica estructuras durante el ciclo de 2022.');
        else console.log('❌ No se detectaron patrones en 2022.');

    } catch (e) {
        console.error('Error:', e);
    } finally {
        await db.pool.end();
    }
}

run2022CrashTest();
