class Validators {
    validateLimit(limit) {
        const parsed = parseInt(limit, 10);
        if (isNaN(parsed) || parsed < 1 || parsed > 1000) {
            throw new Error('limit debe estar entre 1 y 1000');
        }
        return parsed;
    }

    validatePassword(password) {
        if (!password || password.length < 6) {
            throw new Error('Contraseña debe tener al menos 6 caracteres');
        }
        return password;
    }

    validateSymbol(symbol) {
        const valid = ['BTCUSDT', 'ETHUSDT', 'BNBUSDT', 'SOLUSDT', 'XRPUSDT'];
        if (!valid.includes(symbol)) {
            throw new Error(`Symbol debe ser uno de: ${valid.join(', ')}`);
        }
        return symbol;
    }

    validatePrice(price) {
        const num = parseFloat(price);
        if (isNaN(num) || num <= 0) {
            throw new Error('Price debe ser un número positivo');
        }
        return num;
    }

    validateAmount(amount) {
        const num = parseFloat(amount);
        if (isNaN(num) || num <= 0) {
            throw new Error('Amount debe ser un número positivo');
        }
        return num;
    }

    validateEmail(email) {
        const regex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!regex.test(email)) {
            throw new Error('Email inválido');
        }
        return email.toLowerCase();
    }
}

module.exports = new Validators();
