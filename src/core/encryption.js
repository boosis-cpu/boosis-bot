// src/core/encryption.js
const crypto = require('crypto');

class Encryption {
    constructor() {
        this.masterKey = process.env.ENCRYPTION_MASTER_KEY || 'default-dev-key-change-in-prod';
        this.algorithm = 'aes-256-cbc';
    }

    // Encriptar datos
    encrypt(plaintext) {
        try {
            const iv = crypto.randomBytes(16);
            const cipher = crypto.createCipheriv(
                this.algorithm,
                Buffer.from(this.masterKey.padEnd(32, '0').slice(0, 32)),
                iv
            );

            let encrypted = cipher.update(plaintext, 'utf8', 'hex');
            encrypted += cipher.final('hex');

            // Devolver IV + encrypted (necesario para desencriptar)
            return `${iv.toString('hex')}:${encrypted}`;
        } catch (error) {
            console.error('[Encryption] Error encriptando:', error.message);
            throw error;
        }
    }

    // Desencriptar datos
    decrypt(encryptedData) {
        try {
            const [ivHex, encrypted] = encryptedData.split(':');
            const iv = Buffer.from(ivHex, 'hex');

            const decipher = crypto.createDecipheriv(
                this.algorithm,
                Buffer.from(this.masterKey.padEnd(32, '0').slice(0, 32)),
                iv
            );

            let decrypted = decipher.update(encrypted, 'hex', 'utf8');
            decrypted += decipher.final('utf8');

            return decrypted;
        } catch (error) {
            console.error('[Encryption] Error desencriptando:', error.message);
            throw error;
        }
    }

    // Hash de contraseña (para sesiones)
    hash(plaintext) {
        return crypto.createHash('sha256').update(plaintext).digest('hex');
    }
}

module.exports = new Encryption();
