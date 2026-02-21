
import React from 'react';

const ActivityPanel = ({ activeTab, setActiveTab, trades, logs, logsStatus = 'connecting', logsLastAttempt = null }) => {
    return (
        <section className="activity-area" style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden', background: 'transparent' }}>
            <div style={{ display: 'flex', gap: '20px', marginBottom: '20px', borderBottom: '1px solid var(--border-color)', paddingBottom: '12px' }}>
                <div
                    onClick={() => setActiveTab('logs')}
                    style={{
                        cursor: 'pointer',
                        fontSize: '11px',
                        fontWeight: '800',
                        color: activeTab === 'logs' ? 'var(--accent-primary)' : 'var(--text-muted)',
                        textTransform: 'uppercase',
                        letterSpacing: '0.1em',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                        paddingBottom: '4px',
                        borderBottom: activeTab === 'logs' ? '2px solid var(--accent-primary)' : '2px solid transparent',
                        transition: 'all 0.2s'
                    }}
                >
                    <div style={{
                        width: '8px',
                        height: '8px',
                        borderRadius: '50%',
                        background: logsStatus === 'connected' ? 'var(--success)' : 'var(--warning)',
                        boxShadow: `0 0 8px ${logsStatus === 'connected' ? 'var(--success)' : 'var(--warning)'}`
                    }}></div>
                    SYSTEM LOGS
                </div>
                <div
                    onClick={() => setActiveTab('trades')}
                    style={{
                        cursor: 'pointer',
                        fontSize: '11px',
                        fontWeight: '800',
                        color: activeTab === 'trades' ? 'var(--accent-primary)' : 'var(--text-muted)',
                        textTransform: 'uppercase',
                        letterSpacing: '0.1em',
                        paddingBottom: '4px',
                        borderBottom: activeTab === 'trades' ? '2px solid var(--accent-primary)' : '2px solid transparent',
                        transition: 'all 0.2s'
                    }}
                >
                    TRADE FEED ({trades.length})
                </div>
            </div>

            <div style={{ flex: 1, overflowY: 'auto' }}>
                {activeTab === 'trades' ? (
                    <div className="space-y-3">
                        {trades.length === 0 ? (
                            <div style={{ color: 'var(--text-muted)', fontSize: '10px', textAlign: 'center', padding: '40px', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
                                Awaiting Market Signal...
                            </div>
                        ) : (
                            trades.slice(0, 50).map((trade, i) => (
                                <div key={i} style={{
                                    display: 'flex',
                                    justifyContent: 'space-between',
                                    alignItems: 'center',
                                    padding: '12px',
                                    background: 'rgba(255,255,255,0.02)',
                                    border: '1px solid var(--border-color)',
                                    borderLeft: `4px solid ${trade.side === 'BUY' ? 'var(--success)' : 'var(--danger)'}`,
                                    marginBottom: '8px'
                                }}>
                                    <div>
                                        <div style={{ fontSize: '12px', fontWeight: '800', color: 'var(--text-main)' }}>
                                            {trade.side} {trade.symbol ? trade.symbol.replace('USDT', '') : '???'}
                                        </div>
                                        <div style={{ fontSize: '10px', color: 'var(--text-muted)', marginTop: '2px' }}>
                                            {trade.reason || 'QUANT_TREND'}
                                        </div>
                                    </div>
                                    <div style={{ textAlign: 'right' }}>
                                        <div style={{ fontSize: '11px', fontWeight: '700', fontFamily: 'JetBrains Mono', color: 'var(--text-main)' }}>
                                            ${trade.price < 1 ? Number(trade.price).toFixed(6) : Number(trade.price).toFixed(2)}
                                        </div>
                                        <div style={{ fontSize: '9px', color: 'var(--accent-primary)', marginTop: '2px' }}>
                                            {trade.timestamp ? new Date(parseInt(trade.timestamp)).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '--:--'}
                                        </div>
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                ) : (
                    <div className="space-y-1" style={{ fontFamily: 'JetBrains Mono', fontSize: '11px' }}>
                        {logs.length === 0 ? (
                            <div style={{ color: 'var(--text-muted)', textAlign: 'center', padding: '40px', fontSize: '10px', textTransform: 'uppercase' }}>
                                Awaiting Kernel Stream...
                            </div>
                        ) : (
                            logs.map((log, i) => (
                                <div key={i} style={{
                                    display: 'flex',
                                    gap: '12px',
                                    padding: '6px 0',
                                    borderBottom: '1px solid rgba(255,255,255,0.03)',
                                    color: log.level === 'ERROR' ? 'var(--danger)' : log.level === 'WARN' ? 'var(--warning)' : log.level === 'SUCCESS' ? 'var(--success)' : 'var(--text-dim)'
                                }}>
                                    <span style={{ color: 'var(--text-muted)', minWidth: '65px', fontSize: '9px' }}>{log.timestamp}</span>
                                    <span style={{ fontWeight: '800', minWidth: '55px', fontSize: '9px', opacity: 0.8 }}>[{log.level}]</span>
                                    <span style={{ color: log.level === 'INFO' ? 'var(--text-dim)' : 'inherit' }}>{log.message}</span>
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
