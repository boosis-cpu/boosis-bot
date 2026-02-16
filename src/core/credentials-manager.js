// src/core/credentials-manager.js
const encryption = require('./encryption');
const db = require('./database');
const logger = require('./logger');

class CredentialsManager {
    // Guardar credenciales encriptadas
    async saveCredentials(exchange, apiKey, apiSecret) {
        try {
            const encryptedKey = encryption.encrypt(apiKey);
            const encryptedSecret = encryption.encrypt(apiSecret);

            // Si ya existe, actualizar; si no, insertar
            await db.pool.query(`
        INSERT INTO api_credentials (exchange, api_key_encrypted, api_secret_encrypted)
        VALUES ($1, $2, $3)
        ON CONFLICT (user_id, exchange) 
        DO UPDATE SET 
          api_key_encrypted = $2,
          api_secret_encrypted = $3,
          updated_at = CURRENT_TIMESTAMP
      `, [exchange, encryptedKey, encryptedSecret]);

            logger.info(`[Credentials] Credenciales guardadas para ${exchange}`);
            return true;
        } catch (error) {
            logger.error('[Credentials] Error guardando:', error.message);
            throw error;
        }
    }

    // Obtener credenciales desencriptadas
    async getCredentials(exchange) {
        try {
            const result = await db.pool.query(`
        SELECT api_key_encrypted, api_secret_encrypted, last_used
        FROM api_credentials
        WHERE exchange = $1 AND is_active = true
      `, [exchange]);

            if (result.rows.length === 0) {
                throw new Error(`No credentials found for ${exchange}`);
            }

            const row = result.rows[0];
            const apiKey = encryption.decrypt(row.api_key_encrypted);
            const apiSecret = encryption.decrypt(row.api_secret_encrypted);

            // Actualizar last_used
            await db.pool.query(`
        UPDATE api_credentials 
        SET last_used = CURRENT_TIMESTAMP 
        WHERE exchange = $1
      `, [exchange]);

            return { apiKey, apiSecret };
        } catch (error) {
            logger.error('[Credentials] Error obteniendo:', error.message);
            throw error;
        }
    }

    // Verificar si existen credenciales
    async hasCredentials(exchange) {
        try {
            const result = await db.pool.query(`
        SELECT COUNT(*) FROM api_credentials 
        WHERE exchange = $1 AND is_active = true
      `, [exchange]);

            return parseInt(result.rows[0].count) > 0;
        } catch (error) {
            logger.error('[Credentials] Error verificando:', error.message);
            return false;
        }
    }

    // Desactivar credenciales (no borrar, mantener auditoría)
    async deactivateCredentials(exchange) {
        try {
            await db.pool.query(`
        UPDATE api_credentials 
        SET is_active = false 
        WHERE exchange = $1
      `, [exchange]);

            logger.info(`[Credentials] Credenciales desactivadas para ${exchange}`);
            return true;
        } catch (error) {
            logger.error('[Credentials] Error desactivando:', error.message);
            throw error;
        }
    }
}

module.exports = new CredentialsManager();
