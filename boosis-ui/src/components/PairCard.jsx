import React, { useState, useEffect } from 'react';
import axios from 'axios';
import {
    LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
    ResponsiveContainer
} from 'recharts';

export default function PairCard({ symbol, data, token, loadDelay = 0 }) {
    const [chartData, setChartData] = useState([]);

    useEffect(() => {
        const timer = setTimeout(() => loadChartData(), loadDelay);
        return () => clearTimeout(timer);
    }, [symbol, token]);

    const loadChartData = async () => {
        try {
            const response = await axios.get(
                `/api/candles?symbol=${symbol}&limit=50`,
                { headers: { Authorization: `Bearer ${token}` } }
            );
            if (response.data && Array.isArray(response.data)) {
                setChartData(response.data.slice(-20)
                    .map(c => ({
                        time: new Date(c.open_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                        price: parseFloat(c.close) || 0,
                    }))
                    .filter(c => c.price > 0));
            }
        } catch (error) {
            console.error('Error loading candles:', error);
        }
    };

    if (!data) return <div className="pair-card loading">Cargando {symbol}...</div>;

    const latestCandle = data.latestCandle || {};
    const currentPrice = parseFloat(latestCandle.close || 0);
    const change = data.change || 0;
    const trades = Number(data.metrics?.totalTrades || data.metrics?.trades) || 0;
    const winningTrades = Number(data.metrics?.winningTrades) || 0;
    const winRate = trades > 0 ? (winningTrades / trades * 100).toFixed(1) : 0;
    const balance = (Number(data.balance?.usdt) || 0) + (Number(data.balance?.assetValue) || 0);

    return (
        <div className="pair-card">
            <div className="pair-card-header">
                <h3>{symbol}</h3>
                <span className={`status-pill ${data.status === 'inactive' ? 'inactive' : (data.activePosition ? 'active' : 'idle')}`}>
                    {data.status === 'inactive' ? '⚪ INACTIVE' : (data.activePosition ? '🔵 IN POSITION' : '🟢 WAITING')}
                </span>
            </div>

            <div className="chart-container" style={{ minWidth: 0, minHeight: 150 }}>
                <ResponsiveContainer width="99%" height={150} minWidth={0}>
                    <LineChart data={chartData}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#222" />
                        <XAxis dataKey="time" hide />
                        <YAxis domain={['auto', 'auto']} hide />
                        <Tooltip
                            contentStyle={{ backgroundColor: '#111', border: '1px solid #00ff88', borderRadius: '4px' }}
                            itemStyle={{ color: '#00ff88' }}
                            labelStyle={{ color: '#fff' }}
                            formatter={(value) => [isNaN(value) ? '0' : `$${Number(value).toLocaleString()}`, 'Precio']}
                        />
                        <Line
                            type="monotone"
                            dataKey="price"
                            stroke={change >= 0 ? '#00ff88' : '#ff0064'}
                            dot={false}
                            strokeWidth={2}
                            isAnimationActive={false}
                        />
                    </LineChart>
                </ResponsiveContainer>
            </div>

            <div className="pair-metrics">
                <div className="metric-box">
                    <label>Precio</label>
                    <div className="val">${currentPrice.toLocaleString()}</div>
                </div>
                <div className="metric-box">
                    <label>Cambio 24h</label>
                    <div className={`val ${change >= 0 ? 'positive' : 'negative'}`}>
                        {change >= 0 ? '+' : ''}{change.toFixed(2)}%
                    </div>
                </div>
                <div className="metric-box">
                    <label>Balance</label>
                    <div className="val">${balance.toFixed(2)}</div>
                </div>
                <div className="metric-box">
                    <label>Trades / WR</label>
                    <div className="val">{trades} / {winRate}%</div>
                </div>
            </div>
        </div>
    );
}
