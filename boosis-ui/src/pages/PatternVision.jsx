
import React, { useEffect, useRef, useState } from 'react';
import { createChart } from 'lightweight-charts';
import { getCandles } from '../services/api';
import './PatternVision.css';

const VisionChart = ({ symbol, token, onPattern }) => {
    const chartContainerRef = useRef();
    const chartRef = useRef();
    const seriesRef = useRef();
    const patternSeriesRef = useRef();
    const necklineRef = useRef();

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
            height: 300
        });

        const candleSeries = chart.addCandlestickSeries({
            upColor: '#26a69a', downColor: '#ef5350', borderVisible: false,
            wickUpColor: '#26a69a', wickDownColor: '#ef5350',
        });

        seriesRef.current = candleSeries;
        chartRef.current = chart;

        const loadData = async () => {
            try {
                const res = await getCandles(symbol, '4h', 100, token);
                if (res && res.data && res.data.candles) {
                    candleSeries.setData(res.data.candles);
                    chart.timeScale().fitContent();

                    // NEW: Draw pattern from initial load if present
                    if (res.data.pattern) {
                        console.log(`[Init] Pattern found for ${symbol}:`, res.data.pattern);
                        drawPattern(res.data.pattern);
                        onPattern({ symbol, data: res.data.pattern });
                    }
                }
            } catch (e) {
                console.error(`Error loading candles for ${symbol}:`, e);
            }
        };
        loadData();
        const refreshInterval = setInterval(loadData, 30 * 60 * 1000); // Refresh every 30 mins

        const wsUrl = `ws://${window.location.hostname}:3000/api/candles/stream?token=${token}&symbol=${symbol}`;
        const socket = new WebSocket(wsUrl);

        socket.onmessage = (event) => {
            const msg = JSON.parse(event.data);
            if (msg.time && msg.symbol === symbol) candleSeries.update(msg);
            if (msg.type === 'PATTERN_DETECTION' && msg.symbol === symbol) {
                drawPattern(msg.data);
                onPattern(msg);
            }
        };

        const drawPattern = (pattern) => {
            if (!pattern || !pattern.drawingPoints || pattern.drawingPoints.length === 0) return;

            console.log(`[Vision] Drawing ${pattern.type} for ${symbol}`);

            if (patternSeriesRef.current) {
                try { chart.removeSeries(patternSeriesRef.current); } catch (e) { }
            }
            if (necklineRef.current) {
                try { seriesRef.current.removePriceLine(necklineRef.current); } catch (e) { }
            }

            // CRITICAL FIX: Map 'price' to 'value' for the charting library
            const formattedPoints = pattern.drawingPoints.map(pt => ({
                time: pt.time,
                value: pt.price
            }));

            const colors = { BULLISH: '#00ff88', BEARISH: '#ff4d4d' };
            const pSeries = chart.addLineSeries({
                color: colors[pattern.direction] || '#f39c12',
                lineWidth: 4, // More visible
                lastValueVisible: false,
                priceLineVisible: false,
            });

            pSeries.setData(formattedPoints);
            patternSeriesRef.current = pSeries;

            // Markers (T1, T2, LS, etc)
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
                    lineStyle: 1, // Dotted
                    title: 'NECKLINE',
                    axisLabelVisible: true,
                });
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
    }, [symbol, token]);

    return (
        <div className="vision-chart-card">
            <div className="card-header">
                <span className="pair-name">{symbol}</span>
                <span className="tf-badge">4H</span>
            </div>
            <div ref={chartContainerRef} className="mini-chart" />
        </div>
    );
};

const PatternVision = ({ token }) => {
    const [detections, setDetections] = useState({});
    const pairs = ['BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'XRPUSDT'];

    const handleNewPattern = (msg) => {
        setDetections(prev => ({ ...prev, [msg.symbol]: msg }));
    };

    return (
        <div className="pattern-vision-container">
            <div className="vision-header">
                <div className="vision-title">
                    <span className="radar-icon">📡</span>
                    <h2>CORTEX VISION 360 — MULTI-GRID</h2>
                </div>
            </div>

            <div className="vision-grid">
                {pairs.map(p => (
                    <VisionChart key={p} symbol={p} token={token} onPattern={handleNewPattern} />
                ))}
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
