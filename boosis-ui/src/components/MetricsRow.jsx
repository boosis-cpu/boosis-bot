
import React from 'react';

const MetricsRow = ({ totalBalance, realUsdt, data, metrics, trades }) => {
    return (
        <div className="metrics-row">
            <div className="stat-card-compact">
                <div className="stat-label-tiny">Total Portfolio</div>
                <div className="stat-value-med" style={{ color: 'var(--success)' }}>${(Number(totalBalance) || 0).toFixed(2)}</div>
            </div>
            <div className="stat-card-compact">
                <div className="stat-label-tiny">Binance Real (USDT)</div>
                <div className="stat-value-med" style={{ color: 'var(--accent-secondary)' }}>${realUsdt}</div>
            </div>
            <div className="stat-card-compact">
                <div className="stat-label-tiny">Volatilidad (ATR)</div>
                <div className="stat-value-med" style={{ color: 'var(--accent-primary)' }}>{data.marketStatus?.volatility || '0.00'}%</div>
            </div>
            <div className="stat-card-compact">
                <div className="stat-label-tiny">Tasa de Victoria</div>
                <div className="stat-value-med" style={{ color: 'var(--success)' }}>{metrics.winRate}</div>
            </div>
            <div className="stat-card-compact">
                <div className="stat-label-tiny">Slippage Promedio</div>
                <div className="stat-value-med" style={{ color: 'var(--text-dim)' }}>
                    {trades.length > 0 ?
                        (trades.reduce((sum, t) => sum + (t.slippage || 0), 0) / trades.filter(t => t.slippage).length || 0).toFixed(3) :
                        '0.00'
                    }%
                </div>
            </div>
            <div className="stat-card-compact">
                <div className="stat-label-tiny">Factor de Beneficio</div>
                <div className="stat-value-med" style={{ color: 'var(--accent-primary)' }}>{metrics.profitFactor}</div>
            </div>
        </div>
    );
};

export default MetricsRow;
