const os = require('os');
const wsManager = require('./websocket-manager');

class HealthChecker {
    constructor(trader) {
        this.trader = trader;
        this.startTime = Date.now();
    }

    getStatus() {
        const memoryUsage = process.memoryUsage();
        const uptime = Math.floor((Date.now() - this.startTime) / 1000);
        const wsStatus = wsManager.getStatus();

        const health = {
            status: 'HEALTHY',
            timestamp: Date.now(),
            uptime: uptime,
            system: {
                load: os.loadavg(),
                freeMemory: os.freemem(),
                totalMemory: os.totalmem()
            },
            processes: {
                heapUsed: (memoryUsage.heapUsed / 1024 / 1024).toFixed(2) + ' MB',
                heapTotal: (memoryUsage.heapTotal / 1024 / 1024).toFixed(2) + ' MB'
            },
            bot: {
                wsConnected: wsStatus.isConnected,
                candlesInBuffer: this.trader.candles.length,
                tradesCount: this.trader.trades.length,
                symbol: this.trader.symbol || 'BTCUSDT',
                activePairs: wsStatus.activeSymbols
            }
        };

        // Reglas de Salud
        if (!health.bot.wsConnected) {
            health.status = 'ERROR';
            health.message = 'WebSocket Disconnected';
        } else if (health.bot.candlesInBuffer === 0) {
            health.status = 'WARNING';
            health.message = 'No data in buffer';
        }

        return health;
    }
}

module.exports = HealthChecker;
