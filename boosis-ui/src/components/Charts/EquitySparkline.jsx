import React from 'react';
import { LineChart, Line, ResponsiveContainer, YAxis } from 'recharts';

/**
 * 📉 EquitySparkline - Vista minimalista del rendimiento
 * Diseñado para encajar en el nuevo diseño "Lead Trader"
 */
export default function EquitySparkline({ data, dataKey = 'pnl', color = '#00ff88' }) {
    if (!data || data.length < 2) {
        return <div style={{ height: '60px', opacity: 0.2, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '10px' }}>...</div>;
    }

    const first = data[0][dataKey];
    const last = data[data.length - 1][dataKey];
    const strokeColor = last >= first ? '#00ff88' : '#ff0064';

    return (
        <div style={{ width: '100%', height: '100%', minHeight: '60px' }}>
            <ResponsiveContainer width="100%" height="100%">
                <LineChart data={data}>
                    <YAxis hide domain={['auto', 'auto']} />
                    <Line
                        type="monotone"
                        dataKey={dataKey}
                        stroke={strokeColor}
                        strokeWidth={2}
                        dot={false}
                        animationDuration={500}
                    />
                </LineChart>
            </ResponsiveContainer>
        </div>
    );
}
