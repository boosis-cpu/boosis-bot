require('dotenv').config();
const db = require('./src/core/database');
const schema = require('./src/core/database-schema');
const profileManager = require('./src/core/strategy-profile-manager');

async function setup() {
    try {
        console.log('🚀 Iniciando Setup de FASE 8...');

        // Conectar e inicializar esquema
        await db.connect();
        await schema.init(db.pool);

        // 1. Configurar Perfiles Óptimos (Predichos por Auditor/The Refinery)
        // BTCUSDT
        await profileManager.upsertProfile('BTCUSDT', {
            rsi: { buy: 25, sell: 75 },
            ema: { short: 12, long: 26, trend: 50 },
            bb: { period: 20, stdDev: 2.0 },
            stopLoss: 0.02
        });

        // ETHUSDT
        await profileManager.upsertProfile('ETHUSDT', {
            rsi: { buy: 30, sell: 70 },
            ema: { short: 12, long: 26, trend: 50 },
            bb: { period: 20, stdDev: 2.0 },
            stopLoss: 0.02
        });

        // XRPUSDT
        await profileManager.upsertProfile('XRPUSDT', {
            rsi: { buy: 20, sell: 80 },
            ema: { short: 12, long: 26, trend: 50 },
            bb: { period: 20, stdDev: 2.0 },
            stopLoss: 0.02
        });

        // 2. Activar Pares de Trading
        await db.pool.query('DELETE FROM active_trading_pairs'); // Limpiar para setup fresco
        await db.pool.query(`
      INSERT INTO active_trading_pairs (symbol, strategy_name) VALUES
      ('BTCUSDT', 'BoosisTrend'),
      ('ETHUSDT', 'Momentum'),
      ('XRPUSDT', 'MeanReversion')
      ON CONFLICT DO NOTHING
    `);

        // 3. Inicializar Balance de Prueba ($10k)
        const initialBalance = {
            usdt: 10000,
            asset: 0
        };
        await db.pool.query(`
      INSERT INTO trading_settings (key, value) 
      VALUES ($1, $2) 
      ON CONFLICT (key) DO UPDATE SET value = $2
    `, ['paper_balance', JSON.stringify(initialBalance)]);

        console.log('✅ FASE 8: Perfiles y Pares configurados correctamente.');
        process.exit(0);
    } catch (error) {
        console.error('❌ Error en el setup:', error);
        process.exit(1);
    }
}

setup();
