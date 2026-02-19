import React, { useState, useEffect } from 'react';
import { getStatus } from '../services/api';
import { Activity, Shield, TrendingUp, TrendingDown, Target, Zap } from 'lucide-react';

/**
 * 🛰️ GLOBAL MARKET SCANNER v1.0
 * Reemplaza el dashboard de scalping con una terminal de telemetría Quant.
 */
const GlobalMarketScanner = ({ token }) => {
    const [scannerData, setScannerData] = useState([]);
    const [loading, setLoading] = useState(true);

    const SYMBOLS = ['BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'PEPEUSDT', 'WIFUSDT', 'BONKUSDT', 'DOGEUSDT', 'SHIBUSDT', 'LINKUSDT', 'XRPUSDT', 'ADAUSDT', 'AVAXUSDT'];

    const fetchAllStatus = async () => {
        try {
            const results = await Promise.all(
                SYMBOLS.map(async (s) => {
                    try {
                        const res = await getStatus(s);
                        return { symbol: s, ...res.data };
                    } catch (e) {
                        return { symbol: s, error: true };
                    }
                })
            );
            setScannerData(results.filter(r => !r.error));
        } catch (error) {
            console.error('Error in Scanner fetch:', error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchAllStatus();
        const interval = setInterval(fetchAllStatus, 15000);
        return () => clearInterval(interval);
    }, []);

    const getRegimeColor = (label) => {
        if (!label) return '#8b949e';
        const l = label.toUpperCase();
        if (l.includes('ALCISTA') || l.includes('ACUMULACIÓN')) return '#2ea043';
        if (l.includes('BAJISTA') || l.includes('DISTRIBUCIÓN')) return '#f85149';
        if (l.includes('LATERAL') || l.includes('AGOTAMIENTO')) return '#d29922';
        return '#8b949e';
    };

    return (
        <div className="market-scanner-container">
            <div className="scanner-header">
                <div className="flex items-center gap-2">
                    <Activity size={18} color="#58a6ff" />
                    <h2 style={{ margin: 0, fontSize: '1rem', letterSpacing: '1px' }}>GLOBAL MARKET SCANNER <span className="text-secondary" style={{ fontSize: '0.7rem', fontWeight: 400 }}>(Live Telemetry)</span></h2>
                </div>
                <div className="scanner-stats">
                    Active Soldiers: <span className="text-accent">{scannerData.length}</span>
                </div>
            </div>

            <div className="scanner-table-wrapper">
                <table className="scanner-table">
                    <thead>
                        <tr>
                            <th>RECLUTA (ASSET)</th>
                            <th>ÚLTIMO PRECIO</th>
                            <th>CAMBIO 24H</th>
                            <th>RÉGIMEN HMM (JAMES AX)</th>
                            <th>ESCUDO</th>
                            <th>ESTRATEGIA</th>
                            <th>ESTADO</th>
                        </tr>
                    </thead>
                    <tbody>
                        {scannerData.map((pair) => (
                            <tr key={pair.symbol}>
                                <td className="font-bold flex items-center gap-2">
                                    <div className="pair-icon-mini">
                                        <Zap size={12} fill="#58a6ff" color="#58a6ff" />
                                    </div>
                                    {pair.symbol.replace('USDT', '')}
                                </td>
                                <td>
                                    <span className="price-val">
                                        ${pair.latestCandle?.close > 1 ? pair.latestCandle.close.toLocaleString() : pair.latestCandle?.close.toFixed(8)}
                                    </span>
                                </td>
                                <td className={pair.change >= 0 ? 'text-success' : 'text-danger'}>
                                    {pair.change >= 0 ? '+' : ''}{pair.change?.toFixed(2)}%
                                </td>
                                <td>
                                    <div className="regime-badge" style={{ borderColor: getRegimeColor(pair.marketRegime?.name) }}>
                                        <div className="pulse-mini" style={{ background: getRegimeColor(pair.marketRegime?.name) }}></div>
                                        {pair.marketRegime?.name || 'ANALIZANDO...'}
                                    </div>
                                </td>
                                <td>
                                    {pair.shieldMode ? (
                                        <span className="shield-active">
                                            <Shield size={12} strokeWidth={3} /> BLOQUEADO
                                        </span>
                                    ) : (
                                        <span className="shield-inactive">NORMAL</span>
                                    )}
                                </td>
                                <td>
                                    <span className="strategy-tag">{pair.turtleMode ? 'TURTLE-S' : 'TREND-H'}</span>
                                </td>
                                <td>
                                    <span className={`status-dot ${pair.status === 'ACTIVE' ? 'bg-success' : 'bg-warning'}`}></span>
                                    {pair.status}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
};

export default GlobalMarketScanner;
