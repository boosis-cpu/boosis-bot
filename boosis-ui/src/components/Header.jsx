
import React from 'react';
import { Zap, AlertTriangle, AlertOctagon } from 'lucide-react';

const Header = ({ data, toggleTradingMode, emergencyStop, logout }) => {
    return (
        <header className="header-compact">
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <Zap color="var(--accent-primary)" size={22} fill="var(--accent-primary)" style={{ filter: 'drop-shadow(0 0 8px var(--accent-primary))' }} />
                <h1 style={{ fontSize: '1.25rem', fontWeight: 800, margin: 0, letterSpacing: '-0.03em', color: 'var(--text-main)' }}>
                    BOOSIS <span style={{ color: 'var(--text-muted)', fontWeight: 300 }}>QUANT</span>
                </h1>
            </div>

            <div style={{ display: 'flex', gap: '20px', alignItems: 'center' }}>
                <div className="status-badge-compact" style={{ background: 'transparent', border: 'none', padding: 0 }}>
                    <div className="pulse"
                        style={{
                            background: data.marketStatus?.status === 'SAFE' && !data.emergencyStopped ? 'var(--success)' : 'var(--danger)',
                            width: '8px',
                            height: '8px',
                            borderRadius: '50%',
                            boxShadow: `0 0 10px ${data.marketStatus?.status === 'SAFE' && !data.emergencyStopped ? 'var(--success)' : 'var(--danger)'}`
                        }} />
                    <span style={{ fontSize: '10px', fontWeight: 800, color: 'var(--text-dim)', letterSpacing: '0.05em', fontFamily: 'JetBrains Mono' }}>
                        {data.emergencyStopped ? 'SYSTEM_LOCKED' : `MARKET_${data.marketStatus?.status === 'SAFE' ? 'SECURE' : 'VOLATILE'}`}
                    </span>
                </div>

                <div
                    onClick={toggleTradingMode}
                    style={{
                        cursor: 'pointer',
                        padding: '6px 16px',
                        borderRadius: '4px',
                        fontSize: '10px',
                        fontWeight: '800',
                        fontFamily: 'JetBrains Mono',
                        border: '1px solid',
                        borderColor: data.paperTrading ? 'var(--accent-primary)' : 'var(--danger)',
                        background: data.paperTrading ? 'rgba(0, 229, 255, 0.05)' : 'rgba(239, 68, 68, 0.1)',
                        color: data.paperTrading ? 'var(--accent-primary)' : 'var(--danger)',
                        opacity: data.emergencyStopped ? 0.6 : 1,
                        transition: 'all 0.3s'
                    }}
                >
                    {data.paperTrading ? 'OFFLINE::PAPER' : '⚠️ ONLINE::LIVE'}
                </div>

                <div
                    onClick={data.emergencyStopped ? null : emergencyStop}
                    style={{
                        cursor: data.emergencyStopped ? 'default' : 'pointer',
                        padding: '6px 16px',
                        borderRadius: '4px',
                        fontSize: '10px',
                        fontWeight: '800',
                        fontFamily: 'JetBrains Mono',
                        background: data.emergencyStopped ? 'var(--danger)' : 'rgba(239, 68, 68, 0.2)',
                        border: '1px solid var(--danger)',
                        color: 'white',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                        transition: 'all 0.3s'
                    }}
                >
                    {data.emergencyStopped ? (
                        <><AlertOctagon size={14} /> DETENIDO</>
                    ) : (
                        <><AlertTriangle size={14} /> EMERGENCIA</>
                    )}
                </div>

                <button onClick={logout}
                    style={{
                        background: 'transparent',
                        border: '1px solid var(--border-color)',
                        color: 'var(--text-muted)',
                        padding: '6px 12px',
                        borderRadius: '4px',
                        cursor: 'pointer',
                        fontSize: '11px',
                        fontWeight: 600
                    }}>
                    Salir
                </button>
            </div>
        </header>
    );
};

export default Header;
