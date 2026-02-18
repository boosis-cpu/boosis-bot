import React from 'react';
import {
    PieChart, Pie, Cell, Tooltip, ResponsiveContainer,
    BarChart, Bar, XAxis, YAxis, CartesianGrid
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

            <div className="pnl-bar-section" style={{ marginTop: '20px', borderTop: '1px solid #1a1f26', paddingTop: '15px' }}>
                <h4 style={{ fontSize: '10px', color: '#71717a', marginBottom: '10px' }}>ESTATUS DE COMBATE (PNL $)</h4>
                <ResponsiveContainer width="100%" height={120}>
                    <BarChart data={portfolio.pairBreakdown}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#1a1f26" vertical={false} />
                        <XAxis
                            dataKey="name"
                            axisLine={false}
                            tickLine={false}
                            tick={{ fill: '#888', fontSize: 10 }}
                        />
                        <YAxis hide domain={['auto', 'auto']} />
                        <Tooltip
                            cursor={{ fill: 'rgba(255,255,255,0.05)' }}
                            contentStyle={{ backgroundColor: '#111', border: '1px solid #00ffff', borderRadius: '4px' }}
                            itemStyle={{ color: '#fff' }}
                        />
                        <Bar
                            dataKey="pnl"
                            radius={[4, 4, 0, 0]}
                        >
                            {portfolio.pairBreakdown.map((entry, index) => (
                                <Cell
                                    key={`cell-bar-${index}`}
                                    fill={entry.pnl >= 0 ? '#00ff88' : '#ff0064'}
                                />
                            ))}
                        </Bar>
                    </BarChart>
                </ResponsiveContainer>
            </div>

            <div className="portfolio-total-metric">
                <div className="metric-row">
                    <span>Profit/Loss Total</span>
                    <span className={portfolio.pnl >= 0 ? 'positive' : 'negative'}>
                        {portfolio.pnl >= 0 ? '+' : ''}${portfolio.pnl.toFixed(2)}
                    </span>
                </div>
                <div className="metric-row">
                    <span>Rendimiento Global</span>
                    <span className={portfolio.pnl >= 0 ? 'positive' : 'negative'}>
                        {portfolio.pnl >= 0 ? '+' : ''}{portfolio.pnlPercent}%
                    </span>
                </div>
            </div>
        </div>
    );
}
