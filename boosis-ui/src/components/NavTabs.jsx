import React from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { BarChart2, Eye, Crosshair } from 'lucide-react';

const NavTabs = () => {
    const navigate = useNavigate();
    const location = useLocation();
    const currentPath = location.pathname;
    const isActive = (path) => currentPath === path;

    return (
        <div style={{
            display: 'flex',
            gap: '4px',
            padding: '5px 10px',
            marginBottom: '15px',
            zIndex: 10,
            background: 'rgba(2, 6, 23, 0.4)',
            backdropFilter: 'blur(10px)',
            borderBottom: '1px solid var(--border-color)'
        }}>
            <button
                onClick={() => navigate('/')}
                style={{
                    padding: '8px 20px',
                    background: isActive('/') ? 'rgba(0, 229, 255, 0.1)' : 'transparent',
                    border: '1px solid',
                    borderColor: isActive('/') ? 'var(--accent-primary)' : 'transparent',
                    borderRadius: '4px',
                    cursor: 'pointer',
                    color: isActive('/') ? 'var(--accent-primary)' : 'var(--text-muted)',
                    display: 'flex', alignItems: 'center', gap: '8px',
                    fontWeight: 800,
                    fontSize: '10px',
                    textTransform: 'uppercase',
                    letterSpacing: '0.1em',
                    transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)'
                }}
            >
                <BarChart2 size={14} /> QUANT TERMINAL
            </button>

            <button
                onClick={() => navigate('/sniper')}
                style={{
                    padding: '8px 20px',
                    background: isActive('/sniper') ? 'rgba(239, 68, 68, 0.1)' : 'transparent',
                    border: '1px solid',
                    borderColor: isActive('/sniper') ? 'var(--danger)' : 'transparent',
                    color: isActive('/sniper') ? 'var(--danger)' : 'var(--text-muted)',
                    borderRadius: '4px',
                    cursor: 'pointer',
                    fontSize: '10px',
                    fontWeight: '800',
                    textTransform: 'uppercase',
                    letterSpacing: '0.1em',
                    display: 'flex', alignItems: 'center', gap: '8px',
                    transition: 'all 0.3s'
                }}
            >
                <Crosshair size={14} /> THE SNIPER
            </button>

            <button
                onClick={() => navigate('/vision')}
                style={{
                    padding: '8px 20px',
                    background: isActive('/vision') ? 'rgba(0, 229, 255, 0.1)' : 'transparent',
                    border: '1px solid',
                    borderColor: isActive('/vision') ? 'var(--accent-primary)' : 'transparent',
                    color: isActive('/vision') ? 'var(--accent-primary)' : 'var(--text-muted)',
                    borderRadius: '4px',
                    cursor: 'pointer',
                    fontSize: '10px',
                    fontWeight: '800',
                    textTransform: 'uppercase',
                    letterSpacing: '0.1em',
                    display: 'flex', alignItems: 'center', gap: '8px',
                    transition: 'all 0.3s'
                }}
            >
                <Eye size={14} /> PATTERN VISION
            </button>
        </div>
    );
};

export default NavTabs;
