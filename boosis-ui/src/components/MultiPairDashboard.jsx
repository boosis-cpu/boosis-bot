// boosis-ui/src/components/MultiPairDashboard.jsx
import React, { useState, useEffect } from 'react';
import axios from 'axios';
import {
    LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
    ResponsiveContainer, PieChart, Pie, Cell
} from 'recharts';
import './MultiPairDashboard.css';

export default function MultiPairDashboard({ token }) {
    const [gridMode, setGridMode] = useState('2x2'); // 1, 2, 2x2, 4
    const [activeSymbols, setActiveSymbols] = useState(['BTCUSDT', 'ETHUSDT', 'XRPUSDT']);
    const [pairsData, setPairsData] = useState({});
    const [portfolio, setPortfolio] = useState(null);
    const [loading, setLoading] = useState(false);

    // Cargar datos de todos los pares
    useEffect(() => {
        loadMultiPairData();
        const interval = setInterval(loadMultiPairData, 5000); // Refresh cada 5s
        return () => clearInterval(interval);
    }, [activeSymbols]);

    const loadMultiPairData = async () => {
        try {
            setLoading(true);
            const data = {};

            for (const symbol of activeSymbols) {
                const response = await axios.get(
                    `/api/status?symbol=${symbol}`,
                    { headers: { Authorization: `Bearer ${token}` } }
                );
                data[symbol] = response.data;
            }

            setPairsData(data);
            calculatePortfolio(data);
        } catch (error) {
            console.error('Error loading pairs:', error);
        } finally {
            setLoading(false);
        }
    };

    const calculatePortfolio = (data) => {
        let totalBalance = 0;
        let totalTrades = 0;
        let winningTrades = 0;
        let pairBreakdown = [];
        // Get initial capital from backend (first pair response), fallback to 1000
        const firstPair = Object.values(data)[0];
        const initialCapital = firstPair?.initialCapital || 1000;

        for (const [symbol, pairData] of Object.entries(data)) {
            const balance = (pairData.balance?.usdt || 0) + (pairData.balance?.assetValue || 0);
            totalBalance += balance;
            totalTrades += pairData.metrics?.trades || 0;
            winningTrades += pairData.metrics?.winningTrades || 0;

            pairBreakdown.push({
                name: symbol.replace('USDT', ''),
                value: balance,
                trades: pairData.metrics?.trades || 0,
            });
        }

        setPortfolio({
            totalBalance,
            totalTrades,
            winRate: totalTrades > 0 ? (winningTrades / totalTrades * 100).toFixed(2) : 0,
            pairBreakdown,
            pnl: totalBalance - initialCapital,
            pnlPercent: initialCapital > 0 ? ((totalBalance - initialCapital) / initialCapital * 100).toFixed(2) : 0,
        });
    };

    const COLORS = ['#00ff88', '#00ffff', '#ff0080', '#ffaa00'];

    return (
        <div className="multi-pair-dashboard">
            <div className="dashboard-header">
                <h1>📊 FASE 8 - MULTI-ACTIVO DASHBOARD</h1>
                {loading && <div className="loading-indicator">Refrescando...</div>}
            </div>

            {/* Controles */}
            <div className="dashboard-controls">
                <div className="grid-selector">
                    <button
                        onClick={() => setGridMode('1')}
                        className={gridMode === '1' ? 'active' : ''}
                    >
                        1 Activo
                    </button>
                    <button
                        onClick={() => setGridMode('2')}
                        className={gridMode === '2' ? 'active' : ''}
                    >
                        2 Activos
                    </button>
                    <button
                        onClick={() => setGridMode('2x2')}
                        className={gridMode === '2x2' ? 'active' : ''}
                    >
                        Multi-Panel
                    </button>
                </div>

                <div className="symbol-toggles">
                    {['BTCUSDT', 'ETHUSDT', 'XRPUSDT'].map(symbol => (
                        <label key={symbol} className="toggle">
                            <input
                                type="checkbox"
                                checked={activeSymbols.includes(symbol)}
                                onChange={(e) => {
                                    if (e.target.checked) {
                                        setActiveSymbols([...activeSymbols, symbol]);
                                    } else {
                                        setActiveSymbols(activeSymbols.filter(s => s !== symbol));
                                    }
                                }}
                            />
                            <span>{symbol.replace('USDT', '')}</span>
                        </label>
                    ))}
                </div>
            </div>

            {/* Grid de Pares */}
            <div className={`pairs-grid grid-${gridMode}`}>
                {activeSymbols.map(symbol => (
                    <PairCard
                        key={symbol}
                        symbol={symbol}
                        data={pairsData[symbol]}
                        token={token}
                    />
                ))}

                {/* Portfolio Summary (si hay espacio) */}
                {(gridMode === '2x2') && portfolio && (
                    <PortfolioCard portfolio={portfolio} colors={COLORS} />
                )}
            </div>

            {/* Status Bar Consolidado */}
            {portfolio && (
                <div className="status-bar">
                    <div className="metric">
                        <label>Balance Total</label>
                        <div className="value">${portfolio.totalBalance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
                    </div>
                    <div className="metric">
                        <label>P&L Global</label>
                        <div className={`value ${portfolio.pnl >= 0 ? 'positive' : 'negative'}`}>
                            ${portfolio.pnl.toFixed(2)} ({portfolio.pnlPercent}%)
                        </div>
                    </div>
                    <div className="metric">
                        <label>Total Trades</label>
                        <div className="value">{portfolio.totalTrades}</div>
                    </div>
                    <div className="metric">
                        <label>Avg Win Rate</label>
                        <div className="value">{portfolio.winRate}%</div>
                    </div>
                </div>
            )}
        </div>
    );
}

// Componente: Tarjeta de Par Individual
function PairCard({ symbol, data, token }) {
    const [chartData, setChartData] = useState([]);

    useEffect(() => {
        loadChartData();
    }, [symbol, token]);

    const loadChartData = async () => {
        try {
            const response = await axios.get(
                `/api/candles?symbol=${symbol}&limit=50`,
                { headers: { Authorization: `Bearer ${token}` } }
            );
            setChartData(response.data.slice(-20).map(c => ({
                time: new Date(c.open_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                price: parseFloat(c.close),
            })));
        } catch (error) {
            console.error('Error loading candles:', error);
        }
    };

    if (!data) return <div className="pair-card loading">Cargando {symbol}...</div>;

    // Assuming data comes from /api/status?symbol=...
    const latestCandle = data.latestCandle || {};
    const currentPrice = parseFloat(latestCandle.close || 0);
    const change = data.change || 0; // Backend should provide this
    const trades = data.metrics?.trades || 0;
    const winRate = trades > 0 ? (data.metrics?.winningTrades / trades * 100).toFixed(1) : 0;
    const balance = (data.balance?.usdt || 0) + (data.balance?.assetValue || 0);

    return (
        <div className="pair-card">
            <div className="pair-card-header">
                <h3>{symbol}</h3>
                <span className={`status-pill ${data.activePosition ? 'active' : 'idle'}`}>
                    {data.activePosition ? '🔵 IN POSITION' : '⚪ WAITING'}
                </span>
            </div>

            <div className="chart-container">
                <ResponsiveContainer width="100%" height={150}>
                    <LineChart data={chartData}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#222" />
                        <XAxis dataKey="time" hide />
                        <YAxis domain={['auto', 'auto']} hide />
                        <Tooltip
                            contentStyle={{ backgroundColor: '#111', border: '1px solid #00ff88', borderRadius: '4px' }}
                            itemStyle={{ color: '#00ff88' }}
                            labelStyle={{ color: '#fff' }}
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

// Componente: Portfolio Summary
function PortfolioCard({ portfolio, colors }) {
    return (
        <div className="pair-card portfolio-card">
            <h3>DISTRIBUCIÓN DE PORTFOLIO</h3>

            <div className="pie-section">
                <div className="pie-chart-container">
                    <ResponsiveContainer width="100%" height={160}>
                        <PieChart>
                            <Pie
                                data={portfolio.pairBreakdown}
                                cx="50%"
                                cy="50%"
                                innerRadius={45}
                                outerRadius={65}
                                paddingAngle={5}
                                dataKey="value"
                            >
                                {portfolio.pairBreakdown.map((entry, index) => (
                                    <Cell key={`cell-${index}`} fill={colors[index % colors.length]} />
                                ))}
                            </Pie>
                            <Tooltip
                                contentStyle={{ backgroundColor: '#111', border: '1px solid #00ffff', borderRadius: '4px' }}
                                itemStyle={{ color: '#fff' }}
                            />
                        </PieChart>
                    </ResponsiveContainer>
                </div>

                <div className="pie-legend">
                    {portfolio.pairBreakdown.map((pair, i) => (
                        <div key={pair.name} className="legend-item">
                            <span className="dot" style={{ backgroundColor: colors[i % colors.length] }}></span>
                            <span className="name">{pair.name}</span>
                            <span className="val">${pair.value.toFixed(0)}</span>
                        </div>
                    ))}
                </div>
            </div>

            <div className="portfolio-total-metric">
                <div className="metric-row">
                    <span>Profit/Loss $</span>
                    <span className={portfolio.pnl >= 0 ? 'positive' : 'negative'}>
                        ${portfolio.pnl.toFixed(2)}
                    </span>
                </div>
                <div className="metric-row">
                    <span>Rendimiento %</span>
                    <span className={portfolio.pnl >= 0 ? 'positive' : 'negative'}>
                        {portfolio.pnlPercent}%
                    </span>
                </div>
            </div>
        </div>
    );
}
