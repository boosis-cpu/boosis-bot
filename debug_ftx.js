
require('dotenv').config();
const db = require('./src/core/database');
const PatternScanner = require('./src/core/pattern-scanner');

async function debugFTX() {
    await db.connect();
    const start = new Date('2022-10-01').getTime();
    const end = new Date('2022-11-20').getTime();
    const r = await db.pool.query(
        'SELECT open_time, open, high, low, close FROM candles WHERE symbol = $1 AND open_time >= $2 AND open_time <= $3 ORDER BY open_time ASC',
        ['BTCUSDT', start, end]
    );

    console.log(`Velas 1m: ${r.rows.length}`);
    const TF = 14400000;
    const grouped = {};
    for (const row of r.rows) {
        const t = Math.floor(parseInt(row.open_time) / TF) * TF;
        if (!grouped[t]) grouped[t] = [];
        grouped[t].push(row);
    }
    const candles4h = Object.entries(grouped).map(([t, g]) => [
        parseInt(t), 0, Math.max(...g.map(x => parseFloat(x.high))), Math.min(...g.map(x => parseFloat(x.low))), parseFloat(g[g.length - 1].close), 0
    ]).sort((a, b) => a[0] - b[0]);

    const scanner = new PatternScanner();
    // Use the 4% threshold from our current scanner
    const zz = scanner._buildZigZag(candles4h, 0.04);

    console.log(`Velas 4H: ${candles4h.length}`);
    console.log(`ZigZag Points (4%): ${zz.length}`);
    zz.forEach(p => {
        const date = new Date(candles4h[p.idx][0]).toLocaleDateString('es-MX', { month: 'short', day: '2-digit' });
        console.log(`${date} | ${p.type.padEnd(4)} | $${p.price.toFixed(0)}`);
    });

    // Check last detection logic
    const lastWindow = candles4h;
    const p = scanner.detect(lastWindow[lastWindow.length - 1], lastWindow);
    console.log('\nÚltima vela detecta:', p ? p.type : 'NADA');

    await db.pool.end();
}
debugFTX();
