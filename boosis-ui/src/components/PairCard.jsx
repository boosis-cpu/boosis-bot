import React, { useState, useEffect } from 'react';
import axios from 'axios';
import CandlestickChart from './Charts/CandlestickChart';
import { addTradingPair, removeTradingPair } from '../services/api';
import { Play, Square } from 'lucide-react';

export default function PairCard({ symbol, data, token, loadDelay = 0, onToggle }) {
    const [actionLoading, setActionLoading] = useState(false);
    const [feedback, setFeedback] = useState(null);
    const [confirmStop, setConfirmStop] = useState(false);

    const showFeedback = (msg, type = 'success') => {
        setFeedback({ msg, type });
        setTimeout(() => setFeedback(null), 3000);
    };

    const handleToggleClick = () => {
        if (data.status === 'inactive') {
            executeToggle('start');
        } else {
            setConfirmStop(true);
        }
    };

    const executeToggle = async (action) => {
        try {
            setActionLoading(true);
            setConfirmStop(false);
            if (action === 'start') {
                await addTradingPair(symbol, 'BoosisTrend');
                showFeedback(`${symbol} activado`);
            } else {
                await removeTradingPair(symbol);
                showFeedback(`${symbol} detenido`);
            }
            onToggle?.();
        } catch (error) {
            const msg = error.response?.status === 429
                ? 'Rate limit - espera unos segundos'
                : error.response?.data?.error || 'Error de conexión';
            showFeedback(msg, 'error');
            console.error('Error toggling pair:', error);
        } finally {
            setActionLoading(false);
        }
    };

    useEffect(() => {
        // Component mounted, CandlestickChart will handle data loading
    }, [symbol, token]);

    if (!data) return <div className="pair-card loading">Cargando {symbol}...</div>;

    const latestCandle = data.latestCandle || {};
    const currentPrice = parseFloat(latestCandle.close || 0);
    const change = data.change || 0;
    const trades = Number(data.metrics?.totalTrades || data.metrics?.trades) || 0;
    const winningTrades = Number(data.metrics?.winningTrades) || 0;
    const winRate = trades > 0 ? (winningTrades / trades * 100).toFixed(1) : 0;
    const balance = (Number(data.balance?.usdt) || 0) + (Number(data.balance?.assetValue) || 0);

    return (
        <div className={`pair-card ${data.status === 'inactive' ? 'is-inactive' : ''}`}>
            <div className="pair-card-header">
                <div className="title-area">
                    <h3>{symbol}</h3>
                    <span className={`status-pill ${data.status === 'inactive' ? 'inactive' : (data.activePosition ? 'active' : 'idle')}`}>
                        {data.status === 'inactive' ? '⚪ INACTIVE' : (data.activePosition ? '🔵 IN POSITION' : '🟢 WAITING')}
                    </span>
                </div>

                <button
                    className={`pair-toggle-btn ${data.status === 'inactive' ? 'start' : 'stop'}`}
                    onClick={handleToggleClick}
                    disabled={actionLoading || confirmStop}
                    title={data.status === 'inactive' ? 'Activar Hormiga' : 'Detener Hormiga'}
                >
                    {actionLoading ? '...' : (data.status === 'inactive' ? <Play size={14} /> : <Square size={14} />)}
                </button>
            </div>

            {confirmStop && (
                <div style={{
                    padding: '8px 12px',
                    borderRadius: '6px',
                    fontSize: '12px',
                    fontWeight: 'bold',
                    textAlign: 'center',
                    marginBottom: '8px',
                    background: 'rgba(255, 0, 100, 0.1)',
                    border: '1px solid #ff0064',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: '8px',
                }}>
                    <span style={{ color: '#ff0064' }}>Detener {symbol}?</span>
                    <div style={{ display: 'flex', gap: '6px' }}>
                        <button
                            onClick={() => executeToggle('stop')}
                            style={{
                                background: '#ff0064',
                                color: 'white',
                                border: 'none',
                                padding: '4px 12px',
                                borderRadius: '4px',
                                cursor: 'pointer',
                                fontSize: '11px',
                                fontWeight: 'bold',
                            }}
                        >
                            Si
                        </button>
                        <button
                            onClick={() => setConfirmStop(false)}
                            style={{
                                background: 'transparent',
                                color: '#8b949e',
                                border: '1px solid #30363d',
                                padding: '4px 12px',
                                borderRadius: '4px',
                                cursor: 'pointer',
                                fontSize: '11px',
                            }}
                        >
                            No
                        </button>
                    </div>
                </div>
            )}

            {feedback && (
                <div style={{
                    padding: '6px 12px',
                    borderRadius: '6px',
                    fontSize: '12px',
                    fontWeight: 'bold',
                    textAlign: 'center',
                    marginBottom: '8px',
                    background: feedback.type === 'error' ? 'rgba(255, 0, 100, 0.15)' : 'rgba(0, 255, 136, 0.15)',
                    color: feedback.type === 'error' ? '#ff0064' : '#00ff88',
                    border: `1px solid ${feedback.type === 'error' ? '#ff0064' : '#00ff88'}`,
                }}>
                    {feedback.msg}
                </div>
            )}

            <div className="chart-container" style={{ minWidth: 0, minHeight: 150 }}>
                <CandlestickChart symbol={symbol} token={token} height={150} mini={true} />
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
