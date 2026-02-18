const axios = require('axios');
const fs = require('fs');

async function fetchHistory(symbol, interval, days) {
    const baseUrl = 'https://api.binance.com/api/v3/klines';
    const limit = 1000;
    const intervalMsMap = { '1h': 3600000, '4h': 14400000, '1d': 86400000 };
    const intervalMs = intervalMsMap[interval];
    const endTime = Date.now();
    const startTime = endTime - (days * 24 * 60 * 60 * 1000);
    let currentStartTime = startTime;
    let allCandles = [];

    console.log(`Buscando historial para ${symbol} (${interval}) por ${days} días...`);
    while (currentStartTime < endTime) {
        try {
            const response = await axios.get(baseUrl, {
                params: { symbol, interval, startTime: currentStartTime, limit }
            });
            const candles = response.data;
            if (candles.length === 0) break;
            allCandles = allCandles.concat(candles);
            currentStartTime = candles[candles.length - 1][0] + intervalMs;
            await new Promise(r => setTimeout(r, 150));
        } catch (error) { break; }
    }
    return allCandles;
}

async function fetchFundingHistory(symbol, days) {
    const baseUrl = 'https://fapi.binance.com/fapi/v1/fundingRate';
    const limit = 1000;
    const endTime = Date.now();
    const startTime = endTime - (days * 24 * 60 * 60 * 1000);
    let allRates = [];
    let currentStartTime = startTime;

    console.log(`Buscando historial de Funding para ${symbol}...`);
    while (currentStartTime < endTime) {
        try {
            const response = await axios.get(baseUrl, {
                params: { symbol, startTime: currentStartTime, limit }
            });
            const rates = response.data;
            if (rates.length === 0) break;
            allRates = allRates.concat(rates);
            currentStartTime = rates[rates.length - 1].fundingTime + 1;
            if (rates.length < limit) break;
            await new Promise(r => setTimeout(r, 150));
        } catch (error) { break; }
    }
    return allRates;
}

async function main() {
    const linkCandles = await fetchHistory('LINKUSDT', '4h', 365);
    fs.writeFileSync('link_1y_4h.json', JSON.stringify(linkCandles));
    const linkFunding = await fetchFundingHistory('LINKUSDT', 365);
    fs.writeFileSync('link_1y_funding.json', JSON.stringify(linkFunding));
    console.log('✅ Datos de LINK (1 año) listos.');
}

main();
