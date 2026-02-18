const axios = require('axios');
const fs = require('fs');

async function fetchFundingHistory(symbol, days) {
    const baseUrl = 'https://fapi.binance.com/fapi/v1/fundingRate';
    const limit = 1000;
    const endTime = Date.now();
    const startTime = endTime - (days * 24 * 60 * 60 * 1000);

    let allRates = [];
    let currentStartTime = startTime;

    console.log(`Buscando historial de Funding para ${symbol} por ${days} días...`);

    while (currentStartTime < endTime) {
        try {
            const response = await axios.get(baseUrl, {
                params: {
                    symbol: symbol,
                    startTime: currentStartTime,
                    limit: limit
                }
            });

            const rates = response.data;
            if (rates.length === 0) break;

            allRates = allRates.concat(rates);
            console.log(`Descargadas ${allRates.length} tasas de funding...`);

            // Funding is every 8h
            currentStartTime = rates[rates.length - 1].fundingTime + 1;

            if (rates.length < limit) break;

            await new Promise(r => setTimeout(r, 200));
        } catch (error) {
            console.error(`Error: ${error.message}`);
            break;
        }
    }

    return allRates;
}

async function main() {
    const btcFunding = await fetchFundingHistory('BTCUSDT', 365);
    fs.writeFileSync('btc_1y_funding.json', JSON.stringify(btcFunding));
    console.log('✅ Historial de Funding de BTC (1 año) guardado en btc_1y_funding.json');
}

main();
