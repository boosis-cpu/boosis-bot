
import React, { useState } from 'react';
import { Zap, Eye, EyeOff, AlertTriangle } from 'lucide-react';
import { login, setAuthToken } from '../services/api';

const LoginPage = ({ onLogin }) => {
    const [password, setPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [error, setError] = useState(null);
    const [loading, setLoading] = useState(false);

    const handleSubmit = async (e) => {
        e.preventDefault();
        setLoading(true);
        setError(null);
        try {
            const res = await login(password);
            const token = res.data.token;
            setAuthToken(token);
            onLogin(token);
        } catch (err) {
            setError('Contraseña incorrecta');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div style={{
            height: '100vh',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'radial-gradient(circle at center, #161b22 0%, #0d1117 100%)'
        }}>
            <form onSubmit={handleSubmit} className="panel" style={{
                width: '380px',
                padding: '40px',
                textAlign: 'center',
                border: '1px solid #30363d',
                boxShadow: '0 20px 50px rgba(0,0,0,0.5)'
            }}>
                <div style={{
                    width: '64px',
                    height: '64px',
                    background: 'rgba(56, 139, 253, 0.1)',
                    borderRadius: '16px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    margin: '0 auto 24px'
                }}>
                    <Zap size={32} color="#58a6ff" />
                </div>

                <h1 style={{ fontSize: '24px', fontWeight: '800', marginBottom: '8px', color: '#c9d1d9' }}>Boosis Búnker</h1>
                <p style={{ color: '#8b949e', fontSize: '14px', marginBottom: '32px' }}>Introduce tu llave de acceso estratégica</p>

                <div style={{ position: 'relative', marginBottom: '20px' }}>
                    <input
                        type={showPassword ? "text" : "password"}
                        placeholder="Contraseña de administrador"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        style={{
                            width: '100%',
                            padding: '14px 45px 14px 14px',
                            background: '#0d1117',
                            border: '1px solid #30363d',
                            color: 'white',
                            borderRadius: '8px',
                            fontSize: '15px',
                            outline: 'none',
                            transition: 'border-color 0.2s'
                        }}
                        onFocus={(e) => e.target.style.borderColor = '#58a6ff'}
                        onBlur={(e) => e.target.style.borderColor = '#30363d'}
                    />
                    <div
                        onClick={() => setShowPassword(!showPassword)}
                        style={{
                            position: 'absolute',
                            right: '15px',
                            top: '50%',
                            transform: 'translateY(-50%)',
                            cursor: 'pointer',
                            color: '#8b949e',
                            display: 'flex',
                            alignItems: 'center'
                        }}
                    >
                        {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                    </div>
                </div>

                <button type="submit" disabled={loading} style={{
                    width: '100%',
                    padding: '14px',
                    background: '#238636',
                    border: 'none',
                    color: 'white',
                    fontWeight: '700',
                    borderRadius: '8px',
                    cursor: loading ? 'wait' : 'pointer',
                    fontSize: '15px',
                    transition: 'background 0.2s',
                    opacity: loading ? 0.7 : 1
                }}
                    onMouseOver={(e) => !loading && (e.target.style.background = '#2ea043')}
                    onMouseOut={(e) => !loading && (e.target.style.background = '#238636')}
                >
                    {loading ? 'Verificando...' : 'Acceder al Sistema'}
                </button>

                {error && (
                    <div style={{
                        marginTop: '20px',
                        padding: '12px',
                        background: 'rgba(248, 81, 73, 0.1)',
                        border: '1px solid rgba(248, 81, 73, 0.2)',
                        borderRadius: '6px',
                        color: '#f85149',
                        fontSize: '13px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '8px'
                    }}>
                        <AlertTriangle size={14} />
                        {error}
                    </div>
                )}
            </form>
        </div>
    );
};

export default LoginPage;
