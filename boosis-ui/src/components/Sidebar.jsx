
import React from 'react';

const Sidebar = ({ data, health }) => {
    return (
        <aside className="sidebar-area panel" style={{ border: 'none', background: 'transparent', padding: '0' }}>
            <div className="mb-6">
                <h3 className="stat-label-tiny mb-3" style={{ color: 'var(--accent-primary)', letterSpacing: '0.1em', fontWeight: 800 }}>TERMINAL REAL (BINANCE)</h3>
                {data.realBalance && data.realBalance.length > 0 ? (
                    <div className="space-y-4">
                        <div style={{
                            background: 'var(--bg-card)',
                            backdropFilter: 'var(--glass)',
                            border: '1px solid var(--border-color)',
                            padding: '20px',
                            borderRadius: '0',
                            boxShadow: 'var(--card-shadow)',
                            position: 'relative',
                            overflow: 'hidden'
                        }}>
                            <div style={{ position: 'absolute', top: 0, left: 0, width: '4px', height: '100%', background: 'var(--accent-primary)' }} />
                            <div className="stat-label-tiny" style={{ color: 'var(--text-muted)', marginBottom: '4px' }}>EQUITY ESTIMADO</div>
                            <div style={{ fontSize: '28px', fontWeight: '900', fontFamily: 'JetBrains Mono', color: 'var(--text-main)', letterSpacing: '-0.02em' }}>
                                ${data.totalBalanceUSD ? data.totalBalanceUSD.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '0.00'}
                            </div>
                            <div style={{ fontSize: '10px', color: 'var(--accent-primary)', textTransform: 'uppercase', marginTop: '8px', fontWeight: 700, letterSpacing: '0.05em' }}>
                                <span style={{ display: 'inline-block', width: '6px', height: '6px', borderRadius: '50%', background: 'var(--accent-primary)', marginRight: '6px', boxShadow: '0 0 8px var(--accent-primary)' }} />
                                USD Connectivity Active
                            </div>
                        </div>

                        <div className="stat-label-tiny mt-6 mb-2" style={{ color: 'var(--text-muted)', borderBottom: '1px solid var(--border-color)', paddingBottom: '8px', fontWeight: 800 }}>INVENTARIO DE ACTIVOS</div>
                        <div className="space-y-1">
                            {data.realBalance
                                .filter(asset => !['GVT', 'NCASH', 'XVG', 'VTHO'].includes(asset.asset))
                                .map((asset, idx) => (
                                    <div key={idx} style={{
                                        display: 'flex',
                                        justifyContent: 'space-between',
                                        alignItems: 'center',
                                        padding: '10px 12px',
                                        borderRadius: '0',
                                        background: idx % 2 === 0 ? 'rgba(255,255,255,0.02)' : 'transparent',
                                        border: '1px solid transparent',
                                        transition: 'all 0.2s'
                                    }}>
                                        <div>
                                            <div style={{ fontSize: '13px', fontWeight: '800', color: 'var(--text-main)', fontFamily: 'Outfit' }}>{asset.asset}</div>
                                            <div style={{ fontSize: '10px', color: 'var(--text-muted)', fontFamily: 'JetBrains Mono' }}>
                                                ${asset.priceUSD ? asset.priceUSD.toFixed(asset.priceUSD > 1 ? 2 : 6) : '0.00'}
                                            </div>
                                        </div>
                                        <div style={{ textAlign: 'right' }}>
                                            <div style={{ fontSize: '13px', fontWeight: '800', color: 'var(--text-main)', fontFamily: 'JetBrains Mono' }}>
                                                {asset.total.toLocaleString('en-US', { maximumFractionDigits: 6 })}
                                            </div>
                                            <div style={{ fontSize: '11px', color: asset.locked > 0 ? 'var(--accent-secondary)' : 'var(--success)', fontWeight: 700 }}>
                                                {asset.locked > 0 ? '🔒 ' : '≈ '}${asset.valueUSD ? asset.valueUSD.toFixed(2) : '0.00'}
                                            </div>
                                        </div>
                                    </div>
                                ))}
                        </div>
                    </div>
                ) : (
                    <div style={{ background: 'var(--bg-card)', padding: '20px', borderRadius: '0', border: '1px solid var(--border-color)' }}>
                        <div style={{ fontSize: '11px', color: 'var(--text-muted)', textAlign: 'center' }} className="animate-pulse">
                            📡 Sincronizando telemetría de Binance...
                        </div>
                    </div>
                )}
            </div>

            <div className="mb-8">
                <h3 className="stat-label-tiny mb-4" style={{ color: 'var(--text-muted)', fontWeight: 800 }}>SYSTEM VITALS</h3>
                <div style={{ background: 'rgba(0,0,0,0.2)', borderRadius: '0', padding: '16px', border: '1px solid var(--border-color)' }} className="space-y-4">
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ color: 'var(--text-muted)', fontSize: '11px', fontWeight: 600 }}>Core Uptime</span>
                        <span style={{ color: 'var(--text-main)', fontSize: '12px', fontWeight: 800, fontFamily: 'JetBrains Mono' }}>
                            {health ? `${Math.floor(health.uptime / 3600)}h ${Math.floor((health.uptime % 3600) / 60)}m` : '--'}
                        </span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ color: 'var(--text-muted)', fontSize: '11px', fontWeight: 600 }}>Neural Connection</span>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: health?.bot.wsConnected ? 'var(--success)' : 'var(--danger)', boxShadow: `0 0 10px ${health?.bot.wsConnected ? 'var(--success)' : 'var(--danger)'}` }} />
                            <span style={{
                                color: health?.bot.wsConnected ? 'var(--success)' : 'var(--danger)',
                                fontWeight: '900',
                                fontSize: '10px',
                                letterSpacing: '0.05em'
                            }}>
                                {health?.bot.wsConnected ? 'ESTABLISHED' : 'SEVERED'}
                            </span>
                        </div>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ color: 'var(--text-muted)', fontSize: '11px', fontWeight: 600 }}>API Latency</span>
                        <span style={{ color: health?.latency?.apiLatency > 400 ? 'var(--danger)' : 'var(--success)', fontFamily: 'JetBrains Mono', fontSize: '12px', fontWeight: 700 }}>
                            {health?.latency?.apiLatency || '--'}ms
                        </span>
                    </div>
                </div>
            </div>


        </aside>
    );
};

export default Sidebar;
