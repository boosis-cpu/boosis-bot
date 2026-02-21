
require('dotenv').config();
const { Pool } = require('pg');

async function purgeLegacyPairs() {
    const pool = new Pool({
        host: process.env.DB_HOST,
        user: process.env.DB_USER,
        password: process.env.DB_PASS,
        database: process.env.DB_NAME,
        port: parseInt(process.env.DB_PORT || '5432'),
    });

    try {
        console.log('🧹 Purgando activos obsoletos de la base de datos...');

        // Activos que queremos mantener
        const allowedPairs = ['FETUSDT', 'RENDERUSDT', 'TAOUSDT', 'WLDUSDT', 'NEARUSDT'];

        // Eliminar cualquier par que no esté en la lista permitida
        const result = await pool.query(
            'DELETE FROM active_trading_pairs WHERE symbol NOT IN ($1, $2, $3, $4, $5)',
            allowedPairs
        );

        console.log(`✅ Se han eliminado ${result.rowCount} activos obsoletos (BTC, ETH, etc.).`);

        // También limpiar perfiles de estrategia para esos pares
        const resultProfiles = await pool.query(
            'DELETE FROM strategy_profiles WHERE symbol NOT IN ($1, $2, $3, $4, $5)',
            allowedPairs
        );
        console.log(`✅ Se han eliminado ${resultProfiles.rowCount} perfiles de estrategia obsoletos.`);

    } catch (error) {
        console.error('❌ Error durante la purga:', error);
    } finally {
        await pool.end();
    }
}

purgeLegacyPairs();
