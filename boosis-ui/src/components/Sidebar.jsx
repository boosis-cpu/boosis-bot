
import React from 'react';
import { AreaChart, Area, ResponsiveContainer, Tooltip } from 'recharts';

const Sidebar = ({ data, health }) => {
    return (
        <aside className="sidebar-area panel" style={{ border: 'none', background: 'transparent' }}>
            <div className="mb-6">
                <h3 className="stat-label-tiny mb-3" style={{ color: 'var(--accent-primary)' }}>Terminal Real (Binance)</h3>
                {data.realBalance && data.realBalance.length > 0 ? (
                    <div className="space-y-4">
                        <div style={{
                            background: 'rgba(0, 229, 255, 0.03)',
                            border: '1px solid var(--border-color)',
                            padding: '16px',
                            position: 'relative'
                        }}>
                            <div className="stat-label-tiny" style={{ opacity: 0.7 }}>Equity Estimado</div>
                            <div style={{ fontSize: '24px', fontWeight: '800', fontFamily: 'JetBrains Mono', color: 'var(--text-main)' }}>
                                ${data.totalBalanceUSD ? data.totalBalanceUSD.toFixed(2) : '0.00'}
                            </div>
                            <div style={{ fontSize: '10px', color: 'var(--accent-primary)', textTransform: 'uppercase', marginTop: '4px' }}>USD Connectivity Active</div>
                        </div>

                        <div className="stat-label-tiny mt-4" style={{ borderBottom: '1px solid var(--border-color)', paddingBottom: '4px' }}>Inventario de Activos</div>
                        <div className="space-y-2">
                            {data.realBalance.map((asset, idx) => (
                                <div key={idx} style={{
                                    display: 'flex',
                                    justifyContent: 'space-between',
                                    padding: '8px 0',
                                    borderBottom: '1px solid rgba(255,255,255,0.03)'
                                }}>
                                    <div>
                                        <div style={{ fontSize: '12px', fontWeight: '700', color: 'var(--text-main)' }}>{asset.asset}</div>
                                        <div style={{ fontSize: '10px', color: 'var(--text-muted)' }}>
                                            ${asset.priceUSD ? asset.priceUSD.toFixed(asset.priceUSD > 1 ? 2 : 8) : '0.00'}
                                        </div>
                                    </div>
                                    <div style={{ textAlign: 'right' }}>
                                        <div style={{ fontSize: '12px', fontWeight: '700', color: 'var(--accent-primary)' }}>
                                            {asset.total.toFixed(['USDT', 'MXN', 'USD', 'EUR'].includes(asset.asset) ? 2 : 6)}
                                        </div>
                                        <div style={{ fontSize: '10px', color: 'var(--success)' }}>
                                            ≈ ${asset.valueUSD ? asset.valueUSD.toFixed(2) : '0.00'}
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                ) : (
                    <div style={{ fontSize: '11px', color: 'var(--text-muted)' }} className="animate-pulse">
                        Sincronizando telemetría de Binance...
                    </div>
                )}
            </div>

            <div className="mb-6">
                <h3 className="stat-label-tiny mb-3" style={{ color: 'var(--accent-secondary)' }}>Failsafe Simulator (Paper)</h3>
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0' }}>
                    <span style={{ fontSize: '11px', color: 'var(--text-dim)' }}>USDT Balance</span>
                    <span style={{ fontSize: '11px', fontWeight: '700', fontFamily: 'JetBrains Mono' }}>${data.balance?.usdt?.toFixed(2)}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0' }}>
                    <span style={{ fontSize: '11px', color: 'var(--text-dim)' }}>Asset Hold</span>
                    <span style={{ fontSize: '11px', fontWeight: '700', fontFamily: 'JetBrains Mono' }}>{data.balance?.asset?.toFixed(6)} FET</span>
                </div>
            </div>

            <div className="mb-6">
                <h3 className="stat-label-tiny mb-3">System Vitals</h3>
                <div className="space-y-3">
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px' }}>
                        <span style={{ color: 'var(--text-muted)' }}>Core Uptime</span>
                        <span style={{ color: 'var(--text-main)' }}>{health ? `${Math.floor(health.uptime / 60)}m` : '--'}</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px' }}>
                        <span style={{ color: 'var(--text-muted)' }}>Neural Connection</span>
                        <span style={{
                            color: health?.bot.wsConnected ? 'var(--success)' : 'var(--danger)',
                            fontWeight: '800',
                            fontSize: '10px'
                        }}>
                            {health?.bot.wsConnected ? 'ESTABLISHED' : 'SEVERED'}
                        </span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px' }}>
                        <span style={{ color: 'var(--text-muted)' }}>API Latency</span>
                        <span style={{ color: health?.latency?.apiLatency > 500 ? 'var(--danger)' : 'var(--success)', fontFamily: 'JetBrains Mono' }}>
                            {health?.latency?.apiLatency || '--'}ms
                        </span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px' }}>
                        <span style={{ color: 'var(--text-muted)' }}>WebSocket RTT</span>
                        <span style={{ color: health?.latency?.wsLatency > 300 ? 'var(--danger)' : 'var(--success)', fontFamily: 'JetBrains Mono' }}>
                            {health?.latency?.wsLatency || '--'}ms
                        </span>
                    </div>
                </div>
            </div>

            <div>
                <h3 className="stat-label-tiny mb-3">Equity Growth</h3>
                <div style={{ height: '100px', width: '100%', border: '1px solid var(--border-color)', borderRadius: '4px', background: 'rgba(0,0,0,0.2)' }}>
                    {data.equityHistory && data.equityHistory.length > 0 ? (
                        <ResponsiveContainer width="100%" height="100%">
                            <AreaChart data={data.equityHistory}>
                                <defs>
                                    <linearGradient id="colorVal" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="5%" stopColor="var(--accent-primary)" stopOpacity={0.2} />
                                        <stop offset="95%" stopColor="var(--accent-primary)" stopOpacity={0} />
                                    </linearGradient>
                                </defs>
                                <Area type="monotone" dataKey="value" stroke="var(--accent-primary)" strokeWidth={2} fillOpacity={1} fill="url(#colorVal)" dot={false} />
                                <Tooltip hide />
                            </AreaChart>
                        </ResponsiveContainer>
                    ) : (
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--text-muted)', fontSize: '10px', textTransform: 'uppercase' }}>
                            Awaiting Data Cycle...
                        </div>
                    )}
                </div>
            </div>
        </aside>
    );
};

export default Sidebar;
