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
    const [backtestLogs, setBacktestLogs] = useState([]); // El "Motor del Ferrari"
    const [optimizationResults, setOptimizationResults] = useState(null);
    const [marketRegime, setMarketRegime] = useState(null); // Nuevo: Monitor HMM
    const [optimizationReasoning, setOptimizationReasoning] = useState('');
    const [loading, setLoading] = useState(false);
    const [message, setMessage] = useState('');
    const [savedProfiles, setSavedProfiles] = useState([]);
    const [history, setHistory] = useState([]);
    const [strategyLibrary, setStrategyLibrary] = useState([]);
    const [libName, setLibName] = useState('');
    const backtestTimeoutRef = useRef(null);

    // Miner State
    const [minerDays, setMinerDays] = useState(90);
    const [minerInterval, setMinerInterval] = useState('1m');
    const [minerJob, setMinerJob] = useState(null);
    const [backtestPeriod, setBacktestPeriod] = useState('1y');
    const [studyStartDate, setStudyStartDate] = useState(''); // Nuevo: Fecha inicio personalizada
    const [studyEndDate, setStudyEndDate] = useState('');     // Nuevo: Fecha fin personalizada
    const [selectedStrategy, setSelectedStrategy] = useState('BoosisTrend');

    const STRATEGY_INFO = {
        BoosisTrend: {
            name: '📈 Boosis Trend Follower',
            logic: 'Sigue la tendencia principal comparando 3 EMAs (Estrategia "Triple Cruce"). Compra en rebotes oversold dentro de tendencias alcistas confirmadas. Ideal para mercados en tendencia.',
            params: ['rsi.buy', 'rsi.sell', 'ema.short', 'ema.trend']
        },
        BoosisScalper: {
            name: '⚡ Boosis Scalper (Guerrilla)',
            logic: 'Busca micro-rebotes rápidos. Utiliza Stochastic RSI y Bollinger Bands de forma agresiva. Entra y sale rápido (1-2% de target). Diseñado para alta volatilidad.',
            params: ['rsi.buy', 'rsi.sell', 'bb.std_dev']
        },
        MeanReversion: {
            name: '🔄 Mean Reversion',
            logic: 'Se basa en la ley del retorno a la media. Compra cuando el precio se aleja demasiado (bandas BB) y el RSI indica agotamiento extremo.',
            params: ['rsi.buy', 'rsi.sell', 'bb.std_dev']
        }
    };

    // Cargar perfil al cambiar símbolo
    useEffect(() => {
        loadProfile();
        loadProfiles();
        loadHistory();
        loadLibrary();
        loadMarketRegime();
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
            if (response.data.profile.strategy_name) {
                setSelectedStrategy(response.data.profile.strategy_name);
            }
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

    const loadLibrary = async () => {
        try {
            const response = await axios.get(
                '/api/library/list',
                { headers: { Authorization: `Bearer ${token}` } }
            );
            setStrategyLibrary(response.data.library);
        } catch (error) {
            console.error('Error loading library:', error);
        }
    };

    const loadMarketRegime = async () => {
        try {
            const query = backtestPeriod === 'custom'
                ? `startDate=${studyStartDate}&endDate=${studyEndDate}`
                : `period=${backtestPeriod}`;

            const response = await axios.get(
                `/api/refinery/hmm/${selectedSymbol}?${query}`,
                { headers: { Authorization: `Bearer ${token}` } }
            );
            if (response.data.analysis) {
                setMarketRegime(response.data.analysis);
            }
        } catch (error) {
            console.error('Error loading market regime:', error);
        }
    };

    const handleSaveToLibrary = async () => {
        if (!libName) {
            setMessage('⚠️ Por favor asigna un nombre a la estrategia');
            return;
        }
        try {
            setLoading(true);
            await axios.post(
                '/api/library/save',
                {
                    name: libName,
                    symbol: selectedSymbol,
                    strategy_name: selectedStrategy,
                    params: formData,
                    metrics: backtest ? {
                        roi: backtest.roi,
                        winRate: backtest.winRate,
                        trades: backtest.totalTrades
                    } : null
                },
                { headers: { Authorization: `Bearer ${token}` } }
            );
            setMessage(`✅ Estrategia "${libName}" guardada en la biblioteca`);
            setLibName('');
            loadLibrary();
        } catch (error) {
            setMessage(`❌ Error al guardar: ${error.message}`);
        } finally {
            setLoading(false);
        }
    };

    const handleDeleteLibrary = async (id) => {
        try {
            await axios.delete(`/api/library/${id}`, { headers: { Authorization: `Bearer ${token}` } });
            loadLibrary();
        } catch (error) {
            console.error('Error deleting library item');
        }
    };

    const handleLoadFromLibrary = (item) => {
        setFormData(item.params);
        setSelectedStrategy(item.strategy_name);
        setMessage(`🔄 Cargada configuración: ${item.name}`);
    };

    const handleStartMining = async () => {
        try {
            setMessage('⛏️ Iniciando inyección de datos...');
            await startMining(selectedSymbol, minerDays, minerInterval);
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
            },
            strategy_name: selectedStrategy
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
                    params: { ...formData, strategy_name: selectedStrategy }
                },
                { headers: { Authorization: `Bearer ${token}` } }
            );

            setMessage('✅ Parámetros aplicados exitosamente');
            setProfile(formData);
            setTimeout(() => setMessage(''), 3000);
        } catch (error) {
            setMessage(`❌ Error: ${error.response?.data?.error || error.message}`);
        } finally {
            setLoading(false);
        }
    };

    const handleBacktest = () => {
        runRealBacktest({ ...formData, strategy_name: selectedStrategy });
    };

    const handleOptimize = async () => {
        try {
            setLoading(true);
            setMessage('🔬 El Laboratorio está buscando la configuración óptima...');

            const response = await axios.post(
                '/api/optimize',
                {
                    symbol: selectedSymbol,
                    period: backtestPeriod,
                    params: formData
                },
                { headers: { Authorization: `Bearer ${token}` } }
            );

            const { bestConfig, reasoning } = response.data.results;

            setOptimizationResults(bestConfig);
            setOptimizationReasoning(reasoning);
            setFormData(bestConfig.params); // Aplicar automáticamente la mejor encontrada al form

            setMessage(`✨ ¡Configuración optimizada encontrada!`);
            runRealBacktest(bestConfig.params); // Ejecutar backtest de la mejor encontrada inmediatamente
        } catch (error) {
            console.error('Optimization error:', error);
            setMessage(`❌ Error en optimización: ${error.response?.data?.error || error.message}`);
        } finally {
            setLoading(false);
        }
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
                    period: backtestPeriod,
                    startDate: backtestPeriod === 'custom' ? studyStartDate : undefined,
                    endDate: backtestPeriod === 'custom' ? studyEndDate : undefined
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

            // Extraer logs de trades como "cálculos del motor"
            if (data.trades) {
                const engineLogs = data.trades.slice(-20).reverse().map(t => ({
                    time: new Date(t.time).toLocaleTimeString(),
                    msg: `[ENGINE] ${t.side.toUpperCase()} @ ${t.price} | Motivo: ${t.reason} ${t.pnl ? `| PnL: ${t.pnl.toFixed(2)}` : ''}`
                }));
                setBacktestLogs(engineLogs);
            }

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

    if (!profile) {
        return <div className="refinery-loading">Cargando The Refinery...</div>;
    }

    return (
        <div className="the-refinery">
            <h1>🧪 THE REFINERY - Laboratorio de Optimización</h1>

            {/* Header */}
            <div className="refinery-header">
                <div className="symbol-selector" style={{ display: 'flex', gap: '20px' }}>
                    <div>
                        <label>Símbolo:</label>
                        <select
                            value={selectedSymbol}
                            onChange={(e) => setSelectedSymbol(e.target.value)}
                            disabled={loading || (minerJob && minerJob.status === 'mining')}
                        >
                            <option value="BTCUSDT">Bitcoin (BTCUSDT)</option>
                            <option value="ETHUSDT">Ethereum (ETHUSDT)</option>
                            <option value="SOLUSDT">Solana (SOLUSDT)</option>
                            <option value="PEPEUSDT">Pepe (PEPEUSDT)</option>
                            <option value="WIFUSDT">Dogwifhat (WIFUSDT)</option>
                        </select>
                    </div>

                    <div>
                        <label>🧪 Estrategia en Laboratorio:</label>
                        <select
                            value={selectedStrategy}
                            onChange={(e) => setSelectedStrategy(e.target.value)}
                            disabled={loading}
                            style={{ border: '1px solid #00ff88', color: '#00ff88' }}
                        >
                            <option value="BoosisTrend">Boosis Trend Follower</option>
                            <option value="BoosisScalper">Boosis Scalper (Guerrilla)</option>
                            <option value="MeanReversion">Mean Reversion</option>
                        </select>
                    </div>
                </div>

                {message && (
                    <div className={`message ${message.includes('✅') ? 'success' : 'error'}`}>
                        {message}
                    </div>
                )}
            </div>

            {/* STRATEGY LOGIC CARD */}
            <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '20px', marginBottom: '30px' }}>
                <div className="strategy-logic-panel" style={{ marginBottom: 0 }}>
                    <div className="logic-badge">LOGICA DE LA ESTRATEGIA</div>
                    <h2>{STRATEGY_INFO[selectedStrategy].name}</h2>
                    <p>{STRATEGY_INFO[selectedStrategy].logic}</p>
                </div>

                {/* HMM MONITOR */}
                <div className="hmm-monitor-panel" style={{
                    background: 'rgba(139, 92, 246, 0.05)',
                    border: '1px solid rgba(139, 92, 246, 0.3)',
                    borderRadius: '10px',
                    padding: '20px',
                    position: 'relative'
                }}>
                    <div style={{ position: 'absolute', top: 0, right: 0, background: '#8b5cf6', color: '#fff', fontSize: '9px', fontWeight: 'bold', padding: '4px 8px', borderBottomLeftRadius: '8px' }}>
                        HMM BAUM-WELCH
                    </div>
                    <h3 style={{ margin: '0 0 10px 0', fontSize: '14px', color: '#8b5cf6' }}>🧠 RÉGIMEN DE MERCADO</h3>
                    {marketRegime && marketRegime.currentState ? (
                        <div>
                            <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#fff' }}>
                                {marketRegime.currentState.state === 1 ? '📈 TENDENCIA' :
                                    marketRegime.currentState.state === 2 ? '⚡ VOLATILIDAD' : '🔄 LATERAL'}
                            </div>
                            <div style={{ fontSize: '12px', color: '#8b5cf6', marginTop: '5px' }}>
                                Probabilidad: {(marketRegime.currentState.probability * 100).toFixed(1)}%
                            </div>
                        </div>
                    ) : (
                        <div style={{ color: '#666', fontSize: '12px' }}>Analizando patrones latentes...</div>
                    )}
                </div>
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
                            <option value="365">1 Año (Completo)</option>
                            <option value="1825">5 Años (Máximo)</option>
                        </select>
                    </div>

                    <div className="interval-selector">
                        <label>Intervalo:</label>
                        <select value={minerInterval} onChange={(e) => setMinerInterval(e.target.value)} disabled={minerJob?.status === 'mining'}>
                            <option value="1m">1 Minuto</option>
                            <option value="5m">5 Minutos</option>
                            <option value="15m">15 Minutos</option>
                            <option value="1h">1 Hora</option>
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
                    <h2>📊 Parámetros Dinámicos</h2>

                    {STRATEGY_INFO[selectedStrategy].params.includes('rsi.buy') && (
                        <>
                            <div className="param-group">
                                <label>RSI Buy Bound (Sobrevendido)</label>
                                <div className="slider-container">
                                    <input type="range" min="5" max="45" step="1"
                                        value={formData.rsi?.buy || 25}
                                        onChange={(e) => handleSliderChangeWithDebounce('rsi.buy', e.target.value)}
                                    />
                                    <span className="value">{formData.rsi?.buy || 25}</span>
                                </div>
                            </div>
                            <div className="param-group">
                                <label>RSI Sell Bound (Sobrecomprado)</label>
                                <div className="slider-container">
                                    <input type="range" min="55" max="95" step="1"
                                        value={formData.rsi?.sell || 75}
                                        onChange={(e) => handleSliderChangeWithDebounce('rsi.sell', e.target.value)}
                                    />
                                    <span className="value">{formData.rsi?.sell || 75}</span>
                                </div>
                            </div>
                        </>
                    )}

                    {STRATEGY_INFO[selectedStrategy].params.includes('ema.short') && (
                        <div className="param-group">
                            <label>EMA Rápida (Short)</label>
                            <div className="slider-container">
                                <input type="range" min="5" max="25" step="1"
                                    value={formData.ema?.short || 12}
                                    onChange={(e) => handleSliderChangeWithDebounce('ema.short', e.target.value)}
                                />
                                <span className="value">{formData.ema?.short || 12}</span>
                            </div>
                        </div>
                    )}

                    {STRATEGY_INFO[selectedStrategy].params.includes('bb.std_dev') && (
                        <div className="param-group">
                            <label>Bollinger Std Deviation</label>
                            <div className="slider-container">
                                <input type="range" min="1.0" max="3.5" step="0.1"
                                    value={formData.bb?.std_dev || 2.0}
                                    onChange={(e) => handleSliderChangeWithDebounce('bb.std_dev', e.target.value)}
                                />
                                <span className="value">{formData.bb?.std_dev || 2.0}</span>
                            </div>
                        </div>
                    )}

                    <div className="param-group" style={{ marginTop: '20px', borderTop: '1px solid #333', paddingTop: '15px' }}>
                        <label>📅 Período de Tiempo del Test</label>
                        <select value={backtestPeriod} onChange={(e) => setBacktestPeriod(e.target.value)}>
                            <option value="1m">Último Mes</option>
                            <option value="3m">Últimos 3 Meses</option>
                            <option value="1y">Último Año</option>
                            <option value="5y">Historial Completo (Debe estar minado)</option>
                            <option value="custom">📅 Rango Personalizado (Área de Estudio)</option>
                        </select>
                    </div>

                    {backtestPeriod === 'custom' && (
                        <div className="custom-date-range">
                            <div className="date-input-wrapper">
                                <label>Inicio:</label>
                                <input
                                    type="date"
                                    value={studyStartDate}
                                    onChange={(e) => setStudyStartDate(e.target.value)}
                                />
                            </div>
                            <div className="date-input-wrapper">
                                <label>Fin:</label>
                                <input
                                    type="date"
                                    value={studyEndDate}
                                    onChange={(e) => setStudyEndDate(e.target.value)}
                                />
                            </div>
                        </div>
                    )}

                    <div className="action-buttons">
                        <button onClick={handleReset} className="btn-reset">🔄 Reset</button>
                        <button onClick={handleBacktest} className="btn-backtest">📊 BACKTEST</button>
                        <button onClick={handleOptimize} className="btn-optimize" style={{ background: '#58a6ff', color: '#000', fontWeight: 'bold' }}>🔬 AUTO-OPTIMIZAR (THE LAB)</button>
                    </div>
                    <button onClick={handleApply} className="btn-apply" style={{ background: '#00ff88', color: '#000', width: '100%', marginTop: '10px' }}>🚀 APLICAR A BOT REAL</button>
                </div>

                {/* Right: Backtest Preview */}
                <div className="backtest-panel">
                    <h2>📈 Resultado de la Simulación</h2>

                    {optimizationReasoning && (
                        <div className="optimization-logic" style={{ background: 'rgba(88, 166, 255, 0.1)', border: '1px solid #58a6ff', padding: '15px', borderRadius: '8px', marginBottom: '20px' }}>
                            <div style={{ fontSize: '10px', color: '#58a6ff', fontWeight: 'bold', marginBottom: '5px' }}>RAZONAMIENTO DEL LABORATORIO:</div>
                            <div style={{ fontSize: '13px', color: '#e6edf3', fontStyle: 'italic' }}>"{optimizationReasoning}"</div>
                        </div>
                    )}

                    {backtest ? (
                        <>
                            <div className="metrics">
                                <div className="metric">
                                    <label>Win Rate</label>
                                    <div className="success">{backtest.winRate}%</div>
                                </div>
                                <div className="metric">
                                    <label>ROI Proyectado</label>
                                    <div className={backtest.roi >= 0 ? 'success' : 'danger'}>{backtest.roi}%</div>
                                </div>
                                <div className="metric">
                                    <label>Max Drawdown</label>
                                    <div className="danger">{backtest.maxDD}%</div>
                                </div>
                                <div className="metric">
                                    <label>Total Trades</label>
                                    <div className="value">{backtest.totalTrades}</div>
                                </div>
                            </div>

                            <div className="chart">
                                <ResponsiveContainer width="99%" height={250}>
                                    <LineChart data={backtest.equity}>
                                        <CartesianGrid strokeDasharray="3 3" stroke="#333" />
                                        <XAxis dataKey="time" stroke="#888" minTickGap={50} />
                                        <YAxis stroke="#888" domain={['auto', 'auto']} />
                                        <Tooltip contentStyle={{ background: '#111', border: '1px solid #444' }} />
                                        <Line type="monotone" dataKey="value" stroke="#00ff88" strokeWidth={2} dot={false} />
                                    </LineChart>
                                </ResponsiveContainer>
                            </div>

                            {/* FERRARI ENGINE MONITOR */}
                            <div className="engine-monitor" style={{
                                background: '#000',
                                border: '1px solid #ff000033',
                                borderRadius: '4px',
                                padding: '10px',
                                marginTop: '10px',
                                fontFamily: '"Courier New", Courier, monospace',
                                height: '150px',
                                overflowY: 'auto'
                            }}>
                                <div style={{ color: '#ff0000', fontSize: '10px', fontWeight: 'bold', marginBottom: '8px', borderBottom: '1px solid #ff000033' }}>
                                    🏎️ FERRARI ENGINE CALCULATIONS [REAL-TIME STREAM]
                                </div>
                                {backtestLogs.map((log, i) => (
                                    <div key={i} style={{ color: '#00ff00', fontSize: '11px', marginBottom: '3px' }}>
                                        <span style={{ color: '#444' }}>[{log.time}]</span> {log.msg}
                                    </div>
                                ))}
                                {backtestLogs.length === 0 && <div style={{ color: '#444' }}>Esperando ignición del motor...</div>}
                            </div>
                        </>
                    ) : (
                        <div className="empty-state">
                            <p>🔬 Ajusta los parámetros a la izquierda y pulsa "CALCULAR BACKTEST" para ver los resultados.</p>
                        </div>
                    )}
                </div>
            </div>

            {/* LIBRARY SECTION */}
            <div className="strategy-library-panel" style={{ marginTop: '30px' }}>
                <h3>📚 BIBLIOTECA DE ESTRATEGIAS (EL ARCA)</h3>
                <div className="save-to-lib">
                    <input
                        type="text"
                        placeholder="Nombre de la estrategia (ej: Simons Alpha BTC)"
                        value={libName}
                        onChange={(e) => setLibName(e.target.value)}
                    />
                    <button onClick={handleSaveToLibrary} className="btn-save-lib">💾 GUARDAR CONFIGURACIÓN ACTUAL</button>
                </div>

                <div className="library-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '15px', marginTop: '20px' }}>
                    {strategyLibrary.map((item) => (
                        <div key={item.id} className="library-card" style={{ background: 'rgba(255,255,255,0.05)', padding: '15px', borderRadius: '8px', border: '1px solid #444' }}>
                            <div style={{ display: 'flex', justifySelf: 'space-between', justifyContent: 'space-between', alignItems: 'center' }}>
                                <h4 style={{ margin: 0, color: '#00ff88' }}>{item.name}</h4>
                                <button onClick={() => handleDeleteLibrary(item.id)} style={{ background: 'none', border: 'none', color: '#ff0064', cursor: 'pointer' }}>✕</button>
                            </div>
                            <div style={{ fontSize: '12px', color: '#888', margin: '5px 0' }}>{item.symbol} | {item.strategy_name}</div>
                            {item.metrics && (
                                <div style={{ display: 'flex', gap: '10px', fontSize: '12px', margin: '10px 0' }}>
                                    <span style={{ color: item.metrics.roi >= 0 ? '#00ff88' : '#ff0064' }}>ROI: {item.metrics.roi}%</span>
                                    <span>WR: {item.metrics.winRate}%</span>
                                </div>
                            )}
                            <button onClick={() => handleLoadFromLibrary(item)} className="btn-load-lib" style={{ width: '100%', padding: '5px', background: '#333', border: '1px solid #58a6ff', color: '#58a6ff', borderRadius: '4px', cursor: 'pointer' }}>🔌 CARGAR EN LABORATORIO</button>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}
