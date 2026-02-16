const TechnicalIndicators = require('../src/core/technical_indicators');

// Generate sample price data with uptrend
function generatePrices(count, start = 100, trend = 0.1) {
    const prices = [];
    let price = start;
    for (let i = 0; i < count; i++) {
        price += (Math.random() - 0.45) * trend * price * 0.01;
        prices.push(parseFloat(price.toFixed(2)));
    }
    return prices;
}

const prices50 = generatePrices(50, 100, 1);
const pricesShort = [100, 101, 102]; // Too short for most indicators

describe('TechnicalIndicators', () => {
    describe('calculateSMA', () => {
        test('returns number with sufficient data', () => {
            const result = TechnicalIndicators.calculateSMA(prices50, 20);
            expect(typeof result).toBe('number');
            expect(result).toBeGreaterThan(0);
        });

        test('returns null with insufficient data', () => {
            expect(TechnicalIndicators.calculateSMA(pricesShort, 20)).toBeNull();
        });
    });

    describe('calculateEMA', () => {
        test('returns number with sufficient data', () => {
            const result = TechnicalIndicators.calculateEMA(prices50, 12);
            expect(typeof result).toBe('number');
            expect(result).toBeGreaterThan(0);
        });

        test('returns null with insufficient data', () => {
            expect(TechnicalIndicators.calculateEMA(pricesShort, 20)).toBeNull();
        });
    });

    describe('calculateRSI', () => {
        test('returns value between 0-100 with sufficient data', () => {
            const result = TechnicalIndicators.calculateRSI(prices50, 14);
            expect(typeof result).toBe('number');
            expect(result).toBeGreaterThanOrEqual(0);
            expect(result).toBeLessThanOrEqual(100);
        });

        test('returns null with insufficient data', () => {
            expect(TechnicalIndicators.calculateRSI(pricesShort, 14)).toBeNull();
        });
    });

    describe('calculateBollingerBands', () => {
        test('returns upper > middle > lower with sufficient data', () => {
            const result = TechnicalIndicators.calculateBollingerBands(prices50, 20, 2);
            expect(result).not.toBeNull();
            expect(result).toHaveProperty('upper');
            expect(result).toHaveProperty('middle');
            expect(result).toHaveProperty('lower');
            expect(result.upper).toBeGreaterThan(result.middle);
            expect(result.middle).toBeGreaterThan(result.lower);
        });

        test('returns null with insufficient data', () => {
            expect(TechnicalIndicators.calculateBollingerBands(pricesShort, 20, 2)).toBeNull();
        });
    });

    describe('calculateMACD', () => {
        test('returns MACD components with sufficient data', () => {
            const result = TechnicalIndicators.calculateMACD(prices50, 12, 26, 9);
            expect(result).not.toBeNull();
            expect(result).toHaveProperty('MACD');
            expect(result).toHaveProperty('signal');
            expect(result).toHaveProperty('histogram');
        });

        test('returns null with insufficient data', () => {
            expect(TechnicalIndicators.calculateMACD(pricesShort, 12, 26, 9)).toBeNull();
        });
    });

    describe('calculateATR', () => {
        test('returns positive number with sufficient data', () => {
            const high = prices50.map(p => p * 1.01);
            const low = prices50.map(p => p * 0.99);
            const close = prices50;
            const result = TechnicalIndicators.calculateATR(high, low, close, 14);
            expect(typeof result).toBe('number');
            expect(result).toBeGreaterThan(0);
        });

        test('returns null with insufficient data', () => {
            expect(TechnicalIndicators.calculateATR([100], [99], [100], 14)).toBeNull();
        });

        test('returns null with less than 2 data points', () => {
            expect(TechnicalIndicators.calculateATR([100], [99], [100], 1)).toBeNull();
        });
    });
});
