
import React from 'react';
import { Zap, AlertTriangle, AlertOctagon } from 'lucide-react';

const Header = ({ data, toggleTradingMode, emergencyStop, logout }) => {
    return (
        <header className="header">
            <div className="flex items-center gap-4">
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <Zap color="#58a6ff" size={24} />
                    <h1 style={{ fontSize: '1.2rem', margin: 0 }}>Boosis <b>Quant</b></h1>
                </div>
                <div className="status-badge" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <div className={`pulse ${data.marketStatus?.status === 'SAFE' && !data.emergencyStopped ? 'bg-green-500' : 'bg-red-500'}`}
                        style={{ background: data.marketStatus?.status === 'SAFE' && !data.emergencyStopped ? '#2ea043' : '#f85149' }} />
                    <span>
                        {data.emergencyStopped ? 'ESTADO: SISTEMA DETENIDO' : `MERCADO: ${data.marketStatus?.status === 'SAFE' ? 'SEGURO' : 'VOLÁTIL'} (${data.marketStatus?.volatility || 0}%)`}
                    </span>
                </div>
            </div>

            <div style={{ display: 'flex', gap: '20px', alignItems: 'center' }}>
                <div
                    onClick={toggleTradingMode}
                    className={`badge ${data.paperTrading ? 'badge-blue' : 'badge-red'}`}
                    style={{
                        cursor: 'pointer',
                        padding: '6px 14px',
                        borderRadius: '20px',
                        fontSize: '11px',
                        fontWeight: '800',
                        letterSpacing: '0.5px',
                        transition: 'all 0.2s ease',
                        border: data.paperTrading ? '1px solid #388bfd' : '1px solid #f85149',
                        background: data.paperTrading ? 'rgba(56, 139, 253, 0.1)' : 'rgba(248, 81, 73, 0.1)',
                        color: data.paperTrading ? '#58a6ff' : '#ff7b72',
                        opacity: data.emergencyStopped ? 0.6 : 1
                    }}
                >
                    {data.paperTrading ? 'OFFLINE (PAPER)' : '⚠️ ONLINE (LIVE)'}
                </div>

                <div
                    onClick={data.emergencyStopped ? null : emergencyStop}
                    style={{
                        cursor: data.emergencyStopped ? 'default' : 'pointer',
                        padding: '6px 14px',
                        borderRadius: '20px',
                        fontSize: '11px',
                        fontWeight: '800',
                        letterSpacing: '0.5px',
                        transition: 'all 0.2s ease',
                        border: '1px solid #f85149',
                        background: data.emergencyStopped ? '#f85149' : '#b62324',
                        color: 'white',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px'
                    }}
                >
                    {data.emergencyStopped ? (
                        <><AlertOctagon size={14} /> SISTEMA DETENIDO</>
                    ) : (
                        <><AlertTriangle size={14} color="white" /> PARADA DE EMERGENCIA</>
                    )}
                </div>
                <button onClick={logout}
                    style={{ background: 'transparent', border: '1px solid #30363d', color: 'white', padding: '5px 12px', borderRadius: '4px', cursor: 'pointer', fontSize: '12px' }}>
                    Cerrar Sesión
                </button>
            </div>
        </header>
    );
};

export default Header;
