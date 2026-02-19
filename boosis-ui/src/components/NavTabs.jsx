
import React from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { BarChart2, FlaskConical, Cpu, Eye } from 'lucide-react';

const NavTabs = () => {
    const navigate = useNavigate();
    const location = useLocation();
    const currentPath = location.pathname;

    const isActive = (path) => currentPath === path;

    return (
        <div style={{
            display: 'flex',
            gap: '2px',
            padding: '0 5px',
            marginBottom: '10px',
            zIndex: 10
        }}>
            <button
                onClick={() => navigate('/')}
                style={{
                    padding: '6px 16px',
                    background: isActive('/') ? '#0d1117' : 'transparent',
                    border: '1px solid #30363d',
                    borderBottom: isActive('/') ? 'none' : '1px solid #30363d',
                    borderRadius: '8px 8px 0 0',
                    cursor: 'pointer',
                    color: isActive('/') ? '#58a6ff' : '#8b949e',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    fontWeight: 700,
                    fontSize: '11px',
                    transition: 'all 0.2s'
                }}
            >
                <BarChart2 size={16} /> QUANT TERMINAL
            </button>
            <button
                onClick={() => navigate('/refinery')}
                style={{
                    padding: '6px 16px',
                    background: isActive('/refinery') ? '#0d1117' : 'transparent',
                    border: '1px solid #30363d',
                    borderBottom: isActive('/refinery') ? 'none' : '1px solid #30363d',
                    color: isActive('/refinery') ? '#00ff88' : '#8b949e',
                    borderRadius: '6px 6px 0 0',
                    cursor: 'pointer',
                    fontSize: '11px',
                    fontWeight: '700',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px'
                }}
            >
                <FlaskConical size={14} /> The Refinery
            </button>
            <button
                onClick={() => navigate('/lab')}
                style={{
                    padding: '6px 16px',
                    background: isActive('/lab') ? '#0d1117' : 'transparent',
                    border: '1px solid #30363d',
                    borderBottom: isActive('/lab') ? 'none' : '1px solid #30363d',
                    color: isActive('/lab') ? '#a371f7' : '#8b949e',
                    borderRadius: '6px 6px 0 0',
                    cursor: 'pointer',
                    fontSize: '11px',
                    fontWeight: '700',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px'
                }}
            >
                <Cpu size={14} /> The Lab
            </button>
            <button
                onClick={() => navigate('/sniper')}
                style={{
                    padding: '6px 16px',
                    background: isActive('/sniper') ? '#0d1117' : 'transparent',
                    border: '1px solid #30363d',
                    borderBottom: isActive('/sniper') ? 'none' : '1px solid #30363d',
                    color: isActive('/sniper') ? '#ff4d4d' : '#8b949e',
                    borderRadius: '6px 6px 0 0',
                    cursor: 'pointer',
                    fontSize: '11px',
                    fontWeight: '700',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px'
                }}
            >
                <span style={{ fontSize: '14px', lineHeight: 1 }}>⊕</span> THE SNIPER
            </button>
            <button
                onClick={() => navigate('/vision')}
                style={{
                    padding: '6px 16px',
                    background: isActive('/vision') ? '#0d1117' : 'transparent',
                    border: '1px solid #30363d',
                    borderBottom: isActive('/vision') ? 'none' : '1px solid #30363d',
                    color: isActive('/vision') ? '#58a6ff' : '#8b949e',
                    borderRadius: '6px 6px 0 0',
                    cursor: 'pointer',
                    fontSize: '11px',
                    fontWeight: '700',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px'
                }}
            >
                <Eye size={14} /> PATTERN VISION
            </button>
        </div>
    );
};

export default NavTabs;
