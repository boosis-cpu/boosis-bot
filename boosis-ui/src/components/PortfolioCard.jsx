import React from 'react';
import {
    PieChart, Pie, Cell, Tooltip, ResponsiveContainer
} from 'recharts';

export default function PortfolioCard({ portfolio, colors = ['#00ff88', '#00ffff', '#ff0080', '#ffaa00', '#ffea00'] }) {
    if (!portfolio || !portfolio.pairBreakdown) return null;

    return (
        <div className="pair-card portfolio-card">
            <h3>DISTRIBUCIÓN DE PORTFOLIO</h3>

            <div className="pie-section">
                <div className="pie-chart-container">
                    <ResponsiveContainer width="100%" height={160} minWidth={0}>
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
