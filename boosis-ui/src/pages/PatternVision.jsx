
import React, { useEffect, useRef, useState } from 'react';
import { createChart } from 'lightweight-charts';
import { getCandles } from '../services/api';
import './PatternVision.css';

const VisionChart = ({ initialSymbol, symbol: syncedSymbol, timeframe: syncedTimeframe, token, onPattern, mode = 'price', onSymbolChange, onTimeframeChange }) => {
    const volumeOnly = mode === 'volume';
    const macdOnly = mode === 'macd';

    const [symbol, setSymbol] = useState(initialSymbol || syncedSymbol);
    const [timeframe, setTimeframe] = useState(syncedTimeframe || '4h');

    // Persistent MAVOL periods
    const [mav1Period, setMav1Period] = useState(() => Number(localStorage.getItem('boosis_mavol1')) || 7);
    const [mav2Period, setMav2Period] = useState(() => Number(localStorage.getItem('boosis_mavol2')) || 14);

    // Persistent MACD parameters
    const [macdFast, setMacdFast] = useState(() => Number(localStorage.getItem('boosis_macd_fast')) || 12);
    const [macdSlow, setMacdSlow] = useState(() => Number(localStorage.getItem('boosis_macd_slow')) || 26);
    const [macdSignal, setMacdSignal] = useState(() => Number(localStorage.getItem('boosis_macd_signal')) || 9);
    const [macdValues, setMacdValues] = useState({ macd: 0, signal: 0, hist: 0 });

    const [showSettings, setShowSettings] = useState(false);
    const chartContainerRef = useRef();
    const chartRef = useRef();
    const seriesRef = useRef();
    const patternSeriesRef = useRef();
    const mavol1Ref = useRef();
    const mavol2Ref = useRef();
    const macdLineRef = useRef();
    const macdSignalRef = useRef();
    const macdHistRef = useRef();
    const necklineRef = useRef();
    const settingsRef = useRef();
    const socketRef = useRef(null);
    const lastDataRef = useRef([]);

    const timeframes = ['1m', '5m', '15m', '30m', '1h', '4h', '1d'];
    const availablePairs = ['BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'XRPUSDT'];

    // Close settings when clicking outside
    useEffect(() => {
        const handleClickOutside = (event) => {
            if (settingsRef.current && !settingsRef.current.contains(event.target)) {
                setShowSettings(false);
            }
        };
        if (showSettings) {
            document.addEventListener('mousedown', handleClickOutside);
        }
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [showSettings]);

    const calculateSMA = (data, period) => {
        if (!data || data.length < period) return [];
        const sma = [];
        for (let i = 0; i < data.length; i++) {
            if (i < period - 1) {
                sma.push({ time: data[i].time, value: null });
                continue;
            }
            let sum = 0;
            for (let j = 0; j < period; j++) {
                sum += data[i - j].value;
            }
            sma.push({ time: data[i].time, value: sum / period });
        }
        return sma.filter(d => d.value !== null);
    };

    const calculateEMA = (data, period) => {
        if (!data || data.length === 0) return [];
        const ema = [];
        const k = 2 / (period + 1);
        let prevEma = data[0].close || data[0].value;

        for (let i = 0; i < data.length; i++) {
            const val = data[i].close !== undefined ? data[i].close : data[i].value;
            const currentEma = (val - prevEma) * k + prevEma;
            ema.push({ time: data[i].time, value: currentEma });
            prevEma = currentEma;
        }
        return ema;
    };

    const calculateMACD = (data, fast, slow, signal) => {
        if (!data || data.length < slow) return { macd: [], signal: [], hist: [] };

        const fastEma = calculateEMA(data, fast);
        const slowEma = calculateEMA(data, slow);

        const macdLine = [];
        for (let i = 0; i < data.length; i++) {
            const f = fastEma.find(e => e.time === data[i].time);
            const s = slowEma.find(e => e.time === data[i].time);
            if (f && s) {
                macdLine.push({ time: data[i].time, value: f.value - s.value });
            }
        }

        const signalLine = calculateEMA(macdLine, signal);

        const hist = [];
        for (let i = 0; i < macdLine.length; i++) {
            const s = signalLine.find(e => e.time === macdLine[i].time);
            if (s) {
                hist.push({
                    time: macdLine[i].time,
                    value: macdLine[i].value - s.value,
                    color: (macdLine[i].value - s.value) >= 0 ? 'rgba(38, 166, 154, 0.5)' : 'rgba(239, 83, 80, 0.5)'
                });
            }
        }

        return { macd: macdLine, signal: signalLine, hist };
    };

    // Re-calculate MAVOLs or MACD when periods change
    useEffect(() => {
        if (volumeOnly && lastDataRef.current.length > 0) {
            if (mavol1Ref.current) mavol1Ref.current.setData(calculateSMA(lastDataRef.current, mav1Period));
            if (mavol2Ref.current) mavol2Ref.current.setData(calculateSMA(lastDataRef.current, mav2Period));
        }
        if (macdOnly && lastDataRef.current.length > 0) {
            const { macd, signal, hist } = calculateMACD(lastDataRef.current, macdFast, macdSlow, macdSignal);
            if (macdLineRef.current) macdLineRef.current.setData(macd);
            if (macdSignalRef.current) macdSignalRef.current.setData(signal);
            if (macdHistRef.current) macdHistRef.current.setData(hist);
        }
    }, [mav1Period, mav2Period, macdFast, macdSlow, macdSignal, volumeOnly, macdOnly]);

    // Sync with external symbol if provided
    useEffect(() => {
        if (syncedSymbol) setSymbol(syncedSymbol);
    }, [syncedSymbol]);

    // Sync with external timeframe if provided
    useEffect(() => {
        if (syncedTimeframe) setTimeframe(syncedTimeframe);
    }, [syncedTimeframe]);

    useEffect(() => {
        const chart = createChart(chartContainerRef.current, {
            layout: {
                background: { color: '#0d1117' },
                textColor: '#8b949e',
            },
            grid: {
                vertLines: { color: '#161b22' },
                horzLines: { color: '#161b22' },
            },
            crosshair: { mode: 0 },
            timeScale: {
                borderColor: '#30363d',
                timeVisible: true,
            },
            width: chartContainerRef.current.clientWidth,
            height: 400
        });

        let mainSeries;
        if (volumeOnly) {
            mainSeries = chart.addHistogramSeries({
                color: '#26a69a',
                priceScaleId: '',
                priceFormat: { type: 'volume' },
            });

            // MAVOL Series
            mavol1Ref.current = chart.addLineSeries({
                color: '#00bcd4',
                lineWidth: 1.5,
                priceLineVisible: false,
                lastValueVisible: false,
            });

            mavol2Ref.current = chart.addLineSeries({
                color: '#e91e63',
                lineWidth: 1.5,
                priceLineVisible: false,
                lastValueVisible: false,
            });
        } else if (macdOnly) {
            // invisible series to hold time scale
            mainSeries = chart.addLineSeries({ lineWidth: 0, priceLineVisible: false, lastValueVisible: false });

            macdHistRef.current = chart.addHistogramSeries({
                color: '#26a69a',
                priceFormat: { type: 'price', precision: 4, minMove: 0.0001 },
                lastValueVisible: true,
            });

            macdLineRef.current = chart.addLineSeries({
                color: '#bb86fc', // Purple for MACD
                lineWidth: 1.5,
                priceFormat: { type: 'price', precision: 4, minMove: 0.0001 },
                priceLineVisible: false,
                lastValueVisible: true,
            });

            macdSignalRef.current = chart.addLineSeries({
                color: '#ff4081', // Pink for Signal
                lineWidth: 1.5,
                priceFormat: { type: 'price', precision: 4, minMove: 0.0001 },
                priceLineVisible: false,
                lastValueVisible: true,
            });

            chart.priceScale('right').applyOptions({
                scaleMargins: { top: 0.1, bottom: 0.1 },
                visible: true,
                borderVisible: true,
            });
        } else {
            mainSeries = chart.addCandlestickSeries({
                upColor: '#26a69a', downColor: '#ef5350', borderVisible: false,
                wickUpColor: '#26a69a', wickDownColor: '#ef5350',
            });
        }

        seriesRef.current = mainSeries;
        chartRef.current = chart;

        const loadData = async () => {
            try {
                const res = await getCandles(symbol, timeframe, 150, token);
                if (res && res.data && res.data.candles) {
                    lastDataRef.current = res.data.candles;
                    if (volumeOnly) {
                        const volData = res.data.candles.map(c => ({
                            time: c.time,
                            value: c.volume,
                            color: c.close >= c.open ? 'rgba(38, 166, 154, 0.5)' : 'rgba(239, 83, 80, 0.5)'
                        }));
                        mainSeries.setData(volData);
                        mavol1Ref.current.setData(calculateSMA(volData, mav1Period));
                        mavol2Ref.current.setData(calculateSMA(volData, mav2Period));
                    } else if (macdOnly) {
                        const { macd, signal, hist } = calculateMACD(res.data.candles, macdFast, macdSlow, macdSignal);
                        macdLineRef.current.setData(macd);
                        macdSignalRef.current.setData(signal);
                        macdHistRef.current.setData(hist);

                        if (macd.length > 0) {
                            setMacdValues({
                                macd: macd[macd.length - 1].value,
                                signal: signal[signal.length - 1].value,
                                hist: hist[hist.length - 1].value
                            });
                        }
                    } else {
                        mainSeries.setData(res.data.candles);
                    }
                    chart.timeScale().fitContent();

                    if (!volumeOnly && !macdOnly && res.data.pattern) {
                        drawPattern(res.data.pattern);
                        onPattern({ symbol, data: res.data.pattern });
                    }
                }
            } catch (e) {
                console.error(`Error loading candles for ${symbol}:`, e);
            }
        };

        const drawPattern = (pattern) => {
            if (volumeOnly || macdOnly || !pattern || !pattern.drawingPoints || pattern.drawingPoints.length === 0) return;

            if (patternSeriesRef.current) {
                try { chart.removeSeries(patternSeriesRef.current); } catch (e) { }
            }
            if (necklineRef.current) {
                try { seriesRef.current.removePriceLine(necklineRef.current); } catch (e) { }
            }

            const formattedPoints = pattern.drawingPoints.map(pt => ({
                time: pt.time,
                value: pt.price
            }));

            const colors = { BULLISH: '#00ff88', BEARISH: '#ff4d4d' };
            const pSeries = chart.addLineSeries({
                color: colors[pattern.direction] || '#f39c12',
                lineWidth: 3,
                lastValueVisible: false,
                priceLineVisible: false,
            });

            pSeries.setData(formattedPoints);
            patternSeriesRef.current = pSeries;

            const markers = pattern.drawingPoints.map(pt => ({
                time: pt.time,
                position: pt.price > (pattern.neckline || pt.price) ? 'aboveBar' : 'belowBar',
                color: '#ffffff',
                shape: 'circle',
                text: pt.label
            }));
            pSeries.setMarkers(markers);

            if (pattern.neckline) {
                necklineRef.current = seriesRef.current.addPriceLine({
                    price: pattern.neckline,
                    color: '#f39c12',
                    lineWidth: 2,
                    lineStyle: 1,
                    title: 'NECKLINE',
                    axisLabelVisible: true,
                });
            }
        };

        loadData();
        const refreshInterval = setInterval(loadData, 5 * 60 * 1000);

        const wsUrl = `ws://${window.location.hostname}:3000/api/candles/stream?token=${token}&symbol=${symbol}&timeframe=${timeframe}`;
        const socket = new WebSocket(wsUrl);
        socketRef.current = socket;

        socket.onmessage = (event) => {
            const msg = JSON.parse(event.data);
            if (msg.time && msg.symbol === symbol) {
                if (volumeOnly) {
                    const newPoint = {
                        time: msg.time,
                        value: msg.volume,
                        color: msg.close >= msg.open ? 'rgba(38, 166, 154, 0.5)' : 'rgba(239, 83, 80, 0.5)'
                    };
                    mainSeries.update(newPoint);

                    // Update rolling data for SMA
                    const existingIdx = lastDataRef.current.findIndex(d => d.time === msg.time);
                    if (existingIdx !== -1) {
                        lastDataRef.current[existingIdx] = msg; // full candle for MACD/Volume
                    } else {
                        lastDataRef.current = [...lastDataRef.current, msg].slice(-150);
                    }

                    const volPoints = lastDataRef.current.map(c => ({
                        time: c.time,
                        value: c.volume,
                        color: c.close >= c.open ? 'rgba(38, 166, 154, 0.5)' : 'rgba(239, 83, 80, 0.5)'
                    }));
                    mavol1Ref.current.setData(calculateSMA(volPoints, mav1Period));
                    mavol2Ref.current.setData(calculateSMA(volPoints, mav2Period));
                } else if (macdOnly) {
                    // Update internal data
                    const existingIdx = lastDataRef.current.findIndex(d => d.time === msg.time);
                    if (existingIdx !== -1) {
                        lastDataRef.current[existingIdx] = msg;
                    } else {
                        lastDataRef.current = [...lastDataRef.current, msg].slice(-150);
                    }
                    const { macd, signal, hist } = calculateMACD(lastDataRef.current, macdFast, macdSlow, macdSignal);
                    macdLineRef.current.setData(macd);
                    macdSignalRef.current.setData(signal);
                    macdHistRef.current.setData(hist);

                    if (macd.length > 0) {
                        setMacdValues({
                            macd: macd[macd.length - 1].value,
                            signal: signal[signal.length - 1].value,
                            hist: hist[hist.length - 1].value
                        });
                    }
                } else {
                    mainSeries.update(msg);
                }
            }
            if (!volumeOnly && !macdOnly && msg.type === 'PATTERN_DETECTION' && msg.symbol === symbol) {
                drawPattern(msg.data);
                onPattern(msg);
            }
        };

        const handleResize = () => {
            if (chartContainerRef.current) {
                chart.applyOptions({ width: chartContainerRef.current.clientWidth });
            }
        };
        window.addEventListener('resize', handleResize);

        return () => {
            window.removeEventListener('resize', handleResize);
            clearInterval(refreshInterval);
            socket.close();
            chart.remove();
        };
    }, [symbol, timeframe, token, volumeOnly, macdOnly, mav1Period, mav2Period, macdFast, macdSlow, macdSignal]);

    const handleSymbolChange = (newSymbol) => {
        setSymbol(newSymbol);
        if (onSymbolChange) onSymbolChange(newSymbol);
    };

    const handleTimeframeChange = (newTf) => {
        setTimeframe(newTf);
        if (onTimeframeChange) onTimeframeChange(newTf);
    };

    const handleSaveSettings = () => {
        if (volumeOnly) {
            localStorage.setItem('boosis_mavol1', mav1Period);
            localStorage.setItem('boosis_mavol2', mav2Period);
        } else if (macdOnly) {
            localStorage.setItem('boosis_macd_fast', macdFast);
            localStorage.setItem('boosis_macd_slow', macdSlow);
            localStorage.setItem('boosis_macd_signal', macdSignal);
        }
        setShowSettings(false);
    };

    const handleResetSettings = () => {
        if (volumeOnly) {
            setMav1Period(7);
            setMav2Period(14);
        } else if (macdOnly) {
            setMacdFast(12);
            setMacdSlow(26);
            setMacdSignal(9);
        }
    };

    return (
        <div className={`vision-chart-card ${mode !== 'price' ? 'special-mode' : ''}`}>
            <div className="card-header binance-style">
                <div className="left-controls" ref={settingsRef}>
                    {!volumeOnly && !macdOnly ? (
                        <select
                            value={symbol}
                            onChange={(e) => handleSymbolChange(e.target.value)}
                            className="symbol-selector"
                        >
                            {availablePairs.map(p => <option key={p} value={p}>{p}</option>)}
                        </select>
                    ) : (
                        <div className="volume-label-group">
                            <span className="symbol-label">{symbol} ({mode.toUpperCase()}) — {timeframe}</span>
                            <div className="mavol-badges">
                                {volumeOnly && (
                                    <>
                                        <span className="m-badge c1">MA{mav1Period}</span>
                                        <span className="m-badge c2">MA{mav2Period}</span>
                                    </>
                                )}
                                {macdOnly && (
                                    <>
                                        <span className="m-badge c1">MACD({macdFast},{macdSlow},{macdSignal})</span>
                                        <span className="m-val" style={{ color: '#bb86fc' }}>{macdValues.macd.toFixed(4)}</span>
                                        <span className="m-val" style={{ color: '#ff4081' }}>{macdValues.signal.toFixed(4)}</span>
                                        <span className="m-val" style={{ color: macdValues.hist >= 0 ? '#26a69a' : '#ef5350' }}>{macdValues.hist.toFixed(4)}</span>
                                    </>
                                )}
                                <button className="settings-btn" onClick={() => setShowSettings(!showSettings)}>⚙️</button>
                            </div>

                            {showSettings && (
                                <div className="volume-settings-popover">
                                    <div className="settings-fields">
                                        {volumeOnly ? (
                                            <>
                                                <div className="setting-item">
                                                    <label>MAVOL 1:</label>
                                                    <input type="number" value={mav1Period} onChange={(e) => setMav1Period(Number(e.target.value))} min="2" max="50" />
                                                </div>
                                                <div className="setting-item">
                                                    <label>MAVOL 2:</label>
                                                    <input type="number" value={mav2Period} onChange={(e) => setMav2Period(Number(e.target.value))} min="2" max="50" />
                                                </div>
                                            </>
                                        ) : (
                                            <>
                                                <div className="setting-item">
                                                    <label>Rápida:</label>
                                                    <input type="number" value={macdFast} onChange={(e) => setMacdFast(Number(e.target.value))} min="2" max="50" />
                                                </div>
                                                <div className="setting-item">
                                                    <label>Lenta:</label>
                                                    <input type="number" value={macdSlow} onChange={(e) => setMacdSlow(Number(e.target.value))} min="5" max="100" />
                                                </div>
                                                <div className="setting-item">
                                                    <label>Señal:</label>
                                                    <input type="number" value={macdSignal} onChange={(e) => setMacdSignal(Number(e.target.value))} min="2" max="50" />
                                                </div>
                                            </>
                                        )}
                                    </div>
                                    <div className="settings-actions">
                                        <button className="reset-btn" onClick={handleResetSettings}>Reiniciar</button>
                                        <button className="save-btn" onClick={handleSaveSettings}>Guardar</button>
                                    </div>
                                </div>
                            )}
                        </div>
                    )}
                </div>
                {!volumeOnly && !macdOnly ? (
                    <div className="timeframe-selector">
                        {timeframes.map(tf => (
                            <button
                                key={tf}
                                className={`tf-btn ${timeframe === tf ? 'active' : ''}`}
                                onClick={() => handleTimeframeChange(tf)}
                            >
                                {tf}
                            </button>
                        ))}
                    </div>
                ) : null}
            </div>
            <div ref={chartContainerRef} className="mini-chart" />
        </div>
    );
};

const PatternVision = ({ token }) => {
    const [detections, setDetections] = useState({});
    const [focusSymbol, setFocusSymbol] = useState('BTCUSDT');
    const [focusTimeframe, setFocusTimeframe] = useState('4h');

    // Default pairs for bottom row
    const bottomPairs = ['SOLUSDT', 'XRPUSDT'];

    const handleNewPattern = (msg) => {
        setDetections(prev => ({ ...prev, [msg.symbol]: msg }));
    };

    return (
        <div className="pattern-vision-container">
            <div className="vision-grid">
                {/* TOP LEFT (1): Main Focus Chart */}
                <VisionChart
                    mode="price"
                    initialSymbol="BTCUSDT"
                    token={token}
                    onPattern={handleNewPattern}
                    onSymbolChange={setFocusSymbol}
                    onTimeframeChange={setFocusTimeframe}
                />

                {/* TOP RIGHT (2): Volume Focus (Follows Panel 1) */}
                <VisionChart
                    mode="volume"
                    symbol={focusSymbol}
                    timeframe={focusTimeframe}
                    token={token}
                    onPattern={handleNewPattern}
                />

                {/* BOTTOM LEFT (3): MACD Focus (Follows Panel 1) */}
                <VisionChart
                    mode="macd"
                    symbol={focusSymbol}
                    timeframe={focusTimeframe}
                    token={token}
                    onPattern={handleNewPattern}
                />

                {/* BOTTOM RIGHT (4): Independent Price Chart (SOLUSDT default) */}
                <VisionChart
                    mode="price"
                    initialSymbol="SOLUSDT"
                    token={token}
                    onPattern={handleNewPattern}
                />
            </div>

            <div className="vision-footer-panel">
                <h3>Últimos Eventos Estructurales</h3>
                <div className="events-scroll">
                    {Object.values(detections).length > 0 ? (
                        Object.values(detections).map(d => (
                            <div key={d.symbol} className={`event-pill ${d.data.direction} animate-in`}>
                                <strong>{d.symbol}</strong>: {d.data.type.replace(/_/g, ' ')}
                                <span className="conf">{(d.data.confidence * 100).toFixed(0)}% Conf.</span>
                                <span className="target">Target: ${d.data.target.toFixed(2)}</span>
                            </div>
                        ))
                    ) : (
                        <p className="no-events">Escaneando estructuras en los 4 pares...</p>
                    )}
                </div>
            </div>
        </div>
    );
};

export default PatternVision;
