import React, { useState, useEffect } from 'react';
import { getStatus } from '../services/api';
import { Activity, Shield, Zap, Info } from 'lucide-react';

/**
 * 🛰️ AI INFRA SENTINEL - VISION TERMINAL
 * Terminal especializada en infraestructura de IA (RENDER, FET, NEAR).
 * Triangula señales de Hoja de Ruta Occidental, Política China y Demanda On-Chain.
 */
const GlobalMarketScanner = ({ token }) => {
    const [scannerData, setScannerData] = useState([]);
    const [loading, setLoading] = useState(true);

    const AI_SYMBOLS = ['RENDERUSDT', 'FETUSDT', 'NEARUSDT'];

    const fetchAllStatus = async () => {
        try {
            const results = await Promise.all(
                AI_SYMBOLS.map(async (s) => {
                    try {
                        const res = await getStatus(s);
                        // Mocking Conviction for now - will be replaced by semantic engine
                        const convictionScore = Math.random();
                        return {
                            symbol: s,
                            ...res.data,
                            conviction: convictionScore > 0.7 ? 'GREEN' : convictionScore > 0.4 ? 'YELLOW' : 'RED',
                            reasoning: convictionScore > 0.7 ? 'ALINEACIÓN TOTAL: GPU Demand + Bullish Sentiment' : convictionScore > 0.4 ? 'CAUTELA: Esperando confirmación de SCMP' : 'RIESGO: Export Restrictions Intel'
                        };
                    } catch (e) {
                        return { symbol: s, error: true };
                    }
                })
            );
            setScannerData(results.filter(r => !r.error));
        } catch (error) {
            console.error('Error in AI Sentinel fetch:', error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchAllStatus();
        const interval = setInterval(fetchAllStatus, 15000);
        return () => clearInterval(interval);
    }, []);

    const getConvictionStyle = (status) => {
        switch (status) {
            case 'GREEN': return { color: '#00ff88', glow: '0 0 20px rgba(0, 255, 136, 0.3)', label: 'ALTA CONVICCIÓN' };
            case 'YELLOW': return { color: '#ffcc00', glow: '0 0 20px rgba(255, 204, 0, 0.2)', label: 'VIGILANCIA' };
            case 'RED': return { color: '#ff4444', glow: '0 0 20px rgba(255, 68, 68, 0.2)', label: 'SIT&WAIT' };
            default: return { color: 'var(--text-muted)', glow: 'none', label: 'ANALIZANDO' };
        }
    };

    return (
        <div className="market-scanner-container" style={{ padding: '0 10px' }}>
            <div className="scanner-header" style={{ marginBottom: '30px', borderBottom: '1px solid var(--border-color)', paddingBottom: '20px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
                    <div className="pulse" style={{ width: '12px', height: '12px', background: 'var(--accent-primary)', borderRadius: '50%' }}></div>
                    <div>
                        <h2 style={{ margin: 0, fontSize: '1.4rem', fontWeight: 800, color: 'var(--text-main)' }}>AI Infra Sentinel</h2>
                        <div style={{ fontSize: '10px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.2em', marginTop: '4px' }}>
                            Computing Power Intelligence Unit
                        </div>
                    </div>
                </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '20px' }}>
                {scannerData.map((pair) => {
                    const style = getConvictionStyle(pair.conviction);
                    return (
                        <div key={pair.symbol} className="panel" style={{
                            position: 'relative',
                            overflow: 'hidden',
                            border: `1px solid ${style.color}44`,
                            boxShadow: style.glow,
                            padding: '30px'
                        }}>
                            {/* Conviction Bar */}
                            <div style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '4px', background: style.color }}></div>

                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '25px' }}>
                                <div>
                                    <div style={{ fontSize: '10px', color: 'var(--text-muted)', fontWeight: 800 }}>CORE_ASSET</div>
                                    <div style={{ fontSize: '2.2rem', fontWeight: 900, letterSpacing: '-0.05em' }}>{pair.symbol.replace('USDT', '')}</div>
                                </div>
                                <div style={{ textAlign: 'right' }}>
                                    <div style={{ fontSize: '10px', color: 'var(--text-muted)', fontWeight: 800 }}>PRICE_USD</div>
                                    <div style={{ fontSize: '1.2rem', fontWeight: 700, fontFamily: 'JetBrains Mono' }}>
                                        ${pair.latestCandle?.close.toFixed(4)}
                                    </div>
                                    <div style={{ fontSize: '12px', color: pair.change >= 0 ? 'var(--success)' : 'var(--danger)', fontWeight: 800 }}>
                                        {pair.change >= 0 ? '▲' : '▼'} {Math.abs(pair.change).toFixed(2)}%
                                    </div>
                                </div>
                            </div>

                            <div style={{ background: 'rgba(255,255,255,0.03)', padding: '15px', borderRadius: '4px', marginBottom: '20px' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                                    <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: style.color }}></div>
                                    <span style={{ fontSize: '10px', fontWeight: 900, color: style.color }}>{style.label}</span>
                                </div>
                                <div style={{ fontSize: '11px', color: 'var(--text-dim)', lineHeight: 1.5 }}>
                                    {pair.reasoning}
                                </div>
                            </div>

                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                                <div style={{ border: '1px solid var(--border-color)', padding: '10px', borderRadius: '4px' }}>
                                    <div style={{ fontSize: '9px', color: 'var(--text-muted)', marginBottom: '4px' }}>HMM_REGIME</div>
                                    <div style={{ fontSize: '11px', fontWeight: 800, color: 'var(--accent-primary)' }}>{pair.marketRegime?.name || 'ANALYZING'}</div>
                                </div>
                                <div style={{ border: '1px solid var(--border-color)', padding: '10px', borderRadius: '4px' }}>
                                    <div style={{ fontSize: '9px', color: 'var(--text-muted)', marginBottom: '4px' }}>SHIELD_STATUS</div>
                                    <div style={{ fontSize: '11px', fontWeight: 800, color: pair.shieldMode ? 'var(--danger)' : 'var(--text-dim)' }}>
                                        {pair.shieldMode ? 'LOCKED' : 'ACTIVE'}
                                    </div>
                                </div>
                            </div>

                            <button style={{
                                width: '100%',
                                marginTop: '20px',
                                background: style.color,
                                color: '#000',
                                border: 'none',
                                padding: '10px',
                                borderRadius: '4px',
                                fontWeight: 900,
                                fontSize: '11px',
                                cursor: 'pointer',
                                transition: 'transform 0.2s'
                            }}
                                onMouseEnter={(e) => e.target.style.transform = 'scale(1.02)'}
                                onMouseLeave={(e) => e.target.style.transform = 'scale(1)'}
                            >
                                EJECUTAR SNIPER {pair.symbol.replace('USDT', '')}
                            </button>
                        </div>
                    );
                })}
            </div>
        </div>
    );
};

export default GlobalMarketScanner;
