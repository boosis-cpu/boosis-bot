import React, { useState, useEffect } from 'react';
import axios from 'axios';
import PairCard from './PairCard';
import PortfolioCard from './PortfolioCard';
import './MultiPairDashboard.css';

export default function MultiPairDashboard({ token }) {
    const [gridMode, setGridMode] = useState('2x2');
    const [activeSymbols, setActiveSymbols] = useState(['BTCUSDT', 'SOLUSDT', 'PEPEUSDT', 'WIFUSDT', 'BONKUSDT', 'DOGEUSDT', 'SHIBUSDT']);
    const [pairsData, setPairsData] = useState({});
    const [portfolio, setPortfolio] = useState(null);
    const [loading, setLoading] = useState(false);

    // Lista de soldados disponibles para el dashboard
    const ALL_SOLDIERS = ['BTC', 'SOL', 'PEPE', 'WIF', 'BONK', 'DOGE', 'SHIB', 'ETH', 'XRP', 'ADA'];

    useEffect(() => {
        loadMultiPairData();
        const interval = setInterval(loadMultiPairData, 10000);
        return () => clearInterval(interval);
    }, [activeSymbols]);

    const delay = (ms) => new Promise(r => setTimeout(r, ms));

    const loadMultiPairData = async () => {
        try {
            setLoading(true);
            const data = {};
            const authToken = token || localStorage.getItem('token');

            for (let i = 0; i < activeSymbols.length; i++) {
                const symbol = activeSymbols[i];
                try {
                    const response = await axios.get(
                        `/api/status?symbol=${symbol}`,
                        { headers: { Authorization: `Bearer ${authToken}` } }
                    );
                    data[symbol] = response.data;
                } catch (e) {
                    console.error(`Error cargando ${symbol}:`, e);
                }
                if (i < activeSymbols.length - 1) await delay(200);
            }

            setPairsData(data);
            calculatePortfolio(data);
        } catch (error) {
            console.error('Error general de carga:', error);
        } finally {
            setLoading(false);
        }
    };

    const calculatePortfolio = (data) => {
        let totalAssetValue = 0;
        let globalUSDT = 0;
        let totalTrades = 0;
        let winningTrades = 0;
        let pairBreakdown = [];

        const dataValues = Object.values(data);
        if (dataValues.length > 0) {
            globalUSDT = Number(dataValues[0].balance?.usdt) || 0;
        }

        const firstPair = dataValues[0];
        const initialCapital = Number(firstPair?.initialCapital) || 200;

        for (const [symbol, pairData] of Object.entries(data)) {
            const assetValue = Number(pairData.balance?.assetValue) || 0;
            totalAssetValue += assetValue;

            const trades = Number(pairData.metrics?.totalTrades || pairData.metrics?.trades) || 0;
            totalTrades += trades;
            winningTrades += Number(pairData.metrics?.winningTrades) || 0;

            pairBreakdown.push({
                name: symbol.replace('USDT', ''),
                value: (Number(pairData.balance?.usdt) || 0) + assetValue,
                trades: trades,
            });
        }

        const totalBalance = globalUSDT + totalAssetValue;

        setPortfolio({
            totalBalance,
            totalTrades,
            winRate: totalTrades > 0 ? (winningTrades / totalTrades * 100).toFixed(2) : 0,
            pairBreakdown,
            pnl: totalBalance - initialCapital,
            pnlPercent: initialCapital > 0 ? ((totalBalance - initialCapital) / initialCapital * 100).toFixed(2) : 0,
        });
    };

    const COLORS = ['#00ff88', '#00ffff', '#ff0080', '#ffaa00', '#ffea00', '#007aff', '#ff4d4d', '#a371f7'];

    return (
        <div className="multi-pair-dashboard">
            <div className="dashboard-header">
                <h1>📊 BOOSIS ANT ARMY DASHBOARD</h1>
                {loading && <div className="loading-indicator">Refrescando Batallón...</div>}
            </div>

            <div className="dashboard-controls">
                <div className="grid-selector">
                    <button
                        onClick={() => setGridMode('1')}
                        className={gridMode === '1' ? 'active' : ''}
                    >
                        1X1
                    </button>
                    <button
                        onClick={() => setGridMode('2')}
                        className={gridMode === '2' ? 'active' : ''}
                    >
                        2X1
                    </button>
                    <button
                        onClick={() => setGridMode('2x2')}
                        className={gridMode === '2x2' ? 'active' : ''}
                    >
                        2X2
                    </button>
                    <button
                        onClick={() => setGridMode('4')}
                        className={gridMode === '4' ? 'active' : ''}
                    >
                        4X1
                    </button>
                </div>

                <div className="symbol-toggles">
                    {ALL_SOLDIERS.map(symbol => (
                        <label key={symbol} className="toggle">
                            <input
                                type="checkbox"
                                checked={activeSymbols.includes(`${symbol}USDT`)}
                                onChange={(e) => {
                                    const pair = `${symbol}USDT`;
                                    if (e.target.checked) {
                                        setActiveSymbols([...activeSymbols, pair]);
                                    } else {
                                        setActiveSymbols(activeSymbols.filter(s => s !== pair));
                                    }
                                }}
                            />
                            <span>{symbol}</span>
                        </label>
                    ))}
                </div>
            </div>

            <div className={`pairs-grid grid-${gridMode}`}>
                {activeSymbols.map((symbol, index) => (
                    <PairCard
                        key={symbol}
                        symbol={symbol}
                        data={pairsData[symbol]}
                        token={token || localStorage.getItem('token')}
                        loadDelay={index * 300}
                    />
                ))}

                {portfolio && (
                    <PortfolioCard portfolio={portfolio} colors={COLORS} />
                )}
            </div>

            {portfolio && (
                <div className="status-bar">
                    <div className="metric">
                        <label>Balance Total</label>
                        <div className="value">${portfolio.totalBalance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
                    </div>
                    <div className="metric">
                        <label>P&L Global</label>
                        <div className={`value ${portfolio.pnl >= 0 ? 'positive' : 'positive'}`} style={{ color: portfolio.pnl >= 0 ? '#00ff88' : '#ff0064' }}>
                            ${portfolio.pnl.toFixed(2)} ({portfolio.pnlPercent}%)
                        </div>
                    </div>
                    <div className="metric">
                        <label>Hormigas en Combate</label>
                        <div className="value">{portfolio.totalTrades} Trades</div>
                    </div>
                    <div className="metric">
                        <label>Efectividad (WR)</label>
                        <div className="value">{portfolio.winRate}%</div>
                    </div>
                </div>
            )}
        </div>
    );
}
