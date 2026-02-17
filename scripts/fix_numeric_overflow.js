const { Pool } = require('pg');
require('dotenv').config();

async function migrate() {
    const pool = new Pool({
        host: process.env.DB_HOST,
        user: process.env.DB_USER,
        password: process.env.DB_PASS,
        database: process.env.DB_NAME,
        port: process.env.DB_PORT
    });

    try {
        console.log('🚀 Iniciando migración de tipos de datos...');

        await pool.query(`
            ALTER TABLE candles ALTER COLUMN open TYPE NUMERIC;
            ALTER TABLE candles ALTER COLUMN high TYPE NUMERIC;
            ALTER TABLE candles ALTER COLUMN low TYPE NUMERIC;
            ALTER TABLE candles ALTER COLUMN close TYPE NUMERIC;
            ALTER TABLE candles ALTER COLUMN volume TYPE NUMERIC;
            
            ALTER TABLE trades ALTER COLUMN price TYPE NUMERIC;
            ALTER TABLE trades ALTER COLUMN amount TYPE NUMERIC;
            
            ALTER TABLE active_position ALTER COLUMN amount TYPE NUMERIC;
            ALTER TABLE active_position ALTER COLUMN entry_price TYPE NUMERIC;
            
            ALTER TABLE strategy_profiles ALTER COLUMN rsi_buy_bound TYPE NUMERIC;
            ALTER TABLE strategy_profiles ALTER COLUMN rsi_sell_bound TYPE NUMERIC;
            ALTER TABLE strategy_profiles ALTER COLUMN bb_std_dev TYPE NUMERIC;
            ALTER TABLE strategy_profiles ALTER COLUMN stop_loss_percent TYPE NUMERIC;
        `);

        console.log('✅ Migración completada exitosamente.');
    } catch (err) {
        console.error('❌ Error en la migración:', err.message);
    } finally {
        await pool.end();
    }
}

migrate();
