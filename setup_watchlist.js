const { Pool } = require('pg');
require('dotenv').config();

const SYMBOLS = ['BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'PEPEUSDT', 'WIFUSDT', 'BONKUSDT', 'DOGEUSDT', 'SHIBUSDT', 'LINKUSDT', 'XRPUSDT', 'ADAUSDT', 'AVAXUSDT'];

async function setupWatchlist() {
    const pool = new Pool({
        host: process.env.DB_HOST,
        user: process.env.DB_USER,
        password: process.env.DB_PASS,
        database: process.env.DB_NAME,
        port: parseInt(process.env.DB_PORT || '5432'),
    });

    try {
        console.log('📡 Configurando Vigilancia Quant (Precios SÍ, Trading NO)...');

        // 1. Activar todos los símbolos en DB para que el bot los cargue
        for (const symbol of SYMBOLS) {
            await pool.query(
                'INSERT INTO active_trading_pairs (symbol, strategy_name, is_active) VALUES ($1, $2, true) ON CONFLICT (symbol) DO UPDATE SET is_active = true',
                [symbol, 'BoosisTrend']
            );
        }
        console.log(`✅ ${SYMBOLS.length} símbolos activados para vigilancia.`);

        // 2. Bloquear el trading GLOBALMENTE
        await pool.query(
            "INSERT INTO trading_settings (key, value) VALUES ('trading_locked', 'true') ON CONFLICT (key) DO UPDATE SET value = 'true'"
        );
        console.log('✅ TRADING LOCK: ACTIVADO (Ninguna hormiga podrá disparar).');

    } catch (e) {
        console.error(e);
    } finally {
        await pool.end();
    }
}

setupWatchlist();
