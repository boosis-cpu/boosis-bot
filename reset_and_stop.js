const { Pool } = require('pg');
require('dotenv').config();

/**
 * 🧹 SCRIPT DE LIMPIEZA DE COMBATE v1.0
 * Propósito: Resetear el sistema a $200, borrar historial de ruido y detener toda operación.
 */
async function resetAndStop() {
    const pool = new Pool({
        host: process.env.DB_HOST,
        user: process.env.DB_USER,
        password: process.env.DB_PASS,
        database: process.env.DB_NAME,
        port: parseInt(process.env.DB_PORT || '5432'),
    });

    try {
        console.log('🚀 Iniciando limpieza general del Batallón Boosis...');

        // 1. Detener la vigilancia de todos los pares
        await pool.query('UPDATE active_trading_pairs SET is_active = false');
        console.log('✅ Vigilancia de red detenida (Modo Sentinel en reposo).');

        // 2. Limpiar historial de trades (Ruido de Scalping)
        await pool.query('TRUNCATE TABLE trades RESTART IDENTITY');
        console.log('✅ Historial de trades eliminado (Borrón y cuenta nueva).');

        // 3. Limpiar posiciones activas
        await pool.query('DELETE FROM active_position');
        console.log('✅ Posiciones activas liquidadas en base de datos.');

        // 4. Limpiar órdenes del Sniper
        await pool.query('TRUNCATE TABLE sniper_orders');
        console.log('✅ Órdenes del Sniper Terminal eliminadas.');

        // 5. Resetear Balance a $200.00
        const initialBalance = { usdt: 200.00, asset: 0 };

        // Update bot_state
        await pool.query(
            "INSERT INTO bot_state (key, value) VALUES ('balance', $1) ON CONFLICT (key) DO UPDATE SET value = $1",
            [JSON.stringify(initialBalance)]
        );

        // Update trading_settings (paper_balance)
        await pool.query(
            "INSERT INTO trading_settings (key, value) VALUES ('paper_balance', $1) ON CONFLICT (key) DO UPDATE SET value = $1",
            [JSON.stringify(initialBalance)]
        );

        // Forzar modo PAPER
        await pool.query(
            "INSERT INTO trading_settings (key, value) VALUES ('live_trading', 'false') ON CONFLICT (key) DO UPDATE SET value = 'false'"
        );

        console.log('✅ Balance de simulación reseteado a $200.00 USDT.');
        console.log('✅ Sistema forzado a modo PAPER.');

        // 6. Limpiar Logs físicos
        const fs = require('fs');
        const logPath = './logs/system.log';
        if (fs.existsSync(logPath)) {
            fs.writeFileSync(logPath, '');
            console.log('✅ Logs del sistema vaciados.');
        }

        console.log('\n✨ OPERACIÓN DE LIMPIEZA COMPLETADA CON ÉXITO.');
        console.log('Soldados en barracones. Esperando nuevo plan estratégico.');

    } catch (error) {
        console.error('❌ Error durante la limpieza:', error);
    } finally {
        await pool.end();
    }
}

resetAndStop();
