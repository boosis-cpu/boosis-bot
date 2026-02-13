
require('dotenv').config();

module.exports = {
    BINANCE: {
        REST_API_URL: 'https://api.binance.com/api/v3',
        WS_API_URL: 'wss://stream.binance.com:9443/ws',
        DEFAULT_SYMBOL: 'BTCUSDT',
        DEFAULT_INTERVAL: '1h',
        FEES: {
            MAKER: 0.001, // 0.1%
            TAKER: 0.001, // 0.1%
            BNB_DISCOUNT: 0.75 // 25% off
        }
    },
    SYSTEM: {
        DATA_DIR: './data',
        LOG_LEVEL: 'info' // info, debug, error
    }
};
