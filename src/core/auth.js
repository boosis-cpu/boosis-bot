
const crypto = require('crypto');
const db = require('./database');
const logger = require('./logger');

class SimpleAuth {
    constructor() {
        this.adminPassword = process.env.ADMIN_PASSWORD;

        if (!this.adminPassword) {
            throw new Error('ADMIN_PASSWORD is required in environment variables. Cannot start without it.');
        }
    }

    async generateToken(password) {
        if (password !== this.adminPassword) {
            return null;
        }

        const token = crypto.randomBytes(32).toString('hex');
        const expiry = Date.now() + (24 * 60 * 60 * 1000); // 24 horas

        try {
            // Guardar token en base de datos (Using 'sessions' table as per origin/main)
            await db.pool.query(
                'INSERT INTO sessions (token, expiry) VALUES ($1, $2) ON CONFLICT (token) DO UPDATE SET expiry = $2',
                [token, expiry]
            );
            return token;
        } catch (error) {
            logger.error('Error guardando token:', error.message);
            return null;
        }
    }

    async verifyToken(token) {
        if (!token) return false;

        try {
            const result = await db.pool.query(
                'SELECT expiry FROM sessions WHERE token = $1',
                [token]
            );

            if (result.rows.length === 0) return false;

            const expiry = parseInt(result.rows[0].expiry);

            if (Date.now() > expiry) {
                // Token expirado, eliminarlo
                await this.revokeToken(token);
                return false;
            }

            return true;
        } catch (error) {
            logger.error('Error verificando token:', error.message);
            return false;
        }
    }

    async revokeToken(token) {
        try {
            await db.pool.query('DELETE FROM sessions WHERE token = $1', [token]);
            return true;
        } catch (error) {
            logger.error('Error revocando token:', error.message);
            return false;
        }
    }

    async cleanExpiredTokens() {
        try {
            await db.pool.query('DELETE FROM sessions WHERE expiry < $1', [Date.now()]);
        } catch (error) {
            logger.error('Error limpiando tokens expirados:', error.message);
        }
    }
}

module.exports = new SimpleAuth();
