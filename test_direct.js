const axios = require('axios');

async function test() {
    try {
        const symbol = 'BTCUSDT';
        const timeframe = '1h';
        console.log(`Fetching ${symbol} ${timeframe} from Binance...`);
        const res = await axios.get('https://api.binance.com/api/v3/klines', {
            params: { symbol, interval: timeframe, limit: 5 }
        });
        const candles = res.data;
        console.log('Result length:', candles.length);
        if (candles.length > 0) {
            const last = candles[candles.length - 1];
            console.log('Last Close:', last[4]);
            console.log('Last Time:', new Date(last[0]).toLocaleString());
        }
    } catch (e) {
        console.error(e.message);
    }
}

test();
