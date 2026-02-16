// boosis-ui/src/components/TheRefinery.jsx
import React, { useState, useEffect, useCallback, useRef } from 'react';
import axios from 'axios';
import {
    LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer
} from 'recharts';
import { startMining, getMinerStatus } from '../services/api';
import './TheRefinery.css';

export default function TheRefinery({ token }) {
    const [selectedSymbol, setSelectedSymbol] = useState('BTCUSDT');
    const [profile, setProfile] = useState(null);
    const [formData, setFormData] = useState({});
    const [backtest, setBacktest] = useState(null);
    const [loading, setLoading] = useState(false);
    const [message, setMessage] = useState('');
    const [savedProfiles, setSavedProfiles] = useState([]);
    const [history, setHistory] = useState([]);
    const backtestTimeoutRef = useRef(null);

    // Miner State
    const [minerDays, setMinerDays] = useState(90);
    const [minerJob, setMinerJob] = useState(null);
    const [minerInterval, setMinerInterval] = useState(null);

    // Cargar perfil al cambiar símbolo
    useEffect(() => {
        loadProfile();
        loadProfiles();
        loadHistory();
    }, [selectedSymbol]);

    // Miner Polling (Global, checks any active job)
    useEffect(() => {
        const checkStatus = async () => {
            try {
                const res = await getMinerStatus();
                if (res.data && res.data.status === 'mining') {
                    setMinerJob(res.data);
                } else if (res.data && (res.data.status === 'completed' || res.data.status === 'error')) {
                    setMinerJob(res.data);
                    // Stop polling after a few seconds of result
                    if (res.data.status === 'completed') setMessage('✅ Minería completada exitosamente');
                    if (res.data.status === 'error') setMessage(`❌ Error minería: ${res.data.error}`);
                }
            } catch (err) {
                console.error("Miner poll error", err);
            }
        };

        // Poll immediately and then interval
        checkStatus();
        const interval = setInterval(checkStatus, 2000);
        return () => clearInterval(interval);
    }, []);

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

    const loadHistory = async () => {
        try {
            const response = await axios.get(
                `/api/refinery/history/${selectedSymbol}`,
                { headers: { Authorization: `Bearer ${token}` } }
            );
            setHistory(response.data.history);
        } catch (error) {
            console.error('Error loading history:', error);
        }
    };

    const handleStartMining = async () => {
        try {
            setMessage('⛏️ Iniciando inyección de datos...');
            await startMining(selectedSymbol, minerDays);
        } catch (error) {
            setMessage(`❌ Error iniciando minería: ${error.response?.data?.error || error.message}`);
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

    const handleSliderChangeWithDebounce = useCallback((field, value) => {
        handleSliderChange(field, value);

        if (backtestTimeoutRef.current) {
            clearTimeout(backtestTimeoutRef.current);
        }

        backtestTimeoutRef.current = setTimeout(() => {
            handleBacktestInternal(field, value);
        }, 1000);
    }, [selectedSymbol, formData]);

    const handleBacktestInternal = async (field, value) => {
        const [group, subfield] = field.split('.');
        const updatedParams = {
            ...formData,
            [group]: {
                ...formData[group],
                [subfield]: parseFloat(value)
            }
        };
        runRealBacktest(updatedParams);
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
            setTimeout(() => setMessage(''), 3000);
        } catch (error) {
            setMessage(`❌ Error: ${error.response?.data?.error || error.message}`);
        } finally {
            setLoading(false);
        }
    };

    const handleBacktest = () => {
        runRealBacktest(formData);
    };

    const runRealBacktest = async (params) => {
        try {
            setLoading(true);
            setMessage('⏳ Calculando backtest con datos reales...');

            const response = await axios.post(
                '/api/refinery/backtest',
                {
                    symbol: selectedSymbol,
                    params: params,
                    period: '1y'
                },
                { headers: { Authorization: `Bearer ${token}` } }
            );

            const data = response.data.data;

            setBacktest({
                winRate: data.metrics.winRate,
                sharpe: data.metrics.sharpe,
                maxDD: data.metrics.maxDD,
                profitFactor: data.metrics.profitFactor,
                totalTrades: data.metrics.totalTrades,
                roi: data.metrics.roi,
                equity: data.equity.map(point => ({
                    time: new Date(point.time).toLocaleDateString(),
                    value: point.value
                }))
            });

            setMessage(`✅ Backtest completado: Win Rate ${data.metrics.winRate}% | ROI ${data.metrics.roi}%`);
        } catch (error) {
            console.error('Backtest error:', error);
            setMessage(`❌ Error backtesting: ${error.response?.data?.error || error.message}`);
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
                        disabled={loading || (minerJob && minerJob.status === 'mining')}
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

            {/* MINER SECTION */}
            <div className="miner-section">
                <h3>⛏️ INYECCIÓN DE DATOS DE MERCADO</h3>
                <div className="miner-controls">
                    <div className="days-selector">
                        <label>Historial a inyectar:</label>
                        <select value={minerDays} onChange={(e) => setMinerDays(e.target.value)} disabled={minerJob?.status === 'mining'}>
                            <option value="30">30 Días (Rápido)</option>
                            <option value="90">90 Días (Estándar)</option>
                            <option value="180">6 Meses (Robusto)</option>
                            <option value="365">1 Año (Completo)</option>
                        </select>
                    </div>

                    <button
                        className={`btn-mine ${minerJob?.status === 'mining' ? 'mining' : ''}`}
                        onClick={handleStartMining}
                        disabled={minerJob?.status === 'mining'}
                    >
                        {minerJob?.status === 'mining' ? '⛏️ MINANDO DATOS...' : '💉 INYECTAR DATOS'}
                    </button>
                </div>

                {minerJob && minerJob.status === 'mining' && (
                    <div className="miner-progress">
                        <div className="progress-bar-container">
                            <div className="progress-bar" style={{ width: `${minerJob.progress}%` }}></div>
                        </div>
                        <div className="progress-text">
                            Importando {minerJob.symbol}: {minerJob.progress}% ({minerJob.imported} velas)
                        </div>
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
                                onChange={(e) => handleSliderChangeWithDebounce('rsi.buy', e.target.value)}
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
                                onChange={(e) => handleSliderChangeWithDebounce('rsi.sell', e.target.value)}
                                disabled={loading}
                            />
                            <span className="value">{formData.rsi?.sell || 70}</span>
                        </div>
                    </div>

                    {/* EMA Ranges... */}
                    <div className="param-group">
                        <label>EMA Short</label>
                        <div className="slider-container">
                            <input
                                type="range"
                                min="1"
                                max="50"
                                step="1"
                                value={formData.ema?.short || 9}
                                onChange={(e) => handleSliderChangeWithDebounce('ema.short', e.target.value)}
                                disabled={loading}
                            />
                            <span className="value">{formData.ema?.short || 9}</span>
                        </div>
                    </div>

                    <div className="param-group">
                        <label>EMA Trend</label>
                        <div className="slider-container">
                            <input type="range" min="10" max="200" step="1"
                                value={formData.ema?.trend || 50}
                                onChange={(e) => handleSliderChangeWithDebounce('ema.trend', e.target.value)}
                            />
                            <span className="value">{formData.ema?.trend || 50}</span>
                        </div>
                    </div>

                    {/* Botones de acción */}
                    <div className="action-buttons">
                        <button onClick={handleReset} disabled={loading} className="btn-reset">🔄 Reset</button>
                        <button onClick={handleApply} disabled={loading} className="btn-apply">✅ Aplicar</button>
                        <button onClick={handleBacktest} disabled={loading} className="btn-backtest">📊 Backtest</button>
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
                                    <label>ROI</label>
                                    <div className={backtest.roi >= 0 ? 'success' : 'danger'}>{backtest.roi}%</div>
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
                                        <XAxis dataKey="time" stroke="#888" minTickGap={30} />
                                        <YAxis stroke="#888" domain={['auto', 'auto']} />
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
                                            dot={false}
                                        />
                                    </LineChart>
                                </ResponsiveContainer>
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
                    {history.length > 0 ? history.map((item, idx) => (
                        <div key={idx} className="history-item">
                            <span className="date">{new Date(item.changed_at).toLocaleString()}</span>
                            <span className="change">{item.field_changed} &rarr; {typeof item.new_value === 'object' ? 'Params' : item.new_value}</span>
                        </div>
                    )) : (
                        <div className="empty-state">No hay historial de cambios</div>
                    )}
                </div>
            </div>
        </div>
    );
}
