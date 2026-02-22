import React, { useEffect, useRef, useState } from 'react';
import { createChart } from 'lightweight-charts';
import axios from 'axios';
import TimeframeSelector from './TimeframeSelector';
import IndicatorConfig from './IndicatorConfig';
import OhlcDetails from './OhlcDetails';
import './Charts.css';

export default function CandlestickChart({ symbol = 'BTCUSDT', token, height = 400, mini = false }) {
  const containerRef = useRef(null);
  const chartRef = useRef(null);
  const candleSeriesRef = useRef(null);
  const smaSeriesRef = useRef(null);
  const ema12SeriesRef = useRef(null);
  const ema26SeriesRef = useRef(null);
  const volumeSeriesRef = useRef(null);
  const wsRef = useRef(null);

  const [timeframe, setTimeframe] = useState('1m');
  const [indicators, setIndicators] = useState(['SMA200']);
  const [showVolume, setShowVolume] = useState(!mini);
  const [selectedCandle, setSelectedCandle] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Fetch candles from backend
  const fetchCandles = async (tf) => {
    try {
      setLoading(true);
      setError(null);
      const response = await axios.get(`/api/candles`, {
        params: {
          symbol,
          timeframe: tf,
          limit: 500,
        },
        headers: { Authorization: `Bearer ${token}` },
      });

      const { candles } = response.data;
      if (!Array.isArray(candles) || candles.length === 0) {
        throw new Error('No candles data received');
      }

      updateChart(candles, tf);
      setLoading(false);
    } catch (err) {
      console.error('Error fetching candles:', err);
      setError(err.message || 'Failed to load candles');
      setLoading(false);
    }
  };

  // Calculate SMA
  const calculateSMA = (candles, period) => {
    const smaData = [];
    for (let i = 0; i < candles.length; i++) {
      if (i < period - 1) continue;
      const sum = candles.slice(i - period + 1, i + 1).reduce((acc, c) => acc + c.close, 0);
      const sma = sum / period;
      smaData.push({
        time: candles[i].time,
        value: sma,
      });
    }
    return smaData;
  };

  // Update chart with candles
  const updateChart = (candles, tf) => {
    if (!candleSeriesRef.current || !chartRef.current) return;

    // Update candlestick series
    candleSeriesRef.current.setData(candles);

    // Update SMA if enabled
    if (indicators.includes('SMA200')) {
      const smaData = calculateSMA(candles, 200);
      if (smaSeriesRef.current && smaData.length > 0) {
        smaSeriesRef.current.setData(smaData);
      }
    }

    // Update volume series if enabled
    if (showVolume && volumeSeriesRef.current) {
      const volumeData = candles.map((c) => ({
        time: c.time,
        value: c.volume,
        color: c.close >= c.open ? 'rgba(0, 255, 136, 0.2)' : 'rgba(255, 0, 100, 0.2)',
      }));
      volumeSeriesRef.current.setData(volumeData);
    }

    // Fit content
    chartRef.current.timeScale().fitContent();
  };

  // Initialize chart
  useEffect(() => {
    if (!containerRef.current || chartRef.current) return;

    const chart = createChart(containerRef.current, {
      layout: {
        background: { color: 'transparent' },
        textColor: '#94a3b8',
        fontSize: 11,
        fontFamily: 'JetBrains Mono, monospace',
      },
      grid: {
        vertLines: { color: 'rgba(255,255,255,0.03)' },
        horzLines: { color: 'rgba(255,255,255,0.03)' },
      },
      width: containerRef.current.clientWidth || 300,
      height: mini ? 150 : height,
      timeScale: {
        timeVisible: true,
        borderColor: 'rgba(255,255,255,0.08)',
        barSpacing: mini ? 4 : 10,
      },
      rightPriceScale: {
        borderColor: 'rgba(255,255,255,0.08)',
        visible: !mini,
        autoScale: true,
        scaleMargins: {
          top: 0.1,
          bottom: 0.25,
        },
      },
      handleScroll: !mini,
      handleScale: !mini,
      crosshair: {
        mode: 0,
        vertLine: {
          color: '#00e5ff',
          width: 1,
          style: 1,
          labelBackgroundColor: '#00e5ff',
        },
        horzLine: {
          color: '#00e5ff',
          width: 1,
          style: 1,
          labelBackgroundColor: '#00e5ff',
        },
      },
    });

    // Configurar la escala izquierda para el volumen (invisible)
    chart.priceScale('left').applyOptions({
      scaleMargins: {
        top: 0.7, // Volumen en el 30% inferior
        bottom: 0,
      },
      visible: false,
    });

    chartRef.current = chart;

    // Create candlestick series con colores Binance
    const candleSeries = chart.addCandlestickSeries({
      upColor: '#2ebd85',
      downColor: '#f6465d',
      borderUpColor: '#2ebd85',
      borderDownColor: '#f6465d',
      wickUpColor: '#2ebd85',
      wickDownColor: '#f6465d',
    });
    candleSeriesRef.current = candleSeries;

    // SMA200 (Amarillo)
    smaSeriesRef.current = chart.addLineSeries({
      color: '#F0B90B',
      lineWidth: 1,
      title: 'MA200',
      visible: indicators.includes('SMA200'),
    });

    // EMA12 (Azul/Cian)
    ema12SeriesRef.current = chart.addLineSeries({
      color: '#00f2ff',
      lineWidth: 1,
      title: 'EMA12',
      visible: indicators.includes('EMA12'),
    });

    // EMA26 (Púrpura)
    ema26SeriesRef.current = chart.addLineSeries({
      color: '#e600ff',
      lineWidth: 1,
      title: 'EMA26',
      visible: indicators.includes('EMA26'),
    });

    // Volumen en escala separada (usando la izquierda invisible)
    if (showVolume) {
      const volumeSeries = chart.addHistogramSeries({
        priceScaleId: 'left',
        priceFormat: { type: 'volume' },
      });
      volumeSeriesRef.current = volumeSeries;
    }

    // Handle window resize
    const handleResize = () => {
      if (containerRef.current && chartRef.current) {
        chartRef.current.applyOptions({
          width: containerRef.current.clientWidth,
        });
      }
    };

    window.addEventListener('resize', handleResize);

    // Initial fetch if token exists
    if (token) {
      fetchCandles(timeframe);
    }

    return () => {
      window.removeEventListener('resize', handleResize);
      if (wsRef.current) wsRef.current.close();
      chart.remove();
      chartRef.current = null;
    };
  }, [height, mini, token]); // Re-run if token appears or size changes

  // Subscribe to WebSocket for live updates
  const subscribeToLiveData = () => {
    try {
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const host = window.location.hostname === 'localhost' ? 'localhost:3000' : window.location.host;
      const wsUrl = `${protocol}//${host}/api/candles/stream?symbol=${symbol}&token=${token}`;
      const ws = new WebSocket(wsUrl);

      ws.onopen = () => {
        console.log(`WebSocket connected for ${symbol}`);
      };

      ws.onmessage = (event) => {
        try {
          const newCandle = JSON.parse(event.data);
          if (candleSeriesRef.current) {
            candleSeriesRef.current.update(newCandle);
          }
        } catch (err) {
          console.error('Error parsing WebSocket message:', err);
        }
      };

      ws.onerror = (err) => {
        console.error('WebSocket error:', err);
      };

      ws.onclose = () => {
        console.log(`WebSocket closed for ${symbol}`);
      };

      wsRef.current = ws;
    } catch (err) {
      console.error('Error subscribing to live data:', err);
    }
  };

  // Fetch candles when timeframe or symbol changes
  useEffect(() => {
    if (token) {
      fetchCandles(timeframe);
    }
  }, [timeframe, symbol, token]);

  // Update SMA visibility and volume
  useEffect(() => {
    if (smaSeriesRef.current) {
      smaSeriesRef.current.applyOptions({
        visible: indicators.includes('SMA200'),
      });
    }

    if (!showVolume && volumeSeriesRef.current) {
      chartRef.current?.removeSeries(volumeSeriesRef.current);
      volumeSeriesRef.current = null;
    } else if (showVolume && !volumeSeriesRef.current && chartRef.current) {
      const volumeSeries = chartRef.current.addHistogramSeries({
        priceScaleId: 'left',
        priceFormat: { type: 'volume' },
      });
      volumeSeriesRef.current = volumeSeries;
    }
  }, [indicators, showVolume]);

  // Handle timeframe change
  const handleTimeframeChange = (tf) => {
    setTimeframe(tf);
    setSelectedCandle(null);

    // Close WebSocket and resubscribe if needed
    if (wsRef.current) {
      wsRef.current.close();
    }
    if (tf === '1m') {
      subscribeToLiveData();
    }
  };

  return (
    <div className="candlestick-chart" style={{ position: 'relative' }}>
      {!mini && (
        <>
          <TimeframeSelector value={timeframe} onChange={handleTimeframeChange} />
          <IndicatorConfig
            selected={indicators}
            onApply={setIndicators}
            showVolume={showVolume}
            onVolumeToggle={setShowVolume}
          />
        </>
      )}

      {loading && (
        <div style={{
          position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
          display: 'flex', justifyContent: 'center', alignItems: 'center',
          background: 'rgba(10, 14, 39, 0.7)', zIndex: 10, color: '#00ff88', fontSize: '12px'
        }}>
          Cargando datos...
        </div>
      )}

      {error && (
        <div style={{
          position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
          display: 'flex', justifyContent: 'center', alignItems: 'center',
          background: 'rgba(10, 14, 39, 0.9)', zIndex: 11, color: '#ff0064', fontSize: '12px', textAlign: 'center', padding: '10px'
        }}>
          Error: {error}
        </div>
      )}

      <div
        ref={containerRef}
        className="chart-container"
        style={{
          height: mini ? '150px' : `${height}px`,
          width: '100%',
          visibility: (loading && !chartRef.current) ? 'hidden' : 'visible'
        }}
      />

      {!mini && !loading && !error && (
        <div className="chart-controls">
          <button onClick={() => chartRef.current?.timeScale().fitContent()}>
            Reset Zoom
          </button>
        </div>
      )}

      {selectedCandle && (
        <OhlcDetails candle={selectedCandle} onClose={() => setSelectedCandle(null)} />
      )}
    </div>
  );
}
