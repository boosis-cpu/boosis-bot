import React from 'react';
import './Charts.css';

export default function OhlcDetails({ candle, onClose }) {
  if (!candle) return null;

  const formatPrice = (price) => {
    return typeof price === 'number' ? price.toFixed(2) : '—';
  };

  const formatVolume = (volume) => {
    return typeof volume === 'number' ? volume.toLocaleString('es-MX', { maximumFractionDigits: 0 }) : '—';
  };

  return (
    <div className="ohlc-details">
      <div className="ohlc-header">
        <span>OHLCV Details</span>
        <button onClick={onClose}>✕</button>
      </div>
      <div className="ohlc-body">
        <div className="ohlc-row">
          <span className="label">Time:</span>
          <span className="value">{candle.time}</span>
        </div>
        <div className="ohlc-row">
          <span className="label">Open:</span>
          <span className="value">${formatPrice(candle.open)}</span>
        </div>
        <div className="ohlc-row">
          <span className="label">High:</span>
          <span className="value" style={{ color: '#00ff88' }}>${formatPrice(candle.high)}</span>
        </div>
        <div className="ohlc-row">
          <span className="label">Low:</span>
          <span className="value" style={{ color: '#ff0064' }}>${formatPrice(candle.low)}</span>
        </div>
        <div className="ohlc-row">
          <span className="label">Close:</span>
          <span className="value" style={{ color: candle.close >= candle.open ? '#00ff88' : '#ff0064' }}>
            ${formatPrice(candle.close)}
          </span>
        </div>
        <div className="ohlc-row">
          <span className="label">Volume:</span>
          <span className="value">{formatVolume(candle.volume)}</span>
        </div>
      </div>
    </div>
  );
}
