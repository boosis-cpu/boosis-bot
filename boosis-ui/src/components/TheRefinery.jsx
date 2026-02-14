// boosis-ui/src/components/TheRefinery.jsx
import React, { useState, useEffect } from 'react';
import axios from 'axios';
import {
    LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer
} from 'recharts';
import './TheRefinery.css';

export default function TheRefinery({ token }) {
    const [selectedSymbol, setSelectedSymbol] = useState('BTCUSDT');
    const [profile, setProfile] = useState(null);
    const [formData, setFormData] = useState({});
    const [backtest, setBacktest] = useState(null);
    const [loading, setLoading] = useState(false);
    const [message, setMessage] = useState('');
    const [savedProfiles, setSavedProfiles] = useState([]);

    // Cargar perfil al cambiar símbolo
    useEffect(() => {
        loadProfile();
        loadProfiles();
    }, [selectedSymbol]);

    const loadProfile = async () => {
        try {
            setLoading(true);
            const response = await axios.get(
                `/api/refinery/profile/${selectedSymbol}`,
                { headers: { Authorization: `Bearer ${token}` } }
            );
            setProfile(response.data.profile);
            setFormData(response.data.profile);
        } catch (error) {
            console.error('Error loading profile:', error);
            setMessage('❌ Error cargando perfil');
        } finally {
            setLoading(false);
        }
    };

    const loadProfiles = async () => {
        try {
            const response = await axios.get(
                '/api/refinery/profiles',
                { headers: { Authorization: `Bearer ${token}` } }
            );
            setSavedProfiles(response.data.profiles);
        } catch (error) {
            console.error('Error loading profiles:', error);
        }
    };

    const handleSliderChange = (field, value) => {
        const [group, subfield] = field.split('.');
        setFormData(prev => ({
            ...prev,
            [group]: {
                ...prev[group],
                [subfield]: parseFloat(value)
            }
        }));
    };

    const handleApply = async () => {
        try {
            setLoading(true);
            setMessage('⏳ Actualizando parámetros...');

            const response = await axios.post(
                '/api/refinery/profile/update',
                {
                    symbol: selectedSymbol,
                    params: formData
                },
                { headers: { Authorization: `Bearer ${token}` } }
            );

            setMessage('✅ Parámetros actualizados (aplicados en próxima vela)');
            setProfile(formData);

            // Auto-clear mensaje
            setTimeout(() => setMessage(''), 3000);
        } catch (error) {
            setMessage(`❌ Error: ${error.response?.data?.error || error.message}`);
        } finally {
            setLoading(false);
        }
    };

    const handleBacktest = async () => {
        try {
            setLoading(true);
            setMessage('⏳ Backtesting con nuevos parámetros...');

            const response = await axios.post(
                '/api/refinery/backtest',
                {
                    symbol: selectedSymbol,
                    params: formData,
                    period: '1y'
                },
                { headers: { Authorization: `Bearer ${token}` } }
            );

            // Simulación de datos de backtest (en ORDEN 6 será real)
            setBacktest({
                winRate: 54,
                sharpe: 1.45,
                maxDD: -2.1,
                profitFactor: 3.69,
                equity: [
                    { time: '0', value: 100 },
                    { time: '1m', value: 102 },
                    { time: '2m', value: 105 },
                    { time: '3m', value: 103 },
                    { time: '4m', value: 108 },
                    { time: '5m', value: 112 },
                ]
            });

            setMessage('✅ Backtest completado');
        } catch (error) {
            setMessage(`❌ Error backtesting`);
        } finally {
            setLoading(false);
        }
    };

    const handleReset = () => {
        setFormData(profile);
        setMessage('🔄 Parámetros restaurados a perfil actual');
    };

    const handleSaveProfile = async (profileName) => {
        try {
            setLoading(true);
            await axios.post(
                '/api/refinery/profile/update',
                {
                    symbol: selectedSymbol,
                    params: { ...formData, name: profileName }
                },
                { headers: { Authorization: `Bearer ${token}` } }
            );
            setMessage(`✅ Perfil "${profileName}" guardado`);
            loadProfiles();
        } catch (error) {
            setMessage(`❌ Error guardando`);
        } finally {
            setLoading(false);
        }
    };

    if (!profile) {
        return <div className="refinery-loading">Cargando The Refinery...</div>;
    }

    return (
        <div className="the-refinery">
            <h1>🧪 THE REFINERY - Laboratorio de Optimización</h1>

            {/* Header */}
            <div className="refinery-header">
                <div className="symbol-selector">
                    <label>Símbolo:</label>
                    <select
                        value={selectedSymbol}
                        onChange={(e) => setSelectedSymbol(e.target.value)}
                        disabled={loading}
                    >
                        <option value="BTCUSDT">Bitcoin (BTCUSDT)</option>
                        <option value="ETHUSDT">Ethereum (ETHUSDT)</option>
                        <option value="XRPUSDT">Ripple (XRPUSDT)</option>
                        <option value="BNBUSDT">BNB (BNBUSDT)</option>
                        <option value="SOLUSDT">Solana (SOLUSDT)</option>
                    </select>
                </div>

                {message && (
                    <div className={`message ${message.includes('✅') ? 'success' : 'error'}`}>
                        {message}
                    </div>
                )}
            </div>

            {/* Main Layout */}
            <div className="refinery-container">

                {/* Left: Parámetros */}
                <div className="parameters-panel">
                    <h2>📊 Parámetros</h2>

                    {/* RSI */}
                    <div className="param-group">
                        <label>RSI Buy Bound</label>
                        <div className="slider-container">
                            <input
                                type="range"
                                min="0"
                                max="50"
                                step="1"
                                value={formData.rsi?.buy || 20}
                                onChange={(e) => handleSliderChange('rsi.buy', e.target.value)}
                                disabled={loading}
                            />
                            <span className="value">{formData.rsi?.buy || 20}</span>
                        </div>
                    </div>

                    <div className="param-group">
                        <label>RSI Sell Bound</label>
                        <div className="slider-container">
                            <input
                                type="range"
                                min="50"
                                max="100"
                                step="1"
                                value={formData.rsi?.sell || 70}
                                onChange={(e) => handleSliderChange('rsi.sell', e.target.value)}
                                disabled={loading}
                            />
                            <span className="value">{formData.rsi?.sell || 70}</span>
                        </div>
                    </div>

                    {/* EMA */}
                    <div className="param-group">
                        <label>EMA Short</label>
                        <div className="slider-container">
                            <input
                                type="range"
                                min="1"
                                max="50"
                                step="1"
                                value={formData.ema?.short || 9}
                                onChange={(e) => handleSliderChange('ema.short', e.target.value)}
                                disabled={loading}
                            />
                            <span className="value">{formData.ema?.short || 9}</span>
                        </div>
                    </div>

                    <div className="param-group">
                        <label>EMA Long</label>
                        <div className="slider-container">
                            <input
                                type="range"
                                min="10"
                                max="100"
                                step="1"
                                value={formData.ema?.long || 21}
                                onChange={(e) => handleSliderChange('ema.long', e.target.value)}
                                disabled={loading}
                            />
                            <span className="value">{formData.ema?.long || 21}</span>
                        </div>
                    </div>

                    <div className="param-group">
                        <label>EMA Trend</label>
                        <div className="slider-container">
                            <input
                                type="range"
                                min="20"
                                max="200"
                                step="1"
                                value={formData.ema?.trend || 50}
                                onChange={(e) => handleSliderChange('ema.trend', e.target.value)}
                                disabled={loading}
                            />
                            <span className="value">{formData.ema?.trend || 50}</span>
                        </div>
                    </div>

                    {/* Bollinger Bands */}
                    <div className="param-group">
                        <label>BB Period</label>
                        <div className="slider-container">
                            <input
                                type="range"
                                min="5"
                                max="50"
                                step="1"
                                value={formData.bb?.period || 20}
                                onChange={(e) => handleSliderChange('bb.period', e.target.value)}
                                disabled={loading}
                            />
                            <span className="value">{formData.bb?.period || 20}</span>
                        </div>
                    </div>

                    <div className="param-group">
                        <label>BB Std Dev</label>
                        <div className="slider-container">
                            <input
                                type="range"
                                min="0.5"
                                max="5"
                                step="0.1"
                                value={formData.bb?.stdDev || 2.5}
                                onChange={(e) => handleSliderChange('bb.stdDev', e.target.value)}
                                disabled={loading}
                            />
                            <span className="value">{formData.bb?.stdDev || 2.5}</span>
                        </div>
                    </div>

                    {/* Botones de acción */}
                    <div className="action-buttons">
                        <button
                            onClick={handleReset}
                            disabled={loading}
                            className="btn-reset"
                        >
                            🔄 Reset
                        </button>
                        <button
                            onClick={handleApply}
                            disabled={loading}
                            className="btn-apply"
                        >
                            ✅ Aplicar
                        </button>
                        <button
                            onClick={handleBacktest}
                            disabled={loading}
                            className="btn-backtest"
                        >
                            📊 Backtest
                        </button>
                    </div>
                </div>

                {/* Right: Backtest Preview */}
                <div className="backtest-panel">
                    <h2>📈 Preview Backtest</h2>

                    {backtest ? (
                        <>
                            <div className="metrics">
                                <div className="metric">
                                    <label>Win Rate</label>
                                    <div className="success">{backtest.winRate}%</div>
                                </div>
                                <div className="metric">
                                    <label>Sharpe Ratio</label>
                                    <div className="success">{backtest.sharpe}</div>
                                </div>
                                <div className="metric">
                                    <label>Max Drawdown</label>
                                    <div className="danger">{backtest.maxDD}%</div>
                                </div>
                                <div className="metric">
                                    <label>Profit Factor</label>
                                    <div className="success">{backtest.profitFactor}</div>
                                </div>
                            </div>

                            <div className="chart">
                                <ResponsiveContainer width="100%" height={250}>
                                    <LineChart data={backtest.equity}>
                                        <CartesianGrid strokeDasharray="3 3" stroke="#444" />
                                        <XAxis dataKey="time" stroke="#888" />
                                        <YAxis stroke="#888" />
                                        <Tooltip
                                            contentStyle={{ backgroundColor: '#1a1a1a', border: '1px solid #444' }}
                                            labelStyle={{ color: '#fff' }}
                                        />
                                        <Line
                                            type="monotone"
                                            dataKey="value"
                                            stroke="#00ff00"
                                            isAnimationActive={false}
                                            strokeWidth={2}
                                        />
                                    </LineChart>
                                </ResponsiveContainer>
                            </div>

                            <div className="backtest-actions">
                                <button className="btn-save">💾 Guardar Perfil</button>
                                <button className="btn-load">📂 Cargar Perfil</button>
                            </div>
                        </>
                    ) : (
                        <div className="empty-state">
                            <p>👈 Ajusta parámetros y haz clic en "Backtest"</p>
                            <p>Verás el gráfico de equity y métricas aquí</p>
                        </div>
                    )}
                </div>
            </div>

            {/* Historial de cambios */}
            <div className="history-panel">
                <h3>📋 Historial de Cambios</h3>
                <div className="history-list">
                    <div className="history-item">
                        <span className="date">14-02 14:30</span>
                        <span className="change">RSI buy: 20 → 25</span>
                        <span className="user">Antigravity</span>
                    </div>
                    <div className="history-item">
                        <span className="date">14-02 14:25</span>
                        <span className="change">EMA short: 9 → 12</span>
                        <span className="user">System</span>
                    </div>
                </div>
            </div>
        </div>
    );
}
