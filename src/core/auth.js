const crypto = require('crypto');
const { Pool } = require('pg');

class SimpleAuth {
    constructor() {
        this.adminPassword = process.env.ADMIN_PASSWORD;

        if (!this.adminPassword) {
            throw new Error('ERROR: ADMIN_PASSWORD no configurado en .env');
        }

        // Conexión a PostgreSQL para persistir tokens
        this.pool = new Pool({
            user: process.env.DB_USER,
            host: process.env.DB_HOST,
            database: process.env.DB_NAME,
            password: process.env.DB_PASS,
            port: process.env.DB_PORT || 5432,
        });

        this._initDatabase();
    }

    async _initDatabase() {
        try {
            // Crear tabla de tokens si no existe
            await this.pool.query(`
                CREATE TABLE IF NOT EXISTS auth_tokens (
                    token VARCHAR(64) PRIMARY KEY,
                    expiry BIGINT NOT NULL,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                );
                CREATE INDEX IF NOT EXISTS idx_expiry ON auth_tokens(expiry);
            `);

            // Limpiar tokens expirados al iniciar
            await this.pool.query('DELETE FROM auth_tokens WHERE expiry < $1', [Date.now()]);
        } catch (error) {
            console.error('Error inicializando tabla de tokens:', error.message);
        }
    }

    async generateToken(password) {
        if (password !== this.adminPassword) {
            return null;
        }

        const token = crypto.randomBytes(32).toString('hex');
        const expiry = Date.now() + (24 * 60 * 60 * 1000); // 24 horas

        try {
            // Guardar token en base de datos
            await this.pool.query(
                'INSERT INTO auth_tokens (token, expiry) VALUES ($1, $2) ON CONFLICT (token) DO UPDATE SET expiry = $2',
                [token, expiry]
            );
            return token;
        } catch (error) {
            console.error('Error guardando token:', error.message);
            return null;
        }
    }

    async verifyToken(token) {
        try {
            const result = await this.pool.query(
                'SELECT expiry FROM auth_tokens WHERE token = $1',
                [token]
            );

            if (result.rows.length === 0) return false;

            const expiry = parseInt(result.rows[0].expiry);

            if (Date.now() > expiry) {
                // Token expirado, eliminarlo
                await this.pool.query('DELETE FROM auth_tokens WHERE token = $1', [token]);
                return false;
            }

            return true;
        } catch (error) {
            console.error('Error verificando token:', error.message);
            return false;
        }
    }

    async revokeToken(token) {
        try {
            await this.pool.query('DELETE FROM auth_tokens WHERE token = $1', [token]);
            return true;
        } catch (error) {
            console.error('Error revocando token:', error.message);
            return false;
        }
    }

    async cleanExpiredTokens() {
        try {
            await this.pool.query('DELETE FROM auth_tokens WHERE expiry < $1', [Date.now()]);
        } catch (error) {
            console.error('Error limpiando tokens expirados:', error.message);
        }
    }
}

module.exports = new SimpleAuth();
