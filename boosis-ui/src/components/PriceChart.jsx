
import React from 'react';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';

const PriceChart = ({ lastPrice, candles }) => {
    return (
        <main className="main-chart-area panel">
            <div className="flex justify-between items-center mb-4">
                <h2 className="text-sm font-semibold text-gray-400">BTC/USDT 1M LIVE</h2>
                <div className="text-xl font-bold font-mono">${(Number(lastPrice) || 0).toFixed(2)}</div>
            </div>
            <div className="chart-wrapper" style={{ height: '400px', width: '100%', minWidth: 0 }}>
                {candles && candles.length > 0 ? (
                    <ResponsiveContainer width="99%" height={380} minWidth={0}>
                        <LineChart data={candles}>
                            <XAxis dataKey="time" hide />
                            <YAxis domain={['auto', 'auto']} hide />
                            <Tooltip
                                contentStyle={{ backgroundColor: '#0d1117', border: '1px solid #30363d' }}
                                itemStyle={{ color: '#c9d1d9' }}
                            />
                            <Line type="monotone" dataKey="close" stroke="#58a6ff" strokeWidth={2} dot={false} />
                            <Line type="monotone" dataKey="sma200" stroke="#f85149" strokeWidth={1} dot={false} strokeDasharray="3 3" />
                        </LineChart>
                    </ResponsiveContainer>
                ) : (
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#8b949e' }}>
                        Cargando datos del mercado...
                    </div>
                )}
            </div>
        </main>
    );
};

export default PriceChart;
