import React from 'react';
import './Charts.css';

export default function IndicatorConfig({ selected, onApply, showVolume, onVolumeToggle }) {
  const indicators = ['SMA200', 'EMA12', 'EMA26'];

  const handleToggle = (indicator) => {
    const newSelected = selected.includes(indicator)
      ? selected.filter((ind) => ind !== indicator)
      : [...selected, indicator];
    onApply(newSelected);
  };

  return (
    <div className="indicator-config">
      <div className="indicators-list">
        {indicators.map((ind) => (
          <label key={ind} className="indicator-checkbox">
            <input
              type="checkbox"
              checked={selected.includes(ind)}
              onChange={() => handleToggle(ind)}
            />
            <span>{ind}</span>
          </label>
        ))}
      </div>
      <label className="volume-toggle">
        <input
          type="checkbox"
          checked={showVolume}
          onChange={(e) => onVolumeToggle(e.target.checked)}
        />
        <span>Volume</span>
      </label>
    </div>
  );
}
