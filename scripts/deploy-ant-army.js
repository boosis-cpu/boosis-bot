const db = require('../src/core/database');
require('dotenv').config();

async function deploy() {
    try {
        await db.connect();
        console.log('📡 Conectado a la base de datos...');

        // 1. Limpiar pares anteriores
        await db.pool.query('DELETE FROM active_trading_pairs');
        console.log('🧹 Limpieza de pares completada.');

        // 2. Insertar el Nuevo Batallón (BoosisScalper)
        const pairs = [
            ['BTCUSDT', 'BoosisScalper'],
            ['SOLUSDT', 'BoosisScalper'],
            ['PEPEUSDT', 'BoosisScalper'],
            ['WIFUSDT', 'BoosisScalper'],
            ['BONKUSDT', 'BoosisScalper'],
            ['DOGEUSDT', 'BoosisScalper'],
            ['SHIBUSDT', 'BoosisScalper']
        ];

        for (const [symbol, strategy] of pairs) {
            await db.pool.query(
                'INSERT INTO active_trading_pairs (symbol, strategy_name, is_active) VALUES ($1, $2, true)',
                [symbol, strategy]
            );
            console.log(`✅ Soldado desplegado: ${symbol} (${strategy})`);
        }

        // 3. Ajustar Balance a $200 USD
        const newBalance = JSON.stringify({ usdt: 200, asset: 0 });
        await db.pool.query(
            'INSERT INTO trading_settings (key, value) VALUES ($1, $2) ON CONFLICT (key) DO UPDATE SET value = $2',
            ['paper_balance', newBalance]
        );
        console.log('💰 Balance de simulación ajustado a $200 USD.');

        console.log('\n🚀 ¡EJÉRCITO DE HORMIGAS LISTO PARA LA BATALLA!');
        process.exit(0);
    } catch (err) {
        console.error('❌ Error en el despliegue:', err.message);
        process.exit(1);
    }
}

deploy();
