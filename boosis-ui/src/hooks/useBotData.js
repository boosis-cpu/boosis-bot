
import { useState, useEffect, useCallback } from 'react';
import { getStatus, getCandles, getTrades, getHealth, getMetrics } from '../services/api';

export const useBotData = (token) => {
    const [data, setData] = useState({
        bot: 'Loading...',
        balance: { usdt: 0, asset: 0 },
        strategy: '',
        paperTrading: true,
        equityHistory: [],
        realBalance: [],
        marketStatus: { status: 'UNKNOWN', volatility: 0 }
    });
    const [candles, setCandles] = useState([]);
    const [trades, setTrades] = useState([]);
    const [health, setHealth] = useState(null);
    const [metrics, setMetrics] = useState({ profitFactor: '0', winRate: '0%', totalTrades: 0 });
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    const fetchData = useCallback(async () => {
        if (!token) return;

        try {
            // 1. Requerido: Status
            const statusRes = await getStatus();
            setData(statusRes.data);

            // 2. Opcionales
            try {
                const t0 = Date.now();
                const [candlesRes, tradesRes, healthRes, metricsRes] = await Promise.all([
                    getCandles(),
                    getTrades(),
                    getHealth(),
                    getMetrics()
                ]);
                const apiLatency = Date.now() - t0;

                if (candlesRes.data && Array.isArray(candlesRes.data.candles)) {
                    setCandles(candlesRes.data.candles.map(c => ({
                        time: new Date(c.time * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                        close: c.close,
                        open: c.open,
                        high: c.high,
                        low: c.low,
                        volume: c.volume
                    })));
                }
                if (tradesRes.data) setTrades(tradesRes.data);
                if (healthRes.data) setHealth({ ...healthRes.data, latency: { apiLatency } });
                if (metricsRes.data) setMetrics(metricsRes.data);
            } catch (subErr) {
                console.warn('Fallo en datos secundarios:', subErr.message);
            }

            setError(null);
        } catch (err) {
            if (err.response?.status !== 401) {
                setError('Error de conexión con el bot. Reintentando...');
            }
        } finally {
            setLoading(false);
        }
    }, [token]);

    useEffect(() => {
        if (token) {
            fetchData();
            const interval = setInterval(fetchData, 5000);
            return () => clearInterval(interval);
        }
    }, [token, fetchData]);

    return { data, candles, trades, health, metrics, loading, error, refetch: fetchData };
};
