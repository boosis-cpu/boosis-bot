const BinanceService = require('./src/core/binance');
const service = new BinanceService();

async function test() {
    console.log('Fetching BTCUSDT 1h klines...');
    const klines = await service.getKlines('BTCUSDT', '1h', 5);
    console.log('Result length:', klines.length);
    if (klines.length > 0) {
        console.log('Last candle close:', klines[klines.length - 1][4]);
        console.log('Last candle time:', new Date(klines[klines.length - 1][0]).toLocaleString());
    }
}

test();
