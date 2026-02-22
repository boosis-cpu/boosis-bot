import React from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { LayoutDashboard, Crosshair, Eye, LogOut, Shield, Zap } from 'lucide-react';

const VerticalNav = ({ logout, data, toggleTradingMode }) => {
    const navigate = useNavigate();
    const location = useLocation();
    const isActive = (path) => location.pathname === path;

    return (
        <aside style={{
            width: '64px',
            background: 'rgba(2, 6, 23, 0.8)',
            backdropFilter: 'blur(10px)',
            borderRight: '1px solid var(--border-color)',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            padding: '20px 0',
            gap: '12px',
            zIndex: 1000,
            flexShrink: 0
        }}>
            {/* CEO Switch: LIVE / PAPER */}
            <button
                onClick={toggleTradingMode}
                style={{
                    background: data?.paperTrading ? 'rgba(239, 68, 68, 0.1)' : 'rgba(46, 164, 79, 0.1)',
                    border: `1px solid ${data?.paperTrading ? 'var(--danger)' : 'var(--success)'}`,
                    color: data?.paperTrading ? 'var(--danger)' : 'var(--success)',
                    cursor: 'pointer',
                    width: '42px',
                    height: '42px',
                    borderRadius: '8px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    transition: 'all 0.3s',
                    marginBottom: '10px',
                    position: 'relative',
                    overflow: 'visible'
                }}
                title={data?.paperTrading ? 'OFFLINE::PAPER — Haz click para ir a LIVE' : '⚠️ ONLINE::LIVE — Haz click para ir a PAPER'}
            >
                {data?.paperTrading ? <Shield size={20} /> : <Zap size={20} fill="currentColor" />}
                {!data?.paperTrading && (
                    <div style={{
                        position: 'absolute',
                        top: '-4px',
                        right: '-4px',
                        width: '10px',
                        height: '10px',
                        background: 'var(--success)',
                        borderRadius: '50%',
                        boxShadow: '0 0 8px var(--success)',
                        animation: 'pulse 2s infinite'
                    }} />
                )}
            </button>

            {/* Logo / Home */}
            <button
                onClick={() => navigate('/')}
                style={{
                    background: isActive('/') ? 'rgba(0, 229, 255, 0.1)' : 'transparent',
                    border: 'none',
                    color: isActive('/') ? 'var(--accent-primary)' : 'var(--text-muted)',
                    cursor: 'pointer',
                    width: '42px',
                    height: '42px',
                    borderRadius: '8px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    transition: 'all 0.3s',
                    marginBottom: '10px'
                }}
                title="AI Infra Sentinel"
            >
                <LayoutDashboard size={22} />
            </button>

            <button
                onClick={() => navigate('/sniper')}
                style={{
                    background: isActive('/sniper') ? 'rgba(0, 229, 255, 0.1)' : 'transparent',
                    border: 'none',
                    color: isActive('/sniper') ? 'var(--accent-primary)' : 'var(--text-muted)',
                    cursor: 'pointer',
                    width: '42px',
                    height: '42px',
                    borderRadius: '8px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    transition: 'all 0.3s'
                }}
                title="The Sniper Tactical"
            >
                <Crosshair size={22} />
            </button>

            <button
                onClick={() => navigate('/vision')}
                style={{
                    background: isActive('/vision') ? 'rgba(0, 229, 255, 0.1)' : 'transparent',
                    border: 'none',
                    color: isActive('/vision') ? 'var(--accent-primary)' : 'var(--text-muted)',
                    cursor: 'pointer',
                    width: '42px',
                    height: '42px',
                    borderRadius: '8px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    transition: 'all 0.3s'
                }}
                title="Pattern Vision Intelligence"
            >
                <Eye size={22} />
            </button>

            <div style={{ marginTop: 'auto' }}>
                <button
                    onClick={logout}
                    style={{
                        background: 'transparent',
                        border: 'none',
                        color: 'var(--text-muted)',
                        cursor: 'pointer',
                        width: '42px',
                        height: '42px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        transition: 'all 0.3s'
                    }}
                    title="System Logout"
                >
                    <LogOut size={20} />
                </button>
            </div>
        </aside>
    );
};

export default VerticalNav;
