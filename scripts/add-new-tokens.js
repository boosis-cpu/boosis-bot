require('dotenv').config();
const db = require('../src/core/database');

async function addTokens() {
    try {
        await db.connect();
        console.log('📡 Conectado a la base de datos...');

        const newTokens = [
            ['FETUSDT', 'BoosisScalper'],
            ['RENDERUSDT', 'BoosisScalper'],
            ['TAOUSDT', 'BoosisScalper'],
            ['WLDUSDT', 'BoosisScalper'],
            ['NEARUSDT', 'BoosisScalper']
        ];

        for (const [symbol, strategy] of newTokens) {
            // Usar ON CONFLICT para no duplicar si ya existen
            await db.pool.query(
                'INSERT INTO active_trading_pairs (symbol, strategy_name, is_active) VALUES ($1, $2, true) ON CONFLICT (symbol) DO UPDATE SET is_active = true',
                [symbol, strategy]
            );
            console.log(`✅ Token agregado/activado en el bot: ${symbol} (${strategy})`);
        }

        console.log('\n🚀 ¡Nuevos tokens habilitados en la base de datos!');
        process.exit(0);
    } catch (err) {
        console.error('❌ Error agregando tokens:', err.message);
        process.exit(1);
    }
}

addTokens();
