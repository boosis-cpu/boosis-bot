const crypto = require('crypto');
const db = require('./database');

class SimpleAuth {
    constructor() {
        this.adminPassword = process.env.ADMIN_PASSWORD;

        if (!this.adminPassword) {
            console.error('ERROR: ADMIN_PASSWORD no configurado en .env');
        }
    }

    async generateToken(password) {
        if (password !== this.adminPassword) {
            return null;
        }

        const token = crypto.randomBytes(32).toString('hex');
        const expiry = Date.now() + (24 * 60 * 60 * 1000); // 24 horas

        // Persistir en DB
        await db.pool.query('INSERT INTO sessions (token, expiry) VALUES ($1, $2)', [token, expiry]);

        return token;
    }

    async verifyToken(token) {
        if (!token) return false;

        try {
            const res = await db.pool.query('SELECT expiry FROM sessions WHERE token = $1', [token]);

            if (res.rows.length === 0) return false;

            const expiry = parseInt(res.rows[0].expiry);

            if (Date.now() > expiry) {
                await this.revokeToken(token);
                return false;
            }

            return true;
        } catch (err) {
            console.error('[AUTH] Error verificando token:', err);
            return false;
        }
    }

    async revokeToken(token) {
        await db.pool.query('DELETE FROM sessions WHERE token = $1', [token]);
    }
}

module.exports = new SimpleAuth();
