const validators = require('../src/core/validators');

describe('Validators', () => {
    describe('validateLimit', () => {
        test('accepts valid limits', () => {
            expect(validators.validateLimit(1)).toBe(1);
            expect(validators.validateLimit(500)).toBe(500);
            expect(validators.validateLimit(1000)).toBe(1000);
            expect(validators.validateLimit('100')).toBe(100);
        });

        test('rejects invalid limits', () => {
            expect(() => validators.validateLimit(0)).toThrow();
            expect(() => validators.validateLimit(-1)).toThrow();
            expect(() => validators.validateLimit(1001)).toThrow();
            expect(() => validators.validateLimit('abc')).toThrow();
            expect(() => validators.validateLimit(NaN)).toThrow();
        });
    });

    describe('validatePassword', () => {
        test('accepts valid passwords', () => {
            expect(validators.validatePassword('123456')).toBe('123456');
            expect(validators.validatePassword('strongPassword!')).toBe('strongPassword!');
        });

        test('rejects invalid passwords', () => {
            expect(() => validators.validatePassword(null)).toThrow();
            expect(() => validators.validatePassword('')).toThrow();
            expect(() => validators.validatePassword('12345')).toThrow();
        });
    });

    describe('validateSymbol', () => {
        test('accepts valid symbols', () => {
            expect(validators.validateSymbol('BTCUSDT')).toBe('BTCUSDT');
            expect(validators.validateSymbol('ETHUSDT')).toBe('ETHUSDT');
            expect(validators.validateSymbol('BNBUSDT')).toBe('BNBUSDT');
        });

        test('rejects invalid symbols', () => {
            expect(() => validators.validateSymbol('DOGEUSDT')).toThrow();
            expect(() => validators.validateSymbol('')).toThrow();
            expect(() => validators.validateSymbol('btcusdt')).toThrow();
        });
    });

    describe('validatePrice', () => {
        test('accepts valid prices', () => {
            expect(validators.validatePrice(0.01)).toBe(0.01);
            expect(validators.validatePrice(100000)).toBe(100000);
            expect(validators.validatePrice('50.5')).toBe(50.5);
        });

        test('rejects invalid prices', () => {
            expect(() => validators.validatePrice(0)).toThrow();
            expect(() => validators.validatePrice(-1)).toThrow();
            expect(() => validators.validatePrice('abc')).toThrow();
        });
    });

    describe('validateAmount', () => {
        test('accepts valid amounts', () => {
            expect(validators.validateAmount(0.001)).toBe(0.001);
            expect(validators.validateAmount(1000)).toBe(1000);
            expect(validators.validateAmount('5.5')).toBe(5.5);
        });

        test('rejects invalid amounts', () => {
            expect(() => validators.validateAmount(0)).toThrow();
            expect(() => validators.validateAmount(-5)).toThrow();
            expect(() => validators.validateAmount('abc')).toThrow();
        });
    });

    describe('validateEmail', () => {
        test('accepts valid emails', () => {
            expect(validators.validateEmail('user@test.com')).toBe('user@test.com');
            expect(validators.validateEmail('User@Test.COM')).toBe('user@test.com');
        });

        test('rejects invalid emails', () => {
            expect(() => validators.validateEmail('abc')).toThrow();
            expect(() => validators.validateEmail('@test')).toThrow();
            expect(() => validators.validateEmail('user@')).toThrow();
        });
    });
});
