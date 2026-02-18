const axios = require('axios');
const fs = require('fs');

async function fetchHistory(symbol, interval, days) {
    const baseUrl = 'https://api.binance.com/api/v3/klines';
    const limit = 1000;
    const intervalMsMap = {
        '1h': 3600000,
        '4h': 14400000,
        '1d': 86400000
    };
    const intervalMs = intervalMsMap[interval];
    const endTime = Date.now();
    const startTime = endTime - (days * 24 * 60 * 60 * 1000);

    let currentStartTime = startTime;
    let allCandles = [];

    console.log(`Buscando historial para ${symbol} (${interval}) por ${days} días...`);

    while (currentStartTime < endTime) {
        try {
            const response = await axios.get(baseUrl, {
                params: {
                    symbol: symbol,
                    interval: interval,
                    startTime: currentStartTime,
                    limit: limit
                }
            });

            const candles = response.data;
            if (candles.length === 0) break;

            allCandles = allCandles.concat(candles);
            console.log(`Descargadas ${allCandles.length} velas...`);

            currentStartTime = candles[candles.length - 1][0] + intervalMs;

            // Wait to avoid rate limit
            await new Promise(r => setTimeout(r, 200));
        } catch (error) {
            console.error(`Error: ${error.message}`);
            break;
        }
    }

    return allCandles;
}

async function main() {
    const btcCandles = await fetchHistory('BTCUSDT', '4h', 365);
    fs.writeFileSync('btc_1y_4h.json', JSON.stringify(btcCandles));
    console.log('✅ Historial de BTC (1 año, 4h) guardado en btc_1y_4h.json');
}

main();
