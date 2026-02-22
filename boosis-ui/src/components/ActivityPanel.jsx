
import React from 'react';

const ActivityPanel = ({ logs, logsStatus = 'connecting' }) => {
    return (
        <section className="activity-area" style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden', background: 'transparent', padding: '0' }}>
            {/* Header fijo — solo SYSTEM_KERNEL */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '16px', borderBottom: '1px solid var(--border-color)', paddingBottom: '14px' }}>
                <div style={{
                    width: '6px', height: '6px', borderRadius: '50%',
                    background: logsStatus === 'connected' ? 'var(--success)' : 'var(--warning)',
                    boxShadow: `0 0 10px ${logsStatus === 'connected' ? 'var(--success)' : 'var(--warning)'}`
                }} />
                <span style={{
                    fontSize: '11px', fontWeight: '900', color: 'var(--accent-primary)',
                    textTransform: 'uppercase', letterSpacing: '0.15em'
                }}>
                    SYSTEM_KERNEL
                </span>
            </div>

            {/* Log stream */}
            <div style={{ flex: 1, overflowY: 'auto', paddingRight: '4px', fontFamily: 'JetBrains Mono', fontSize: '11px', background: 'rgba(0,0,0,0.2)', padding: '16px', border: '1px solid var(--border-color)' }}>
                {logs.length === 0 ? (
                    <div style={{ color: 'var(--text-muted)', textAlign: 'center', padding: '40px', fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
                        Awaiting Kernel Stream...
                    </div>
                ) : (
                    logs.map((log, i) => (
                        <div key={i} style={{
                            display: 'flex', gap: '12px', padding: '8px 0',
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
        </section>
    );
};

export default ActivityPanel;
