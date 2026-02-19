const axios = require('axios');
const token = '5d6cf90a665a92305a7aeae6ce7fe94f8f9776c36ea1903ea7868d5892d07519';
const symbols = ['DOGEUSDT', 'SHIBUSDT', 'ADAUSDT', 'AVAXUSDT'];

async function mineAll() {
    for (const symbol of symbols) {
        console.log(`Starting mining for ${symbol}...`);
        try {
            await axios.post('http://localhost:3000/api/miner/mine', {
                symbol,
                days: 1460,
                interval: '1h'
            }, {
                headers: { 'Authorization': token }
            });

            // Poll status until completed
            let completed = false;
            while (!completed) {
                const res = await axios.get('http://localhost:3000/api/miner/status', {
                    headers: { 'Authorization': token }
                });
                const status = res.data;
                console.log(`[${symbol}] Progress: ${status.progress}% | Imported: ${status.imported} | Status: ${status.status}`);

                if (status.status === 'completed' || status.status === 'error' || status.status === 'cancelled' || status.status === 'idle') {
                    completed = true;
                    if (status.status === 'error') console.error(`Error mining ${symbol}: ${status.error}`);
                } else {
                    await new Promise(r => setTimeout(r, 2000));
                }
            }
            console.log(`Finished ${symbol}.`);
        } catch (e) {
            console.error(`Failed to start mining for ${symbol}: ${e.message}`);
        }
    }
}
mineAll();
