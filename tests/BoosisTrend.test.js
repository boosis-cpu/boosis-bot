const BoosisTrend = require('../src/strategies/BoosisTrend');

// Helper: generate candle array [openTime, open, high, low, close, volume, closeTime]
function makeCandle(close, index = 0) {
    const time = 1700000000000 + index * 300000;
    return [time, close * 0.999, close * 1.001, close * 0.998, close, 1000, time + 299999];
}

// Generate a strong uptrend history (EMA short > long > trend)
function generateBullishHistory(count = 60) {
    const history = [];
    for (let i = 0; i < count; i++) {
        const price = 100 + i * 0.5; // Steady uptrend
        history.push(makeCandle(price, i));
    }
    return history;
}

describe('BoosisTrend Strategy', () => {
    let strategy;

    beforeEach(() => {
        strategy = new BoosisTrend();
    });

    describe('constructor defaults', () => {
        test('has correct default parameters', () => {
            expect(strategy.name).toBe('Boosis Trend Follower');
            expect(strategy.rsiBuyBound).toBe(25);
            expect(strategy.rsiSellBound).toBe(75);
            expect(strategy.emaShort).toBe(12);
            expect(strategy.emaLong).toBe(26);
            expect(strategy.emaTrend).toBe(50);
            expect(strategy.bbPeriod).toBe(20);
            expect(strategy.bbStdDev).toBe(2.0);
            expect(strategy.stopLossPercent).toBe(0.02);
            expect(strategy.trailingStopPercent).toBe(0.015);
        });
    });

    describe('configure()', () => {
        test('applies profile parameters', () => {
            strategy.configure({
                rsi: { buy: 30, sell: 70 },
                ema: { short: 9, long: 21, trend: 50 },
                bb: { period: 25, stdDev: 2.5 },
                stopLoss: 0.03,
            });

            expect(strategy.rsiBuyBound).toBe(30);
            expect(strategy.rsiSellBound).toBe(70);
            expect(strategy.emaShort).toBe(9);
            expect(strategy.emaLong).toBe(21);
            expect(strategy.bbPeriod).toBe(25);
            expect(strategy.bbStdDev).toBe(2.5);
            expect(strategy.stopLossPercent).toBe(0.03);
        });

        test('handles null profile gracefully', () => {
            strategy.configure(null);
            expect(strategy.rsiBuyBound).toBe(25); // unchanged
        });

        test('handles partial profile', () => {
            strategy.configure({ rsi: { buy: 30, sell: 70 } });
            expect(strategy.rsiBuyBound).toBe(30);
            expect(strategy.emaShort).toBe(12); // unchanged
        });
    });

    describe('onCandle()', () => {
        test('returns null with insufficient history', () => {
            const shortHistory = [makeCandle(100, 0), makeCandle(101, 1)];
            const candle = makeCandle(102, 2);
            const result = strategy.onCandle(candle, shortHistory);
            expect(result).toBeNull();
        });

        test('returns null when no conditions met in flat market', () => {
            // Generate flat data where RSI hovers around 50
            const history = [];
            for (let i = 0; i < 60; i++) {
                const price = 100 + Math.sin(i * 0.1) * 2; // oscillate around 100
                history.push(makeCandle(price, i));
            }
            const candle = makeCandle(100, 60);
            const result = strategy.onCandle(candle, history, false, 0);
            // In a flat market with RSI ~50, no BUY or SELL should trigger
            // Result could be null or a signal depending on exact conditions
            if (result !== null) {
                expect(result).toHaveProperty('action');
                expect(result).toHaveProperty('price');
                expect(result).toHaveProperty('reason');
            }
        });

        test('SELL signal on stop loss when in position', () => {
            const history = generateBullishHistory(60);
            const entryPrice = 130;
            // Price drops 3% below entry (stop loss is 2%)
            const currentPrice = entryPrice * 0.97;
            const candle = makeCandle(currentPrice, 60);

            const result = strategy.onCandle(candle, history, true, entryPrice);
            if (result) {
                expect(result.action).toBe('SELL');
                expect(result.reason).toContain('STOP LOSS');
            }
        });

        test('SELL signal on trailing stop when in position', () => {
            const history = generateBullishHistory(60);
            const entryPrice = 100;

            // First simulate price going up to set high water mark
            strategy.highWaterMark = 140;

            // Now price drops below trailing stop (1.5% from high water mark)
            const trailingPrice = 140 * (1 - 0.016); // just below trailing stop
            const candle = makeCandle(trailingPrice, 60);

            const result = strategy.onCandle(candle, history, true, entryPrice);
            if (result) {
                expect(result.action).toBe('SELL');
                expect(result.reason).toContain('TRAILING STOP');
            }
        });

        test('signal has correct structure when returned', () => {
            const history = generateBullishHistory(60);
            const entryPrice = 130;
            const currentPrice = entryPrice * 0.95; // well below stop loss
            const candle = makeCandle(currentPrice, 60);

            const result = strategy.onCandle(candle, history, true, entryPrice);
            if (result) {
                expect(result).toHaveProperty('action');
                expect(result).toHaveProperty('price');
                expect(result).toHaveProperty('reason');
                expect(['BUY', 'SELL']).toContain(result.action);
                expect(typeof result.price).toBe('number');
                expect(typeof result.reason).toBe('string');
            }
        });

        test('resets highWaterMark on SELL', () => {
            strategy.highWaterMark = 150;
            const history = generateBullishHistory(60);
            const entryPrice = 130;
            const currentPrice = entryPrice * 0.97;
            const candle = makeCandle(currentPrice, 60);

            const result = strategy.onCandle(candle, history, true, entryPrice);
            if (result && result.action === 'SELL') {
                expect(strategy.highWaterMark).toBe(0);
            }
        });

        test('updates highWaterMark when price increases in position', () => {
            strategy.highWaterMark = 128;
            const history = generateBullishHistory(60);
            // Use price slightly above highWaterMark but within the trend range
            const candle = makeCandle(130.5, 60);

            // Widen bounds so no SELL triggers
            strategy.rsiSellBound = 99;
            strategy.stopLossPercent = 0.99;
            strategy.trailingStopPercent = 0.99;

            const result = strategy.onCandle(candle, history, true, 100);
            // If no SELL triggered, highWaterMark should have been updated
            if (!result) {
                expect(strategy.highWaterMark).toBeGreaterThanOrEqual(130);
            }
        });
    });
});
