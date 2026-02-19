import React from 'react';
import {
    PieChart, Pie, Cell, ResponsiveContainer,
    BarChart, Bar, XAxis, YAxis, Tooltip
} from 'recharts';
import { Wallet, TrendingUp, Anchor, Activity, Target } from 'lucide-react';

/**
 * 🛰️ PORTFOLIO COMMAND CENTER v3.0
 * Rediseño premium para eliminar la estética de "Excel".
 * Enfoque en densidad de datos y visualización tipo "Terminal Quant".
 */
export default function PortfolioCard({ portfolio, colors = ['#00ff88', '#00ffff', '#7000ff', '#ff0064', '#ffaa00', '#007aff', '#ffea00', '#ffffff'] }) {
    if (!portfolio || !portfolio.pairBreakdown) return null;

    const totalEquity = portfolio.totalEquity || portfolio.balance?.usdt || 0;
    const globalPnL = portfolio.pnl || 0;
    const globalPnLPercent = portfolio.pnlPercent || 0;
    const winRate = portfolio.winRate || 0;

    return (
        <div className="portfolio-command-center">
            {/* 1. Resumen Ejecutivo (Left) */}
            <div className="command-sidebar">
                <div className="sidebar-group">
                    <label><Wallet size={12} /> TOTAL EQUITY</label>
                    <div className="big-value">${totalEquity.toLocaleString(undefined, { minimumFractionDigits: 2 })}</div>
                </div>

                <div className="sidebar-group">
                    <label><TrendingUp size={12} /> GLOBAL P&L</label>
                    <div className={`big-value ${globalPnL >= 0 ? 'pos' : 'neg'}`}>
                        {globalPnL >= 0 ? '+' : ''}${globalPnL.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                        <span className="percent">({globalPnLPercent}%)</span>
                    </div>
                </div>

                <div className="mini-stats">
                    <div className="stat">
                        <label>Efectividad</label>
                        <div className="val">{winRate}%</div>
                    </div>
                    <div className="stat">
                        <label>Estado</label>
                        <div className="val status-online">LIVE</div>
                    </div>
                </div>
            </div>

            {/* 2. Distribución Visual (Center) */}
            <div className="command-main">
                <div className="chart-header">
                    <Activity size={14} /> DISTRIBUCIÓN DE ACTIVOS Y EXPOSICIÓN
                </div>
                <div className="main-visual">
                    <div className="donut-wrapper">
                        <ResponsiveContainer width="100%" height={180}>
                            <PieChart>
                                <Pie
                                    data={portfolio.pairBreakdown}
                                    cx="50%"
                                    cy="50%"
                                    innerRadius={55}
                                    outerRadius={75}
                                    paddingAngle={4}
                                    dataKey="value"
                                    animationBegin={200}
                                    stroke="none"
                                >
                                    {portfolio.pairBreakdown.map((entry, index) => (
                                        <Cell key={`cell-${index}`} fill={colors[index % colors.length]} />
                                    ))}
                                </Pie>
                            </PieChart>
                        </ResponsiveContainer>
                        <div className="donut-center">
                            <Anchor size={20} color="#888" />
                        </div>
                    </div>

                    <div className="allocation-list">
                        {portfolio.pairBreakdown.map((pair, i) => {
                            const percent = ((pair.value / totalEquity) * 100).toFixed(1);
                            return (
                                <div key={pair.name} className="asset-row">
                                    <div className="asset-info">
                                        <span className="dot" style={{ background: colors[i % colors.length] }}></span>
                                        <span className="name">{pair.name}</span>
                                        <span className="perc">{percent}%</span>
                                    </div>
                                    <div className="progress-bar">
                                        <div
                                            className="fill"
                                            style={{
                                                width: `${percent}%`,
                                                background: colors[i % colors.length],
                                                boxShadow: `0 0 10px ${colors[i % colors.length]}33`
                                            }}
                                        ></div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            </div>

            {/* 3. Performance Radar (Right) */}
            <div className="command-performance">
                <div className="chart-header">
                    <Target size={14} /> P&L POR SOLDADO (USDT)
                </div>
                <ResponsiveContainer width="100%" height={180}>
                    <BarChart data={portfolio.pairBreakdown} margin={{ top: 20, right: 10, left: 0, bottom: 5 }}>
                        <XAxis
                            dataKey="name"
                            axisLine={false}
                            tickLine={false}
                            tick={{ fill: '#666', fontSize: 10 }}
                        />
                        <Tooltip
                            cursor={{ fill: 'rgba(255,255,255,0.03)' }}
                            contentStyle={{ background: '#0a0c10', border: '1px solid #1e232d', fontSize: '12px' }}
                        />
                        <Bar dataKey="pnl" radius={[4, 4, 0, 0]}>
                            {portfolio.pairBreakdown.map((entry, index) => (
                                <Cell key={index} fill={entry.pnl >= 0 ? '#00ff88' : '#ff0064'} />
                            ))}
                        </Bar>
                    </BarChart>
                </ResponsiveContainer>
            </div>
        </div>
    );
}
