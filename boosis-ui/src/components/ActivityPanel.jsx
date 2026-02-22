
import React from 'react';

const ActivityPanel = ({ activeTab, setActiveTab, trades, logs, logsStatus = 'connecting', logsLastAttempt = null }) => {
    return (
        <section className="activity-area" style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden', background: 'transparent', padding: '0' }}>
            <div style={{ display: 'flex', gap: '24px', marginBottom: '20px', borderBottom: '1px solid var(--border-color)', paddingBottom: '16px' }}>
                <div
                    onClick={() => setActiveTab('logs')}
                    style={{
                        cursor: 'pointer',
                        fontSize: '11px',
                        fontWeight: '900',
                        color: activeTab === 'logs' ? 'var(--accent-primary)' : 'var(--text-muted)',
                        textTransform: 'uppercase',
                        letterSpacing: '0.15em',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                        paddingBottom: '8px',
                        borderBottom: activeTab === 'logs' ? '2px solid var(--accent-primary)' : '2px solid transparent',
                        transition: 'all 0.3s ease',
                        position: 'relative'
                    }}
                >
                    <div style={{
                        width: '6px',
                        height: '6px',
                        borderRadius: '50%',
                        background: logsStatus === 'connected' ? 'var(--success)' : 'var(--warning)',
                        boxShadow: `0 0 10px ${logsStatus === 'connected' ? 'var(--success)' : 'var(--warning)'}`
                    }}></div>
                    SYSTEM_KERNEL
                </div>
                <div
                    onClick={() => setActiveTab('trades')}
                    style={{
                        cursor: 'pointer',
                        fontSize: '11px',
                        fontWeight: '900',
                        color: activeTab === 'trades' ? 'var(--accent-primary)' : 'var(--text-muted)',
                        textTransform: 'uppercase',
                        letterSpacing: '0.15em',
                        paddingBottom: '8px',
                        borderBottom: activeTab === 'trades' ? '2px solid var(--accent-primary)' : '2px solid transparent',
                        transition: 'all 0.3s ease'
                    }}
                >
                    TRADE_STREAM ({trades.length})
                </div>
            </div>

            <div style={{ flex: 1, overflowY: 'auto', paddingRight: '4px' }}>
                {activeTab === 'trades' ? (
                    <div className="space-y-2">
                        {trades.length === 0 ? (
                            <div style={{ color: 'var(--text-muted)', fontSize: '10px', textAlign: 'center', padding: '60px', textTransform: 'uppercase', letterSpacing: '0.2em' }}>
                                Awaiting Market Signal...
                            </div>
                        ) : (
                            trades.slice(0, 50).map((trade, i) => (
                                <div key={i} style={{
                                    display: 'flex',
                                    justifyContent: 'space-between',
                                    alignItems: 'center',
                                    padding: '14px 16px',
                                    background: 'var(--bg-card)',
                                    backdropFilter: 'var(--glass)',
                                    border: '1px solid var(--border-color)',
                                    borderLeft: `4px solid ${trade.side === 'BUY' ? 'var(--success)' : 'var(--danger)'}`,
                                    borderRadius: '0',
                                    marginBottom: '8px',
                                    transition: 'transform 0.2s'
                                }}>
                                    <div>
                                        <div style={{ fontSize: '13px', fontWeight: '900', color: 'var(--text-main)', fontFamily: 'Outfit' }}>
                                            {trade.side} {trade.symbol ? trade.symbol.replace('USDT', '') : '???'}
                                        </div>
                                        <div style={{ fontSize: '10px', color: 'var(--text-muted)', marginTop: '4px', fontWeight: 600, letterSpacing: '0.02em' }}>
                                            {trade.reason || 'QUANT_STRATEGY_SIGNAL'}
                                        </div>
                                    </div>
                                    <div style={{ textAlign: 'right' }}>
                                        <div style={{ fontSize: '12px', fontWeight: '800', fontFamily: 'JetBrains Mono', color: 'var(--text-main)' }}>
                                            ${trade.price < 1 ? Number(trade.price).toFixed(6) : Number(trade.price).toFixed(2)}
                                        </div>
                                        <div style={{ fontSize: '10px', color: 'var(--accent-primary)', marginTop: '4px', fontWeight: 700 }}>
                                            {trade.timestamp ? new Date(parseInt(trade.timestamp)).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '--:--:--'}
                                        </div>
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                ) : (
                    <div style={{ fontFamily: 'JetBrains Mono', fontSize: '11px', background: 'rgba(0,0,0,0.2)', padding: '16px', borderRadius: '0', border: '1px solid var(--border-color)' }}>
                        {logs.length === 0 ? (
                            <div style={{ color: 'var(--text-muted)', textAlign: 'center', padding: '40px', fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
                                Awaiting Kernel Stream...
                            </div>
                        ) : (
                            logs.map((log, i) => (
                                <div key={i} style={{
                                    display: 'flex',
                                    gap: '12px',
                                    padding: '8px 0',
                                    borderBottom: '1px solid rgba(255,255,255,0.03)',
                                    color: log.level === 'ERROR' ? 'var(--danger)' : log.level === 'WARN' ? 'var(--warning)' : log.level === 'SUCCESS' ? 'var(--success)' : 'var(--text-dim)',
                                    lineHeight: '1.4'
                                }}>
                                    <span style={{ color: 'var(--text-muted)', minWidth: '75px', fontSize: '9px', opacity: 0.6 }}>{log.timestamp}</span>
                                    <span style={{ fontWeight: '800', minWidth: '60px', fontSize: '9px', opacity: 0.9 }}>[{log.level}]</span>
                                    <span style={{ color: log.level === 'INFO' ? 'var(--text-dim)' : 'inherit', letterSpacing: '-0.01em' }}>{log.message}</span>
                                </div>
                            ))
                        )}
                    </div>
                )}
            </div>
        </section>
    );
};

export default ActivityPanel;
