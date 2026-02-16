
import React from 'react';

const MetricsRow = ({ totalBalance, realUsdt, data, metrics, trades }) => {
    return (
        <div className="metrics-row">
            <div className="stat-card-compact">
                <div className="stat-label-tiny">Total Portfolio</div>
                <div className="stat-value-med text-green-400">${totalBalance.toFixed(2)}</div>
            </div>
            <div className="stat-card-compact" style={{ borderLeftColor: '#ffa500' }}>
                <div className="stat-label-tiny">Binance Real (USDT)</div>
                <div className="stat-value-med" style={{ color: '#ffa500' }}>${realUsdt}</div>
            </div>
            <div className="stat-card-compact" style={{ borderLeftColor: '#9333ea' }}>
                <div className="stat-label-tiny">Volatilidad (ATR)</div>
                <div className="stat-value-med">{data.marketStatus?.volatility || '0.00'}%</div>
            </div>
            <div className="stat-card-compact" style={{ borderLeftColor: '#2ea043' }}>
                <div className="stat-label-tiny">Tasa de Victoria</div>
                <div className="stat-value-med">{metrics.winRate}</div>
            </div>
            <div className="stat-card-compact" style={{ borderLeftColor: '#f0883e' }}>
                <div className="stat-label-tiny">Slippage Promedio</div>
                <div className="stat-value-med">
                    {trades.length > 0 ?
                        (trades.reduce((sum, t) => sum + (t.slippage || 0), 0) / trades.filter(t => t.slippage).length || 0).toFixed(3) :
                        '0.00'
                    }%
                </div>
            </div>
            <div className="stat-card-compact" style={{ borderLeftColor: '#388bfd' }}>
                <div className="stat-label-tiny">Factor de Beneficio</div>
                <div className="stat-value-med">{metrics.profitFactor}</div>
            </div>
        </div>
    );
};

export default MetricsRow;
