
import React from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { BarChart2, FlaskConical } from 'lucide-react';

const NavTabs = () => {
    const navigate = useNavigate();
    const location = useLocation();
    const currentPath = location.pathname;

    const isActive = (path) => currentPath === path;

    return (
        <div style={{
            display: 'flex',
            gap: '2px',
            padding: '0 20px',
            marginBottom: '-1px',
            zIndex: 10
        }}>
            <button
                onClick={() => navigate('/')}
                style={{
                    padding: '10px 20px',
                    background: isActive('/') ? '#0d1117' : 'transparent',
                    border: '1px solid #30363d',
                    borderBottom: isActive('/') ? 'none' : '1px solid #30363d',
                    color: isActive('/') ? '#58a6ff' : '#8b949e',
                    borderRadius: '8px 8px 0 0',
                    cursor: 'pointer',
                    fontSize: '13px',
                    fontWeight: '600',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px'
                }}
            >
                <BarChart2 size={16} /> Dashboard
            </button>
            <button
                onClick={() => navigate('/refinery')}
                style={{
                    padding: '10px 20px',
                    background: isActive('/refinery') ? '#0d1117' : 'transparent',
                    border: '1px solid #30363d',
                    borderBottom: isActive('/refinery') ? 'none' : '1px solid #30363d',
                    color: isActive('/refinery') ? '#00ff88' : '#8b949e',
                    borderRadius: '8px 8px 0 0',
                    cursor: 'pointer',
                    fontSize: '13px',
                    fontWeight: '600',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px'
                }}
            >
                <FlaskConical size={16} /> The Refinery
            </button>
            <button
                onClick={() => navigate('/multi')}
                style={{
                    padding: '10px 20px',
                    background: isActive('/multi') ? '#0d1117' : 'transparent',
                    border: '1px solid #30363d',
                    borderBottom: isActive('/multi') ? 'none' : '1px solid #30363d',
                    color: isActive('/multi') ? '#00ffff' : '#8b949e',
                    borderRadius: '8px 8px 0 0',
                    cursor: 'pointer',
                    fontSize: '13px',
                    fontWeight: '600',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px'
                }}
            >
                <BarChart2 size={16} /> Multi-Activo
            </button>
        </div>
    );
};

export default NavTabs;
