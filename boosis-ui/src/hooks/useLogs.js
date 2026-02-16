
import { useState, useEffect } from 'react';

export const useLogs = (token) => {
    const [logs, setLogs] = useState([]);

    useEffect(() => {
        if (token) {
            const eventSource = new EventSource(`/api/logs/stream?token=${token}`);

            eventSource.onmessage = (event) => {
                try {
                    const log = JSON.parse(event.data);
                    setLogs(prev => [log, ...prev].slice(0, 100)); // Keep last 100 logs
                } catch (e) {
                    console.error('Error parsing log:', e);
                }
            };

            eventSource.onerror = (err) => {
                eventSource.close();
            };

            return () => {
                eventSource.close();
            };
        }
    }, [token]);

    return logs;
};
