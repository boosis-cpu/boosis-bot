import React, { useState } from 'react';
import { addTradingPair, removeTradingPair } from '../services/api';
import EquitySparkline from './Charts/EquitySparkline';
import { Play, Square, Shield, Zap, TrendingUp, TrendingDown, Minus, Copy } from 'lucide-react';

/**
 * 🐜 BOOSIS LEAD CARD v3.0
 * Rediseño minimalista inspirado en Binance Lead Traders.
 */
export default function PairCard({ symbol, data, token, onToggle }) {
    const [actionLoading, setActionLoading] = useState(false);
    const [confirmStop, setConfirmStop] = useState(false);

    if (!data) return <div className="pair-card loading">Cargando {symbol}...</div>;

    const executeToggle = async (action) => {
        try {
            setActionLoading(true);
            setConfirmStop(false);
            if (action === 'start') {
                await addTradingPair(symbol, 'BoosisTrend');
            } else {
                await removeTradingPair(symbol);
            }
            onToggle?.();
        } catch (error) {
            console.error('Error toggling pair:', error);
        } finally {
            setActionLoading(false);
        }
    };

    const metrics = data.metrics || {};
    const netPnL = Number(metrics.netPnL || 0);
    const winRate = metrics.winRate ? Number(metrics.winRate).toFixed(1) : '0.0';
    const trades = metrics.totalTrades || 0;

    // Simular ROI basado en capital de $200 (configuración actual del reto)
    const initialCapital = data.initialCapital || 200;
    const roi = ((netPnL / initialCapital) * 100).toFixed(2);

    const pnlHistory = metrics.pnlHistory || [];
    const priceHistory = data.priceHistory || [];
    const regime = data.marketRegime || { name: 'RUIDO', state: 0 };

    // Color de la gráfica basado en el movimiento del precio
    const statusColor = netPnL >= 0 ? '#00ff88' : '#ff0064';

    return (
        <div className={`lead-card ${data.status === 'inactive' ? 'is-inactive' : ''}`}>
            {/* Header: Símbolo y Modo */}
            <div className="lead-header">
                <div className="lead-title">
                    <h3>{symbol.replace('USDT', '')}<span>USDT</span></h3>
                    <div className="lead-subtitle">
                        Perpetuo | <span style={{ color: statusColor }}>{netPnL >= 0 ? 'Long' : 'Short'} 10x</span> | 🐜 1
                    </div>
                </div>
                <button
                    className="copy-btn"
                    onClick={() => data.status === 'inactive' ? executeToggle('start') : setConfirmStop(true)}
                >
                    {data.status === 'inactive' ? <Play size={14} /> : 'Detener'}
                </button>
            </div>

            {/* Cuerpo: PnL y Gráfica */}
            <div className="lead-body">
                <div className="pnl-section">
                    <div className="pnl-label">PnL (USD)</div>
                    <div className="pnl-value" style={{ color: statusColor }}>
                        {netPnL >= 0 ? '+' : ''}{netPnL.toFixed(2)}
                    </div>
                    <div className="roi-value" style={{ color: statusColor }}>{roi}%</div>
                </div>
                <div className="sparkline-section" title="Movimiento de Precio (30m)">
                    <EquitySparkline data={priceHistory} dataKey="price" />
                </div>
            </div>

            {/* Footer: Métricas Detalladas */}
            <div className="lead-footer">
                <div className="footer-item">
                    <label>Duración</label>
                    <div className="val">2d 4h 12m</div>
                </div>
                <div className="footer-item">
                    <label>Inversión mín.</label>
                    <div className="val">20.00 USDT</div>
                </div>
            </div>

            <div className="lead-footer secondary">
                <div className="footer-item">
                    <label>Trades / WR</label>
                    <div className="val">{trades} / {winRate}%</div>
                </div>
                <div className="footer-item">
                    <label>Régimen Market</label>
                    <div className="val" style={{ color: '#00ffff', fontSize: '10px' }}>{regime.name}</div>
                </div>
            </div>

            {confirmStop && (
                <div className="confirm-overlay">
                    <p>¿Detener {symbol}?</p>
                    <div className="btn-group">
                        <button onClick={() => executeToggle('stop')} className="confirm">Si</button>
                        <button onClick={() => setConfirmStop(false)}>No</button>
                    </div>
                </div>
            )}
        </div>
    );
}
