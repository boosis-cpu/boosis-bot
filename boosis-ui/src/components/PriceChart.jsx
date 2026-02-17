
import React from 'react';
import CandlestickChart from './Charts/CandlestickChart';

const PriceChart = ({ symbol = 'BTCUSDT', token, lastPrice }) => {
    return (
        <main className="main-chart-area panel">
            <div className="flex justify-between items-center mb-4">
                <h2 className="text-sm font-semibold text-gray-400">{symbol} LIVE</h2>
                <div className="text-xl font-bold font-mono">${(Number(lastPrice) || 0).toFixed(2)}</div>
            </div>
            <CandlestickChart symbol={symbol} token={token} height={400} />
        </main>
    );
};

export default PriceChart;

