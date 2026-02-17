
import { useState, useEffect, useRef } from 'react';

export const useLogs = (token) => {
    const [logs, setLogs] = useState([]);
    const [status, setStatus] = useState('connecting'); // connecting | connected | reconnecting | closed
    const esRef = useRef(null);
    const reconnectTimer = useRef(null);
    const attempts = useRef(0);
    const [lastAttempt, setLastAttempt] = useState(null);

    useEffect(() => {
        const connect = () => {
            if (!token) return;
            setStatus('connecting');
            // Close existing before creating
            if (esRef.current) {
                try { esRef.current.close(); } catch (e) {}
                esRef.current = null;
            }

            const url = `/api/logs/stream?token=${token}`;
            const eventSource = new EventSource(url);
            esRef.current = eventSource;

            eventSource.onopen = () => {
                attempts.current = 0;
                setStatus('connected');
                setLastAttempt({ when: Date.now(), ok: true });
                console.info('SSE logs connected');
            };

            eventSource.onmessage = (event) => {
                try {
                    const log = JSON.parse(event.data);
                    setLogs(prev => [log, ...prev].slice(0, 100)); // Keep last 100 logs
                } catch (e) {
                    console.error('Error parsing log:', e);
                }
            };

            eventSource.onerror = (err) => {
                // Try reconnect with backoff
                try { eventSource.close(); } catch (e) {}
                esRef.current = null;
                attempts.current += 1;
                setStatus('reconnecting');
                setLastAttempt({ when: Date.now(), ok: false, message: err?.message || 'SSE error' });
                const delay = Math.min(30000, 1000 * Math.pow(2, Math.min(attempts.current, 6)));
                if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
                reconnectTimer.current = setTimeout(() => connect(), delay);
            };
        };

        connect();

        return () => {
            if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
            if (esRef.current) {
                try { esRef.current.close(); } catch (e) {}
                esRef.current = null;
            }
            setStatus('closed');
        };
    }, [token]);

    return { logs, status, lastAttempt };
};
