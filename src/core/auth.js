const crypto = require('crypto');

class SimpleAuth {
    constructor() {
        this.adminPassword = process.env.ADMIN_PASSWORD;

        if (!this.adminPassword) {
            throw new Error('ERROR: ADMIN_PASSWORD no configurado en .env');
        }

        this.tokens = new Map(); // token -> expiry_time
    }

    generateToken(password) {
        if (password !== this.adminPassword) {
            return null;
        }

        const token = crypto.randomBytes(32).toString('hex');
        const expiry = Date.now() + (24 * 60 * 60 * 1000); // 24 horas
        this.tokens.set(token, expiry);

        return token;
    }

    verifyToken(token) {
        const expiry = this.tokens.get(token);

        if (!expiry) return false;
        if (Date.now() > expiry) {
            this.tokens.delete(token);
            return false;
        }

        return true;
    }

    revokeToken(token) {
        this.tokens.delete(token);
    }
}

module.exports = new SimpleAuth();
