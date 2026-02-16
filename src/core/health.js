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
                candlesInBuffer: this.getTotalCandlesAndTrades().totalCandles,
                tradesCount: this.getTotalCandlesAndTrades().totalTrades,
                symbol: 'MULTI-ASSET',
                activePairs: wsStatus.activeSymbols,
                pairManagersCount: this.trader.pairManagers ? this.trader.pairManagers.size : 0
            }
        };

        // Reglas de Salud
        if (!health.bot.wsConnected) {
            health.status = 'ERROR';
            health.message = 'WebSocket Disconnected';
        } else if (health.bot.pairManagersCount === 0) {
            health.status = 'WARNING';
            health.message = 'No active pairs configured';
        }

        return health;
    }

    getTotalCandlesAndTrades() {
        let totalCandles = 0;
        let totalTrades = 0;

        if (this.trader.pairManagers) {
            for (const manager of this.trader.pairManagers.values()) {
                if (manager.candles) totalCandles += manager.candles.length;
                if (manager.metrics) totalTrades += manager.metrics.totalTrades;
            }
        }

        return { totalCandles, totalTrades };
    }
}

module.exports = HealthChecker;
