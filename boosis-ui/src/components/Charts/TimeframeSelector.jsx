import React from 'react';
import './Charts.css';

export default function TimeframeSelector({ value, onChange }) {
  const timeframes = ['1m', '5m', '15m', '30m', '1h', '4h', '1d', '1w', '1M'];

  return (
    <div className="timeframe-selector">
      <select value={value} onChange={(e) => onChange(e.target.value)}>
        {timeframes.map((tf) => (
          <option key={tf} value={tf}>
            {tf}
          </option>
        ))}
      </select>
    </div>
  );
}
