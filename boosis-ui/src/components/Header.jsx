
import React from 'react';
import { Zap, AlertTriangle, AlertOctagon } from 'lucide-react';

const Header = ({ data, toggleTradingMode, emergencyStop, logout }) => {
    return (
        <header className="header header-compact">
            <div className="flex items-center gap-2">
                <Zap color="#58a6ff" size={20} />
                <h1 style={{ fontSize: '1.1rem', margin: 0 }}>Boosis <b>Quant</b></h1>
            </div>

            <div style={{ display: 'flex', gap: '15px', alignItems: 'center' }}>
                <div className="status-badge-compact">
                    <div className={`pulse ${data.marketStatus?.status === 'SAFE' && !data.emergencyStopped ? 'bg-green-500' : 'bg-red-500'}`}
                        style={{ background: data.marketStatus?.status === 'SAFE' && !data.emergencyStopped ? '#2ea043' : '#f85149', width: '6px', height: '6px' }} />
                    <span>
                        {data.emergencyStopped ? 'SISTEMA DETENIDO' : `MERCADO: ${data.marketStatus?.status === 'SAFE' ? 'SEGURO' : 'VOLÁTIL'} (${data.marketStatus?.volatility || 0}%)`}
                    </span>
                </div>

                <div
                    onClick={toggleTradingMode}
                    className={`badge ${data.paperTrading ? 'badge-blue' : 'badge-red'}`}
                    style={{
                        cursor: 'pointer',
                        padding: '4px 12px',
                        borderRadius: '20px',
                        fontSize: '10px',
                        fontWeight: '800',
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
                        padding: '4px 12px',
                        borderRadius: '20px',
                        fontSize: '10px',
                        fontWeight: '800',
                        border: '1px solid #f85149',
                        background: data.emergencyStopped ? '#f85149' : '#b62324',
                        color: 'white',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px'
                    }}
                >
                    {data.emergencyStopped ? (
                        <><AlertOctagon size={12} /> DETENIDO</>
                    ) : (
                        <><AlertTriangle size={12} color="white" /> EMERGENCIA</>
                    )}
                </div>
                <button onClick={logout}
                    style={{ background: 'transparent', border: '1px solid #30363d', color: '#8b949e', padding: '4px 10px', borderRadius: '4px', cursor: 'pointer', fontSize: '11px' }}>
                    Salir
                </button>
            </div>
        </header>
    );
};

export default Header;
