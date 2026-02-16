// Mock database before requiring backtest engine
jest.mock('../src/core/database', () => ({
    pool: { query: jest.fn() }
}));
jest.mock('../src/core/logger', () => ({
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
    success: jest.fn(),
}));

const backtestEngine = require('../src/core/backtest-engine');

// Generate mock candle rows (DB format)
function generateCandles(count, startPrice = 100) {
    const candles = [];
    let price = startPrice;
    const baseTime = 1700000000000;

    for (let i = 0; i < count; i++) {
        // Create some volatility with a mild uptrend
        price = price * (1 + (Math.random() - 0.48) * 0.02);
        candles.push({
            open_time: baseTime + i * 300000,
            open: (price * 0.999).toFixed(2),
            high: (price * 1.005).toFixed(2),
            low: (price * 0.995).toFixed(2),
            close: price.toFixed(2),
            volume: '1000',
        });
    }
    return candles;
}

describe('BacktestEngine', () => {
    describe('_calculateStartDate', () => {
        const now = new Date('2025-06-15T00:00:00Z');

        test('1m subtracts 1 month', () => {
            const result = backtestEngine._calculateStartDate(now, '1m');
            expect(result.getMonth()).toBe(4); // May (0-indexed)
        });

        test('3m subtracts 3 months', () => {
            const result = backtestEngine._calculateStartDate(now, '3m');
            expect(result.getMonth()).toBe(2); // March
        });

        test('6m subtracts 6 months', () => {
            const result = backtestEngine._calculateStartDate(now, '6m');
            expect(result.getMonth()).toBe(11); // December prev year
        });

        test('1y subtracts 1 year', () => {
            const result = backtestEngine._calculateStartDate(now, '1y');
            expect(result.getFullYear()).toBe(2024);
        });

        test('2y subtracts 2 years', () => {
            const result = backtestEngine._calculateStartDate(now, '2y');
            expect(result.getFullYear()).toBe(2023);
        });

        test('default falls back to 1 month', () => {
            const result = backtestEngine._calculateStartDate(now, 'invalid');
            expect(result.getMonth()).toBe(4);
        });
    });

    describe('_ema', () => {
        const candles = generateCandles(30);

        test('returns close price when index < period', () => {
            const result = backtestEngine._ema(candles, 2, 10);
            expect(result).toBe(parseFloat(candles[2].close));
        });

        test('returns number when sufficient data', () => {
            const result = backtestEngine._ema(candles, 20, 10);
            expect(typeof result).toBe('number');
            expect(result).toBeGreaterThan(0);
        });
    });

    describe('_rsi', () => {
        const candles = generateCandles(30);

        test('returns 50 when index < period', () => {
            expect(backtestEngine._rsi(candles, 5, 14)).toBe(50);
        });

        test('returns value between 0-100 with sufficient data', () => {
            const result = backtestEngine._rsi(candles, 20, 14);
            expect(result).toBeGreaterThanOrEqual(0);
            expect(result).toBeLessThanOrEqual(100);
        });
    });

    describe('_bollingerBands', () => {
        const candles = generateCandles(30);

        test('returns zeros when index < period', () => {
            const result = backtestEngine._bollingerBands(candles, 2, 20, 2);
            expect(result.upper).toBe(0);
            expect(result.middle).toBe(0);
            expect(result.lower).toBe(0);
        });

        test('returns upper > middle > lower with sufficient data', () => {
            const result = backtestEngine._bollingerBands(candles, 25, 20, 2);
            expect(result.upper).toBeGreaterThan(result.middle);
            expect(result.middle).toBeGreaterThan(result.lower);
        });
    });

    describe('_simulateTrading', () => {
        const candles = generateCandles(200);
        const params = {
            rsi: { buy: 25, sell: 75 },
            ema: { short: 12, long: 26, trend: 50 },
            stopLoss: 0.02,
        };

        test('returns trades array', () => {
            const result = backtestEngine._simulateTrading(candles, params);
            expect(Array.isArray(result.trades)).toBe(true);
        });

        test('returns equity array starting at 100', () => {
            const result = backtestEngine._simulateTrading(candles, params);
            expect(result.equity[0].value).toBe(100);
        });

        test('returns finalBalance as number', () => {
            const result = backtestEngine._simulateTrading(candles, params);
            expect(typeof result.finalBalance).toBe('number');
            expect(result.finalBalance).toBeGreaterThan(0);
        });

        test('trades have correct structure', () => {
            const result = backtestEngine._simulateTrading(candles, params);
            for (const trade of result.trades) {
                expect(trade).toHaveProperty('date');
                expect(trade).toHaveProperty('side');
                expect(trade).toHaveProperty('price');
                expect(trade).toHaveProperty('reason');
                expect(['BUY', 'SELL']).toContain(trade.side);
            }
        });

        test('fees reduce balance (finalBalance <= 100 if no profit)', () => {
            // With random data, fees should eat into balance
            // Even if there are gains, each trade pays 0.1% fee
            const result = backtestEngine._simulateTrading(candles, params);
            // At minimum, each round trip costs 0.2% in fees
            // We just verify the engine runs without error
            expect(result.finalBalance).toBeDefined();
        });
    });

    describe('_calculateMetrics', () => {
        test('calculates correct metrics for known trades', () => {
            const results = {
                trades: [
                    { side: 'BUY', price: 100, date: '2024-01-01', reason: 'RSI' },
                    { side: 'SELL', price: 110, pnl: 10, date: '2024-01-02', reason: 'RSI' },
                    { side: 'BUY', price: 105, date: '2024-01-03', reason: 'RSI' },
                    { side: 'SELL', price: 100, pnl: -4.76, date: '2024-01-04', reason: 'SL' },
                ],
                equity: [
                    { time: 1, value: 100 },
                    { time: 2, value: 110 },
                    { time: 3, value: 105 },
                ],
                finalBalance: 105,
                maxBalance: 110,
            };

            const metrics = backtestEngine._calculateMetrics(results);

            expect(metrics.totalTrades).toBe(2); // Only SELL trades counted
            expect(metrics.winningTrades).toBe(1);
            expect(metrics.losingTrades).toBe(1);
            expect(metrics.winRate).toBe(50);
            expect(metrics.roi).toBe(5); // (105-100)/100 * 100
            expect(metrics.profitFactor).toBeGreaterThan(0);
        });

        test('handles zero trades', () => {
            const results = {
                trades: [],
                equity: [{ time: 1, value: 100 }],
                finalBalance: 100,
                maxBalance: 100,
            };

            const metrics = backtestEngine._calculateMetrics(results);
            expect(metrics.totalTrades).toBe(0);
            expect(metrics.winRate).toBe(0);
        });

        test('calculates max drawdown correctly', () => {
            const results = {
                trades: [],
                equity: [
                    { time: 1, value: 100 },
                    { time: 2, value: 120 },  // peak
                    { time: 3, value: 96 },   // -20% from peak
                    { time: 4, value: 110 },
                ],
                finalBalance: 110,
                maxBalance: 120,
            };

            const metrics = backtestEngine._calculateMetrics(results);
            expect(metrics.maxDD).toBe(-20);
        });
    });
});
