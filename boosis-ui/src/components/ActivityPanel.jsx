
import React from 'react';

const ActivityPanel = ({ activeTab, setActiveTab, trades, logs }) => {
    return (
        <section className="activity-area panel" style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
            <div style={{ display: 'flex', gap: '15px', marginBottom: '15px', borderBottom: '1px solid #30363d', paddingBottom: '10px' }}>
                <div
                    onClick={() => setActiveTab('logs')}
                    style={{
                        cursor: 'pointer',
                        fontSize: '12px',
                        fontWeight: '600',
                        color: activeTab === 'logs' ? '#58a6ff' : '#8b949e',
                        borderBottom: activeTab === 'logs' ? '2px solid #58a6ff' : 'none',
                        paddingBottom: '4px'
                    }}
                >
                    LOGS DEL SISTEMA
                </div>
                <div
                    onClick={() => setActiveTab('trades')}
                    style={{
                        cursor: 'pointer',
                        fontSize: '12px',
                        fontWeight: '600',
                        color: activeTab === 'trades' ? '#58a6ff' : '#8b949e',
                        borderBottom: activeTab === 'trades' ? '2px solid #58a6ff' : 'none',
                        paddingBottom: '4px'
                    }}
                >
                    TRADES ({trades.length})
                </div>
            </div>

            <div style={{ flex: 1, overflowY: 'auto' }}>
                {activeTab === 'trades' ? (
                    <div className="space-y-2">
                        {trades.length === 0 ? (
                            <div style={{ color: '#8b949e', fontSize: '11px', textAlign: 'center', padding: '20px' }}>
                                Esperando señales...
                            </div>
                        ) : (
                            trades.slice(0, 50).map((trade, i) => (
                                <div key={i} style={{
                                    display: 'flex',
                                    justifyContent: 'space-between',
                                    alignItems: 'center',
                                    padding: '8px',
                                    background: 'rgba(255,255,255,0.02)',
                                    borderRadius: '4px',
                                    borderLeft: `2px solid ${trade.side === 'BUY' ? '#3fb950' : '#f85149'}`,
                                    marginBottom: '8px'
                                }}>
                                    <div style={{ display: 'flex', flexDirection: 'column' }}>
                                        <span style={{ fontSize: '12px', fontWeight: 'bold' }}>{trade.side} BTC</span>
                                        <span style={{ fontSize: '10px', color: '#8b949e' }}>{trade.reason || 'Trend'}</span>
                                    </div>
                                    <div style={{ textAlign: 'right' }}>
                                        <div style={{ fontSize: '11px', fontWeight: 'bold' }}>${trade.price}</div>
                                        {trade.slippage && (
                                            <div style={{ fontSize: '9px', color: trade.slippage > 0.05 ? '#f85149' : '#8b949e' }}>
                                                Slip: {trade.slippage}%
                                            </div>
                                        )}
                                        <div style={{ fontSize: '9px', color: '#58a6ff' }}>{new Date(parseInt(trade.timestamp)).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                ) : (
                    <div className="space-y-1" style={{ fontFamily: 'monospace', fontSize: '11px' }}>
                        {logs.length === 0 ? (
                            <div style={{ color: '#8b949e', textAlign: 'center', padding: '20px' }}>
                                Conectando a logs...
                            </div>
                        ) : (
                            logs.map((log, i) => (
                                <div key={i} style={{
                                    display: 'flex',
                                    gap: '8px',
                                    padding: '4px 0',
                                    borderBottom: '1px solid #21262d',
                                    color: log.level === 'ERROR' ? '#f85149' : log.level === 'WARN' ? '#d29922' : log.level === 'SUCCESS' ? '#2ea043' : '#e6edf3'
                                }}>
                                    <span style={{ color: '#8b949e', minWidth: '60px' }}>{log.timestamp}</span>
                                    <span style={{ fontWeight: 'bold', minWidth: '50px' }}>[{log.level}]</span>
                                    <span>{log.message}</span>
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
