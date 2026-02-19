
import React from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { BarChart2, FlaskConical, Cpu } from 'lucide-react';

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
                    color: isActive('/') ? '#58a6ff' : '#8b949e',
                    borderRadius: '6px 6px 0 0',
                    cursor: 'pointer',
                    fontSize: '11px',
                    fontWeight: '700',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px'
                }}
            >
                <BarChart2 size={14} /> Dashboard
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
                onClick={() => navigate('/multi')}
                style={{
                    padding: '6px 16px',
                    background: isActive('/multi') ? '#0d1117' : 'transparent',
                    border: '1px solid #30363d',
                    borderBottom: isActive('/multi') ? 'none' : '1px solid #30363d',
                    color: isActive('/multi') ? '#00ffff' : '#8b949e',
                    borderRadius: '6px 6px 0 0',
                    cursor: 'pointer',
                    fontSize: '11px',
                    fontWeight: '700',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px'
                }}
            >
                <BarChart2 size={14} /> Multi-Activo
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
        </div>
    );
};

export default NavTabs;
