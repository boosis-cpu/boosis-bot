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
      const response = await axios.get(`http://localhost:3000/api/candles`, {
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
    if (!containerRef.current) return;

    const chart = createChart(containerRef.current, {
      layout: {
        background: { color: '#0a0e27' },
        textColor: '#a0aec0',
        fontSize: 12,
      },
      width: containerRef.current.clientWidth,
      height: mini ? 150 : height,
      timeScale: {
        timeVisible: true,
        secondsVisible: false,
        barSpacing: mini ? 4 : 8,
      },
      rightPriceScale: {
        borderColor: '#1a1f3a',
      },
      leftPriceScale: showVolume ? { visible: true, borderColor: '#1a1f3a' } : { visible: false },
      crosshair: {
        mode: 1, // Normal mode
        vertLine: { color: '#1a1f3a', width: 1, style: 2 },
        horzLine: { color: '#1a1f3a', width: 1, style: 2 },
      },
      grid: {
        horzLines: { color: '#1a1f3a' },
        vertLines: { color: '#1a1f3a' },
      },
    });

    chartRef.current = chart;

    // Create candlestick series
    const candleSeries = chart.addCandlestickSeries({
      upColor: '#00ff88',
      downColor: '#ff0064',
      borderUpColor: '#00ff88',
      borderDownColor: '#ff0064',
      wickUpColor: '#00ff88',
      wickDownColor: '#ff0064',
    });
    candleSeriesRef.current = candleSeries;

    // Create SMA line series
    const smaSeries = chart.addLineSeries({
      color: '#ffaa00',
      lineWidth: 2,
      title: 'SMA200',
      visible: indicators.includes('SMA200'),
    });
    smaSeriesRef.current = smaSeries;

    // Create volume histogram
    if (showVolume) {
      const volumeSeries = chart.addHistogramSeries({
        color: 'rgba(0, 255, 136, 0.2)',
        priceFormat: { type: 'volume' },
      });
      volumeSeriesRef.current = volumeSeries;
    }

    // Handle candle click
    chart.subscribeClick((param) => {
      if (param.point && param.seriesData.size > 0) {
        const candleData = param.seriesData.get(candleSeries);
        if (candleData) {
          setSelectedCandle(candleData);
        }
      }
    });

    // Handle window resize
    const handleResize = () => {
      if (containerRef.current) {
        chart.applyOptions({
          width: containerRef.current.clientWidth,
        });
      }
    };

    window.addEventListener('resize', handleResize);

    // Subscribe to WebSocket for live updates (1m only)
    if (timeframe === '1m') {
      subscribeToLiveData();
    }

    return () => {
      window.removeEventListener('resize', handleResize);
      if (wsRef.current) {
        wsRef.current.close();
      }
      chart.remove();
    };
  }, [height, mini, showVolume]);

  // Subscribe to WebSocket for live updates
  const subscribeToLiveData = () => {
    try {
      const wsUrl = `ws://localhost:3000/api/candles/stream?symbol=${symbol}`;
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
    fetchCandles(timeframe);
  }, [timeframe, symbol]);

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
        color: 'rgba(0, 255, 136, 0.2)',
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

  if (mini) {
    return (
      <div className="candlestick-chart">
        {loading && <div className="chart-loading">Loading...</div>}
        {error && <div className="chart-error">Error: {error}</div>}
        {!loading && !error && (
          <div
            ref={containerRef}
            className="chart-container"
            style={{ height: '150px', width: '100%' }}
          />
        )}
      </div>
    );
  }

  return (
    <div className="candlestick-chart">
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

      {loading && <div className="chart-loading">Loading chart data...</div>}
      {error && <div className="chart-error">Error: {error}</div>}

      {!loading && !error && (
        <>
          <div
            ref={containerRef}
            className="chart-container"
            style={{ height: `${height}px`, width: '100%' }}
          />
          <div className="chart-controls">
            <button onClick={() => chartRef.current?.timeScale().fitContent()}>
              Reset Zoom
            </button>
          </div>
        </>
      )}

      {selectedCandle && (
        <OhlcDetails candle={selectedCandle} onClose={() => setSelectedCandle(null)} />
      )}
    </div>
  );
}
