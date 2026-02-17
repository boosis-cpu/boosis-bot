
import React from 'react';
import { AreaChart, Area, ResponsiveContainer, Tooltip } from 'recharts';

const Sidebar = ({ data, health }) => {
    return (
        <aside className="sidebar-area panel">
            <h3 className="stat-label-tiny mb-3">Balance Real (Binance)</h3>
            {data.realBalance && data.realBalance.length > 0 ? (
                <div style={{ marginBottom: '20px' }}>
                    {/* Total Balance */}
                    <div style={{
                        background: 'rgba(56, 139, 253, 0.1)',
                        border: '1px solid rgba(56, 139, 253, 0.3)',
                        borderRadius: '8px',
                        padding: '12px',
                        marginBottom: '16px'
                    }}>
                        <div style={{ fontSize: '10px', color: '#8b949e', marginBottom: '4px' }}>BALANCE TOTAL ESTIMADO</div>
                        <div style={{ fontSize: '20px', fontWeight: '800', color: '#58a6ff' }}>
                            ${data.totalBalanceUSD ? data.totalBalanceUSD.toFixed(2) : '0.00'}
                        </div>
                        <div style={{ fontSize: '10px', color: '#8b949e', marginTop: '2px' }}>USD</div>
                    </div>

                    {/* Individual Assets */}
                    <div style={{ fontSize: '10px', color: '#8b949e', marginBottom: '8px', fontWeight: '600' }}>MIS ACTIVOS</div>
                    {data.realBalance.map((asset, idx) => (
                        <div key={idx} style={{
                            display: 'flex',
                            flexDirection: 'column',
                            padding: '10px 0',
                            borderBottom: idx < data.realBalance.length - 1 ? '1px solid #21262d' : 'none'
                        }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                                <span style={{ fontSize: '13px', fontWeight: '700', color: '#e6edf3' }}>{asset.asset}</span>
                                <span style={{ fontSize: '13px', fontWeight: '700', color: '#e6edf3' }}>
                                    {asset.total.toFixed(['USDT', 'MXN', 'USD', 'EUR'].includes(asset.asset) ? 2 : 8)}
                                </span>
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                <span style={{ fontSize: '11px', color: '#8b949e' }}>
                                    ${asset.priceUSD ? asset.priceUSD.toFixed(asset.priceUSD > 1 ? 2 : 8) : '0.00'} USD
                                </span>
                                <span style={{ fontSize: '11px', color: '#58a6ff', fontWeight: '600' }}>
                                    ≈ ${asset.valueUSD ? asset.valueUSD.toFixed(2) : '0.00'}
                                </span>
                            </div>
                        </div>
                    ))}
                </div>
            ) : (
                <div style={{ fontSize: '11px', color: '#8b949e', marginBottom: '20px' }}>
                    Conectando a Binance...
                </div>
            )}

            <h3 className="stat-label-tiny mb-3">Simulación de Wallet</h3>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '10px' }}>
                <span style={{ fontSize: '12px', color: '#8b949e' }}>USDT Disponible</span>
                <span style={{ fontSize: '12px', fontWeight: 'bold' }}>${data.balance?.usdt?.toFixed(2)}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '20px' }}>
                <span style={{ fontSize: '12px', color: '#8b949e' }}>Tenencia BTC</span>
                <span style={{ fontSize: '12px', fontWeight: 'bold' }}>{data.balance?.asset?.toFixed(6)} BTC</span>
            </div>

            <h3 className="stat-label-tiny mb-3">Salud del Sistema</h3>
            <div className="space-y-2">
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px' }}>
                    <span style={{ color: '#8b949e' }}>Uptime</span>
                    <span>{health ? `${Math.floor(health.uptime / 60)}m` : '--'}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px' }}>
                    <span style={{ color: '#8b949e' }}>WebSocket</span>
                    <span style={{ color: health?.bot.wsConnected ? '#2ea043' : '#da3633' }}>
                        {health?.bot.wsConnected ? 'ACTIVO' : 'OFFLINE'}
                    </span>
                </div>
            </div>

            <h3 className="stat-label-tiny mt-6 mb-3">Monitor de Latencia</h3>
            <div className="space-y-2">
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px' }}>
                    <span style={{ color: '#8b949e' }}>Binance API</span>
                    <span style={{ color: health?.latency?.apiLatency > 500 ? '#f85149' : '#2ea043' }}>
                        {health?.latency?.apiLatency || '--'}ms
                    </span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px' }}>
                    <span style={{ color: '#8b949e' }}>WebSocket RTT</span>
                    <span style={{ color: health?.latency?.wsLatency > 300 ? '#f85149' : '#2ea043' }}>
                        {health?.latency?.wsLatency || '--'}ms
                    </span>
                </div>
            </div>
            <h3 className="stat-label-tiny mt-6 mb-3">Crecimiento de Capital</h3>
            <div style={{ height: '120px', width: '100%', minWidth: 0 }}>
                {data.equityHistory && data.equityHistory.length > 0 ? (
                    <ResponsiveContainer width="99%" height="100%">
                        <AreaChart data={data.equityHistory}>
                            <defs>
                                <linearGradient id="colorVal" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="5%" stopColor="#2ea043" stopOpacity={0.3} />
                                    <stop offset="95%" stopColor="#2ea043" stopOpacity={0} />
                                </linearGradient>
                            </defs>
                            <Area type="monotone" dataKey="value" stroke="#3fb950" fillOpacity={1} fill="url(#colorVal)" dot={false} />
                            <Tooltip hide />
                        </AreaChart>
                    </ResponsiveContainer>
                ) : (
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#8b949e', fontSize: '11px' }}>
                        Sin datos de equity
                    </div>
                )}
            </div>
        </aside>
    );
};

export default Sidebar;
