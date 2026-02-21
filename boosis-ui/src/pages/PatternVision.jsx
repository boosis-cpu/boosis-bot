
import React, { useEffect, useRef, useState } from 'react';
import { createChart } from 'lightweight-charts';
import { getCandles } from '../services/api';
import {
    Clock,
    Settings,
    Search,
    LayoutGrid,
    Zap,
    BarChart3,
    Layers,
    LayoutDashboard,
    FlaskConical,
    Cpu,
    Crosshair,
    Eye
} from 'lucide-react';
import { useNavigate, useLocation } from 'react-router-dom';
import './PatternVision.css';

const VisionChart = ({ initialSymbol, symbol: syncedSymbol, timeframe: syncedTimeframe, token, onPattern, mode = 'price', priceType = 'candle', showIndicators = false, onSymbolChange, onTimeframeChange }) => {
    const volumeOnly = mode === 'volume';
    const macdOnly = mode === 'macd';

    const [symbol, setSymbol] = useState(initialSymbol || syncedSymbol || localStorage.getItem('vision_symbol') || 'FETUSDT');
    const [timeframe, setTimeframe] = useState(syncedTimeframe || localStorage.getItem('vision_tf') || '1h');

    // Persistent MAVOL periods
    const [mav1Period, setMav1Period] = useState(() => Number(localStorage.getItem('boosis_mavol1')) || 7);
    const [mav2Period, setMav2Period] = useState(() => Number(localStorage.getItem('boosis_mavol2')) || 14);

    // Persistent MACD parameters
    const [macdFast, setMacdFast] = useState(() => Number(localStorage.getItem('boosis_macd_fast')) || 12);
    const [macdSlow, setMacdSlow] = useState(() => Number(localStorage.getItem('boosis_macd_slow')) || 26);
    const [macdSignal, setMacdSignal] = useState(() => Number(localStorage.getItem('boosis_macd_signal')) || 9);
    const [macdValues, setMacdValues] = useState({ macd: 0, signal: 0, hist: 0 });

    // Persistent Overlay Indicators (MA & BOLL)
    const [ma1Period, setMa1Period] = useState(() => Number(localStorage.getItem('boosis_ma1')) || 7);
    const [ma2Period, setMa2Period] = useState(() => Number(localStorage.getItem('boosis_ma2')) || 25);
    const [ma3Period, setMa3Period] = useState(() => Number(localStorage.getItem('boosis_ma3')) || 99);
    const [bollPeriod, setBollPeriod] = useState(() => Number(localStorage.getItem('boosis_boll_period')) || 20);
    const [bollStd, setBollStd] = useState(() => Number(localStorage.getItem('boosis_boll_std')) || 2);

    // Current values for premium labels
    const [maValues, setMaValues] = useState({ ma1: 0, ma2: 0, ma3: 0 });
    const [bollValues, setBollValues] = useState({ upper: 0, mid: 0, lower: 0 });

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
    const ma1Ref = useRef();
    const ma2Ref = useRef();
    const ma3Ref = useRef();
    const bollUpperRef = useRef();
    const bollMidRef = useRef();
    const bollLowerRef = useRef();
    const necklineRef = useRef();
    const settingsRef = useRef();
    const socketRef = useRef(null);
    const lastDataRef = useRef([]);

    const timeframes = ['1m', '5m', '15m', '30m', '1h', '4h', '1d'];
    const availablePairs = ['FETUSDT', 'RENDERUSDT', 'TAOUSDT', 'WLDUSDT', 'NEARUSDT'];

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
        let prevEma = data[0].close !== undefined ? data[0].close : data[0].value;

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

        const macdLine = fastEma.map((f, i) => ({
            time: f.time,
            value: f.value - slowEma[i].value
        }));

        const signalLine = calculateEMA(macdLine, signal);

        const hist = macdLine.map((m, i) => {
            const s = signalLine[i];
            const val = m.value - s.value;
            return {
                time: m.time,
                value: val,
                color: val >= 0 ? 'rgba(38, 166, 154, 0.5)' : 'rgba(239, 83, 80, 0.5)'
            };
        });

        return { macd: macdLine, signal: signalLine, hist };
    };

    const calculateBollingerBands = (data, period, stdDev) => {
        if (!data || data.length < period) return { upper: [], mid: [], lower: [] };

        const upper = [];
        const mid = [];
        const lower = [];

        for (let i = 0; i < data.length; i++) {
            if (i < period - 1) continue;

            const slice = data.slice(i - period + 1, i + 1);
            const sum = slice.reduce((acc, val) => acc + val.close, 0);
            const avg = sum / period;

            const squareDiffs = slice.map(val => Math.pow(val.close - avg, 2));
            const variance = squareDiffs.reduce((acc, val) => acc + val, 0) / period;
            const deviation = Math.sqrt(variance);

            const time = data[i].time;
            mid.push({ time, value: avg });
            upper.push({ time, value: avg + (stdDev * deviation) });
            lower.push({ time, value: avg - (stdDev * deviation) });
        }

        return { upper, mid, lower };
    };


    const formatVal = (val) => {
        if (!val && val !== 0) return '0.00';
        return val.toFixed(val > 100 ? 2 : 5);
    };

    const applyTimeShift = (candles) => {
        if (!candles) return [];
        const browserOffsetSecs = new Date().getTimezoneOffset() * 60;
        const shiftSecs = -browserOffsetSecs;

        return candles.map(c => {
            let base;
            if (Array.isArray(c)) {
                base = {
                    time: Math.floor(Number(c[0]) / 1000),
                    open: parseFloat(c[1]),
                    high: parseFloat(c[2]),
                    low: parseFloat(c[3]),
                    close: parseFloat(c[4]),
                    volume: parseFloat(c[5])
                };
            } else {
                base = { ...c, time: Number(c.time) };
            }
            return { ...base, time: base.time + shiftSecs };
        });
    };

    const applyTimeShiftToPoint = (time) => {
        const browserOffsetSecs = new Date().getTimezoneOffset() * 60;
        return Number(time) - browserOffsetSecs;
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
            height: chartContainerRef.current.clientHeight || 400
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
            if (priceType === 'line') {
                mainSeries = chart.addLineSeries({
                    color: '#26a69a',
                    lineWidth: 2,
                    priceFormat: { type: 'price', precision: 6, minMove: 0.000001 },
                });
            } else {
                mainSeries = chart.addCandlestickSeries({
                    upColor: '#26a69a', downColor: '#ef5350', borderVisible: false,
                    wickUpColor: '#26a69a', wickDownColor: '#ef5350',
                    priceFormat: { type: 'price', precision: 6, minMove: 0.000001 },
                });
            }

            // Overlay Indicators (only if enabled)
            if (showIndicators) {
                ma1Ref.current = chart.addLineSeries({ color: '#f0b90b', lineWidth: 1, priceLineVisible: false, lastValueVisible: false });
                ma2Ref.current = chart.addLineSeries({ color: '#ff4081', lineWidth: 1, priceLineVisible: false, lastValueVisible: false });
                ma3Ref.current = chart.addLineSeries({ color: '#bb86fc', lineWidth: 1, priceLineVisible: false, lastValueVisible: false });

                bollUpperRef.current = chart.addLineSeries({ color: 'rgba(187, 134, 252, 0.4)', lineWidth: 1, priceLineVisible: false, lastValueVisible: false });
                bollMidRef.current = chart.addLineSeries({ color: 'rgba(255, 64, 129, 0.4)', lineWidth: 1, priceLineVisible: false, lastValueVisible: false, lineStyle: 2 });
                bollLowerRef.current = chart.addLineSeries({ color: 'rgba(187, 134, 252, 0.4)', lineWidth: 1, priceLineVisible: false, lastValueVisible: false });
            }
        }

        seriesRef.current = mainSeries;
        chartRef.current = chart;

        const loadData = async (isInitial = false) => {
            try {
                const res = await getCandles(symbol, timeframe, 1000, token);
                if (res && res.data && res.data.candles) {
                    const newCandles = applyTimeShift(res.data.candles);

                    if (isInitial) {
                        lastDataRef.current = newCandles;
                        if (volumeOnly) {
                            const volData = newCandles.map(c => ({
                                time: c.time,
                                value: c.volume,
                                color: c.close >= c.open ? 'rgba(38, 166, 154, 0.5)' : 'rgba(239, 83, 80, 0.5)'
                            }));
                            mainSeries.setData(volData);
                            mavol1Ref.current.setData(calculateSMA(volData, mav1Period));
                            mavol2Ref.current.setData(calculateSMA(volData, mav2Period));
                        } else if (macdOnly) {
                            const { macd, signal, hist } = calculateMACD(newCandles, macdFast, macdSlow, macdSignal);
                            macdLineRef.current.setData(macd);
                            macdSignalRef.current.setData(signal);
                            macdHistRef.current.setData(hist);
                        } else {
                            if (priceType === 'line') {
                                mainSeries.setData(newCandles.map(c => ({ time: c.time, value: c.close })));
                            } else {
                                mainSeries.setData(newCandles);
                            }

                            if (showIndicators) {
                                const maData = newCandles.map(c => ({ time: c.time, value: c.close }));
                                const m1D = calculateEMA(maData, ma1Period);
                                const m2D = calculateEMA(maData, ma2Period);
                                const m3D = calculateEMA(maData, ma3Period);
                                ma1Ref.current.setData(m1D);
                                ma2Ref.current.setData(m2D);
                                ma3Ref.current.setData(m3D);

                                const { upper, mid, lower } = calculateBollingerBands(newCandles, bollPeriod, bollStd);
                                bollUpperRef.current.setData(upper);
                                bollMidRef.current.setData(mid);
                                bollLowerRef.current.setData(lower);
                            }
                        }
                        chart.timeScale().fitContent();
                    } else {
                        // ACTUALIZACIÓN SILENCIOSA (UPDATE) para proteger ZOOM
                        const lastCandle = newCandles[newCandles.length - 1];
                        if (volumeOnly) {
                            mainSeries.update({
                                time: lastCandle.time,
                                value: lastCandle.volume,
                                color: lastCandle.close >= lastCandle.open ? 'rgba(38, 166, 154, 0.5)' : 'rgba(239, 83, 80, 0.5)'
                            });
                        } else if (macdOnly) {
                            const { macd, signal, hist } = calculateMACD(newCandles, macdFast, macdSlow, macdSignal);
                            if (macd.length > 0) {
                                macdLineRef.current.update(macd[macd.length - 1]);
                                macdSignalRef.current.update(signal[signal.length - 1]);
                                macdHistRef.current.update(hist[hist.length - 1]);
                                setMacdValues({
                                    macd: macd[macd.length - 1].value,
                                    signal: signal[signal.length - 1].value,
                                    hist: hist[hist.length - 1].value
                                });
                            }
                        } else {
                            if (priceType === 'line') {
                                mainSeries.update({ time: lastCandle.time, value: lastCandle.close });
                            } else {
                                mainSeries.update(lastCandle);
                            }
                        }
                        lastDataRef.current = newCandles;
                    }

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
                time: applyTimeShiftToPoint(pt.time),
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
                time: applyTimeShiftToPoint(pt.time),
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

        loadData(true); // Initial load with fitContent
        const refreshInterval = setInterval(() => loadData(false), 60000); // Silent update every minute

        const wsUrl = `ws://${window.location.hostname}:3000/api/candles/stream?token=${token}&symbol=${symbol}&timeframe=${timeframe}`;
        const socket = new WebSocket(wsUrl);
        socketRef.current = socket;

        socket.onmessage = (event) => {
            const msg = JSON.parse(event.data);

            // 1. Manejo de Velas (Precios)
            if (msg.time && msg.symbol === symbol) {
                const tfMultipliers = { '1m': 1, '5m': 5, '15m': 15, '30m': 30, '1h': 60, '4h': 240, '1d': 1440 };
                const multiplier = tfMultipliers[timeframe] || 1;
                const intervalSecs = multiplier * 60;
                const shiftedMsg = applyTimeShift([msg])[0];
                const bucketTime = Math.floor(shiftedMsg.time / intervalSecs) * intervalSecs;

                const existingIdx = lastDataRef.current.findIndex(d => d.time === bucketTime);
                if (existingIdx !== -1) {
                    const current = lastDataRef.current[existingIdx];
                    lastDataRef.current[existingIdx] = {
                        ...current,
                        high: Math.max(current.high || current.value, shiftedMsg.high || shiftedMsg.close),
                        low: Math.min(current.low || current.value, shiftedMsg.low || shiftedMsg.close),
                        close: shiftedMsg.close,
                        volume: (current.volume || 0) + (shiftedMsg.volume || 0),
                        time: bucketTime
                    };
                } else if (lastDataRef.current.length > 0) {
                    lastDataRef.current = [...lastDataRef.current, { ...shiftedMsg, time: bucketTime }].slice(-1000);
                }

                const updatedCandle = lastDataRef.current[lastDataRef.current.length - 1];

                if (volumeOnly) {
                    mainSeries.update({
                        time: bucketTime,
                        value: updatedCandle.volume,
                        color: updatedCandle.close >= updatedCandle.open ? 'rgba(38, 166, 154, 0.5)' : 'rgba(239, 83, 80, 0.5)'
                    });
                } else if (macdOnly) {
                    const { macd, signal, hist } = calculateMACD(lastDataRef.current, macdFast, macdSlow, macdSignal);
                    if (macd.length > 0) {
                        macdLineRef.current.update(macd[macd.length - 1]);
                        macdSignalRef.current.update(signal[signal.length - 1]);
                        macdHistRef.current.update(hist[hist.length - 1]);
                        setMacdValues({
                            macd: macd[macd.length - 1].value,
                            signal: signal[signal.length - 1].value,
                            hist: hist[hist.length - 1].value
                        });
                    }
                } else {
                    if (priceType === 'line') {
                        mainSeries.update({ time: bucketTime, value: updatedCandle.close });
                    } else {
                        mainSeries.update({
                            time: bucketTime,
                            open: updatedCandle.open,
                            high: updatedCandle.high,
                            low: updatedCandle.low,
                            close: updatedCandle.close
                        });
                    }

                    if (showIndicators) {
                        const maData = lastDataRef.current.map(c => ({ time: c.time, value: c.close }));
                        const m1 = calculateEMA(maData, ma1Period);
                        const m2 = calculateEMA(maData, ma2Period);
                        const m3 = calculateEMA(maData, ma3Period);
                        if (m1.length > 0) ma1Ref.current.update(m1[m1.length - 1]);
                        if (m2.length > 0) ma2Ref.current.update(m2[m2.length - 1]);
                        if (m3.length > 0) ma3Ref.current.update(m3[m3.length - 1]);

                        const { upper, mid, lower } = calculateBollingerBands(lastDataRef.current, bollPeriod, bollStd);
                        if (upper.length > 0) bollUpperRef.current.update(upper[upper.length - 1]);
                        if (mid.length > 0) bollMidRef.current.update(mid[mid.length - 1]);
                        if (lower.length > 0) bollLowerRef.current.update(lower[lower.length - 1]);
                    }
                }
            }

            // 2. Manejo de Patrones Detectados
            if (msg.type === 'PATTERN_DETECTION' && msg.symbol === symbol && !volumeOnly && !macdOnly) {
                drawPattern(msg.data);
                onPattern(msg);
            }
        };

        const handleResize = () => {
            if (chartContainerRef.current && chartRef.current) {
                chartRef.current.applyOptions({
                    width: chartContainerRef.current.clientWidth,
                    height: chartContainerRef.current.clientHeight
                });
            }
        };
        window.addEventListener('resize', handleResize);

        return () => {
            window.removeEventListener('resize', handleResize);
            clearInterval(refreshInterval);
            socket.close();
            chart.remove();
        };
    }, [symbol, timeframe, token, volumeOnly, macdOnly, mav1Period, mav2Period, macdFast, macdSlow, macdSignal, showIndicators]);

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
        } else {
            localStorage.setItem('boosis_ma1', ma1Period);
            localStorage.setItem('boosis_ma2', ma2Period);
            localStorage.setItem('boosis_ma3', ma3Period);
            localStorage.setItem('boosis_boll_period', bollPeriod);
            localStorage.setItem('boosis_boll_std', bollStd);
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
        } else {
            setMa1Period(7);
            setMa2Period(25);
            setMa3Period(99);
            setBollPeriod(20);
            setBollStd(2);
        }
    };

    return (
        <div className={`vision-chart-card ${mode !== 'price' ? 'special-mode' : ''}`}>
            <div className="card-header binance-style">
                <div className="left-controls" ref={settingsRef}>
                    {(!volumeOnly && !macdOnly && onSymbolChange) ? (
                        <div className="compact-header-container">
                            <div className="header-top-row">
                                <select
                                    value={symbol}
                                    onChange={(e) => handleSymbolChange(e.target.value)}
                                    className="symbol-selector"
                                >
                                    {availablePairs.map(p => <option key={p} value={p}>{p}</option>)}
                                </select>
                                <div className="timeframe-selector">
                                    {['1m', '5m', '15m', '1h', '4h', '1d'].map(tf => (
                                        <button
                                            key={tf}
                                            className={`tf-btn ${timeframe === tf ? 'active' : ''}`}
                                            onClick={() => handleTimeframeChange(tf)}
                                        >
                                            {tf}
                                        </button>
                                    ))}
                                </div>
                                {showIndicators && (
                                    <button className="settings-btn" onClick={() => setShowSettings(!showSettings)}>⚙️</button>
                                )}
                            </div>
                            {showIndicators && (
                                <div className="header-bottom-row indicator-badges">
                                    <span className="m-val-label" style={{ color: '#f0b90b' }}>MA{ma1Period} <span className="val">{formatVal(maValues.ma1)}</span></span>
                                    <span className="m-val-label" style={{ color: '#ff4081' }}>MA{ma2Period} <span className="val">{formatVal(maValues.ma2)}</span></span>
                                    <span className="m-val-label" style={{ color: '#bb86fc' }}>MA{ma3Period} <span className="val">{formatVal(maValues.ma3)}</span></span>
                                    <span className="m-val-label boll-group">
                                        <span style={{ color: 'rgba(187, 134, 252, 0.8)' }}>B{bollPeriod}</span>
                                        <span style={{ color: '#bb86fc', marginLeft: '4px' }}>U:{formatVal(bollValues.upper)}</span>
                                        <span style={{ color: '#ff4081', marginLeft: '4px' }}>M:{formatVal(bollValues.mid)}</span>
                                        <span style={{ color: '#bb86fc', marginLeft: '4px' }}>D:{formatVal(bollValues.lower)}</span>
                                    </span>
                                </div>
                            )}

                            {showSettings && (
                                <div className="volume-settings-popover">
                                    <div className="settings-fields">
                                        <div className="setting-item">
                                            <label>MA 1:</label>
                                            <input type="number" value={ma1Period} onChange={(e) => setMa1Period(Number(e.target.value))} min="2" max="200" />
                                        </div>
                                        <div className="setting-item">
                                            <label>MA 2:</label>
                                            <input type="number" value={ma2Period} onChange={(e) => setMa2Period(Number(e.target.value))} min="2" max="200" />
                                        </div>
                                        <div className="setting-item">
                                            <label>MA 3:</label>
                                            <input type="number" value={ma3Period} onChange={(e) => setMa3Period(Number(e.target.value))} min="2" max="200" />
                                        </div>
                                        <div className="setting-item">
                                            <label>BOLL Período:</label>
                                            <input type="number" value={bollPeriod} onChange={(e) => setBollPeriod(Number(e.target.value))} min="5" max="100" />
                                        </div>
                                        <div className="setting-item">
                                            <label>BOLL Desv.:</label>
                                            <input type="number" value={bollStd} onChange={(e) => setBollStd(Number(e.target.value))} min="1" max="5" />
                                        </div>
                                    </div>
                                    <div className="settings-actions">
                                        <button className="reset-btn" onClick={handleResetSettings}>Reiniciar</button>
                                        <button className="save-btn" onClick={handleSaveSettings}>Guardar</button>
                                    </div>
                                </div>
                            )}
                        </div>
                    ) : (
                        <div className="compact-header-container">
                            <div className="header-top-row">
                                <span className="symbol-label">{symbol} ({mode.toUpperCase()}) — {timeframe}</span>
                                <button className="settings-btn" onClick={() => setShowSettings(!showSettings)}>⚙️</button>
                            </div>
                            {showIndicators && (
                                <div className="header-bottom-row indicator-badges">
                                    <span className="m-val-label" style={{ color: '#f0b90b' }}>MA{ma1Period} <span className="val">{formatVal(maValues.ma1)}</span></span>
                                    <span className="m-val-label" style={{ color: '#ff4081' }}>MA{ma2Period} <span className="val">{formatVal(maValues.ma2)}</span></span>
                                    <span className="m-val-label" style={{ color: '#bb86fc' }}>MA{ma3Period} <span className="val">{formatVal(maValues.ma3)}</span></span>
                                    <span className="m-val-label boll-group">
                                        <span style={{ color: 'rgba(187, 134, 252, 0.8)' }}>B{bollPeriod}</span>
                                        <span style={{ color: '#bb86fc', marginLeft: '4px' }}>U:{formatVal(bollValues.upper)}</span>
                                        <span style={{ color: '#ff4081', marginLeft: '4px' }}>M:{formatVal(bollValues.mid)}</span>
                                        <span style={{ color: '#bb86fc', marginLeft: '4px' }}>D:{formatVal(bollValues.lower)}</span>
                                    </span>
                                </div>
                            )}
                            {volumeOnly && (
                                <div className="header-bottom-row indicator-badges">
                                    <span className="m-badge c1">MA{mav1Period}</span>
                                    <span className="m-badge c2">MA{mav2Period}</span>
                                </div>
                            )}
                            {macdOnly && (
                                <div className="header-bottom-row indicator-badges">
                                    <span className="m-badge c1">MACD({macdFast},{macdSlow},{macdSignal})</span>
                                    <span className="m-val" style={{ color: '#bb86fc' }}>{macdValues.macd.toFixed(4)}</span>
                                    <span className="m-val" style={{ color: '#ff4081' }}>{macdValues.signal.toFixed(4)}</span>
                                    <span className="m-val" style={{ color: macdValues.hist >= 0 ? '#26a69a' : '#ef5350' }}>{macdValues.hist.toFixed(4)}</span>
                                </div>
                            )}

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
                                        ) : macdOnly ? (
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
                                        ) : (
                                            <>
                                                <div className="setting-item">
                                                    <label>MA 1:</label>
                                                    <input type="number" value={ma1Period} onChange={(e) => setMa1Period(Number(e.target.value))} min="2" max="200" />
                                                </div>
                                                <div className="setting-item">
                                                    <label>MA 2:</label>
                                                    <input type="number" value={ma2Period} onChange={(e) => setMa2Period(Number(e.target.value))} min="2" max="200" />
                                                </div>
                                                <div className="setting-item">
                                                    <label>MA 3:</label>
                                                    <input type="number" value={ma3Period} onChange={(e) => setMa3Period(Number(e.target.value))} min="2" max="200" />
                                                </div>
                                                <div className="setting-item">
                                                    <label>BOLL Período:</label>
                                                    <input type="number" value={bollPeriod} onChange={(e) => setBollPeriod(Number(e.target.value))} min="5" max="100" />
                                                </div>
                                                <div className="setting-item">
                                                    <label>BOLL Desv.:</label>
                                                    <input type="number" value={bollStd} onChange={(e) => setBollStd(Number(e.target.value))} min="1" max="5" />
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
            </div>
            <div ref={chartContainerRef} className="mini-chart" />
        </div>
    );
};

const PatternVision = ({ token }) => {
    const navigate = useNavigate();
    const location = useLocation();
    const [detections, setDetections] = useState({});
    const [focusSymbol, setFocusSymbol] = useState(() => localStorage.getItem('vision_symbol') || 'FETUSDT');
    const [focusTimeframe, setFocusTimeframe] = useState(() => localStorage.getItem('vision_tf') || '1h');

    // Persistir cambios
    useEffect(() => {
        localStorage.setItem('vision_symbol', focusSymbol);
    }, [focusSymbol]);

    useEffect(() => {
        localStorage.setItem('vision_tf', focusTimeframe);
    }, [focusTimeframe]);

    const handleNewPattern = (msg) => {
        setDetections(prev => ({ ...prev, [msg.symbol]: msg }));
    };

    const isActive = (path) => location.pathname === path;

    return (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
            <main className="vision-main-content">
                <div className="vision-grid">
                    {/* TOP LEFT (1): Main Focus Chart */}
                    <VisionChart
                        mode="price"
                        initialSymbol="FETUSDT"
                        token={token}
                        onPattern={handleNewPattern}
                        onSymbolChange={(s) => setFocusSymbol(s)}
                        onTimeframeChange={(tf) => setFocusTimeframe(tf)}
                        symbol={focusSymbol}
                        timeframe={focusTimeframe}
                        showIndicators={false}
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

                    {/* BOTTOM RIGHT (4): Macro Price View (Sync with Panel 1) */}
                    <VisionChart
                        mode="price"
                        priceType="line"
                        showIndicators={true}
                        symbol={focusSymbol}
                        timeframe={focusTimeframe}
                        token={token}
                        onPattern={handleNewPattern}
                    />
                </div>
            </main>
        </div>
    );
};

export default PatternVision;
