
const logger = require('../core/logger');

class BacktestEngine {
    constructor(initialCapital = 1000, commissionRate = 0.001) {
        this.initialCapital = initialCapital;
        this.commissionRate = commissionRate;
    }

    run(strategy, candles) {
        logger.info(`Starting backtest for strategy: ${strategy.name}`);

        let wallet = { usdt: this.initialCapital, asset: 0 };
        let history = [];
        let operations = [];
        let peakValue = this.initialCapital;
        let maxDrawdown = 0;

        candles.forEach((candle, index) => {
            // Candle format: [time, open, high, low, close, volume]
            const closePrice = parseFloat(candle[4]);
            const time = new Date(candle[0]).toLocaleString();

            // Update history for strategy
            history.push(candle);

            // Get signal from strategy
            const signal = strategy.onCandle(candle, history);

            if (signal) {
                // BUY LOGIC
                if (signal.action === 'BUY' && wallet.usdt > 0) {
                    const fee = wallet.usdt * this.commissionRate;
                    const amountToBuy = (wallet.usdt - fee) / closePrice;

                    wallet.asset = amountToBuy;
                    wallet.usdt = 0;

                    operations.push({
                        type: 'BUY',
                        price: closePrice,
                        time: time,
                        reason: signal.reason,
                        balance: this.calculateTotalValue(wallet, closePrice)
                    });
                }
                // SELL LOGIC
                else if (signal.action === 'SELL' && wallet.asset > 0) {
                    const grossSale = wallet.asset * closePrice;
                    const fee = grossSale * this.commissionRate;

                    wallet.usdt = grossSale - fee;
                    wallet.asset = 0;

                    operations.push({
                        type: 'SELL',
                        price: closePrice,
                        time: time,
                        reason: signal.reason,
                        balance: wallet.usdt
                    });
                }
            }

            // Metrics Update
            const currentTotal = this.calculateTotalValue(wallet, closePrice);
            if (currentTotal > peakValue) peakValue = currentTotal;

            const drawdown = ((peakValue - currentTotal) / peakValue) * 100;
            if (drawdown > maxDrawdown) maxDrawdown = drawdown;
        });

        const finalPrice = parseFloat(candles[candles.length - 1][4]);
        const finalBalance = this.calculateTotalValue(wallet, finalPrice);
        const profit = ((finalBalance - this.initialCapital) / this.initialCapital) * 100;

        return {
            initialCapital: this.initialCapital,
            finalBalance: finalBalance,
            profitPercent: profit,
            maxDrawdown: maxDrawdown,
            totalTrades: operations.length,
            operations: operations
        };
    }

    calculateTotalValue(wallet, price) {
        return wallet.usdt + (wallet.asset * price);
    }
}

module.exports = BacktestEngine;
