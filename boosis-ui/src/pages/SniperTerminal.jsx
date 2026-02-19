
import React, { useState, useEffect, useCallback } from 'react';

const API = (token) => ({
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
});

const PAIRS = [
    { symbol: 'BTCUSDT', label: 'BTC', color: '#F7931A', icon: '₿' },
    { symbol: 'ETHUSDT', label: 'ETH', color: '#627EEA', icon: 'Ξ' },
    { symbol: 'SOLUSDT', label: 'SOL', color: '#9945FF', icon: '◎' },
    { symbol: 'XRPUSDT', label: 'XRP', color: '#00AAE4', icon: '✕' },
];

function fmt(n, d = 2) {
    if (n == null || isNaN(n)) return '—';
    return parseFloat(n).toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
}

function PnLBadge({ value }) {
    const v = parseFloat(value);
    if (isNaN(v)) return <span className="sn-badge sn-badge--neutral">—</span>;
    return (
        <span className={`sn-badge ${v >= 0 ? 'sn-badge--win' : 'sn-badge--loss'}`}>
            {v >= 0 ? '+' : ''}{fmt(v)} USDT
        </span>
    );
}

function RRBar({ rr }) {
    const ratio = parseFloat(rr);
    const pct = Math.min((ratio / 5) * 100, 100);
    const color = ratio >= 2 ? '#00c896' : ratio >= 1 ? '#f0b429' : '#e05555';
    return (
        <div className="sn-rr-bar">
            <div className="sn-rr-track">
                <div className="sn-rr-fill" style={{ width: `${pct}%`, background: color }} />
            </div>
            <span className="sn-rr-label" style={{ color }}>{fmt(rr, 2)}R</span>
        </div>
    );
}

function StatsPanel({ stats }) {
    if (!stats) return <div className="sn-stats-empty">Sin trades registrados aún.</div>;
    const items = [
        { label: 'Total Trades', value: stats.totalTrades, mono: true },
        { label: 'Win Rate', value: `${stats.winRate}%`, color: parseFloat(stats.winRate) >= 50 ? '#00c896' : '#e05555' },
        { label: 'Profit Factor', value: stats.profitFactor, color: parseFloat(stats.profitFactor) >= 1.5 ? '#00c896' : '#f0b429' },
        { label: 'PnL Total', value: `${parseFloat(stats.totalPnl) >= 0 ? '+' : ''}${stats.totalPnl} USDT`, color: parseFloat(stats.totalPnl) >= 0 ? '#00c896' : '#e05555' },
        { label: 'Avg Win', value: `+${stats.avgWin} USDT`, color: '#00c896' },
        { label: 'Avg Loss', value: `-${stats.avgLoss} USDT`, color: '#e05555' },
        { label: 'RR Promedio', value: `${stats.avgRRPlanned}R`, color: '#a78bfa' },
        { label: 'Wins / Losses', value: `${stats.wins} / ${stats.losses}`, mono: true },
    ];
    return (
        <div className="sn-stats-grid">
            {items.map(i => (
                <div key={i.label} className="sn-stat-card">
                    <span className="sn-stat-label">{i.label}</span>
                    <span className="sn-stat-value" style={{ color: i.color, fontVariantNumeric: i.mono ? 'tabular-nums' : undefined }}>
                        {i.value}
                    </span>
                </div>
            ))}
        </div>
    );
}

export default function SniperTerminal({ token }) {
    const [prices, setPrices] = useState({});
    const [orders, setOrders] = useState([]);
    const [stats, setStats] = useState(null);
    const [tab, setTab] = useState('open'); // open | history | stats
    const [selectedPair, setSelectedPair] = useState(PAIRS[0]);
    const [form, setForm] = useState({ action: 'BUY', entryPrice: '', stopLoss: '', target: '', riskUsd: '10', notes: '' });
    const [firing, setFiring] = useState(false);
    const [flash, setFlash] = useState(null);

    // Derived: live RR calculation
    const entry = parseFloat(form.entryPrice);
    const sl = parseFloat(form.stopLoss);
    const tp = parseFloat(form.target);
    const liveRR = (!isNaN(entry) && !isNaN(sl) && !isNaN(tp) && Math.abs(entry - sl) > 0)
        ? Math.abs(tp - entry) / Math.abs(entry - sl)
        : null;
    const liveSize = (!isNaN(entry) && !isNaN(sl) && parseFloat(form.riskUsd) > 0 && Math.abs(entry - sl) > 0)
        ? parseFloat(form.riskUsd) / Math.abs(entry - sl)
        : null;
    const liveSizeUsdt = liveSize != null ? liveSize * entry : null;

    const fetchAll = useCallback(async () => {
        try {
            const [ordersRes, statsRes] = await Promise.all([
                fetch('/api/sniper/orders?limit=100', API(token)).then(r => r.json()),
                fetch('/api/sniper/stats', API(token)).then(r => r.json()),
            ]);
            if (ordersRes.orders) setOrders(ordersRes.orders);
            if (!statsRes.error) setStats(statsRes);
        } catch (e) { console.error(e); }
    }, [token]);

    const fetchPrices = useCallback(async () => {
        try {
            const res = await fetch('/api/status', API(token)).then(r => r.json());
            // Try to get prices from pairManagers via individual status calls
            const priceMap = {};
            await Promise.all(PAIRS.map(async (p) => {
                try {
                    const s = await fetch(`/api/status?symbol=${p.symbol}`, API(token)).then(r => r.json());
                    if (s?.latestCandle?.close) priceMap[p.symbol] = s.latestCandle.close;
                } catch { }
            }));
            setPrices(priceMap);
        } catch { }
    }, [token]);

    useEffect(() => {
        fetchAll();
        fetchPrices();
        const t1 = setInterval(fetchAll, 10000);
        const t2 = setInterval(fetchPrices, 5000);
        return () => { clearInterval(t1); clearInterval(t2); };
    }, [fetchAll, fetchPrices]);

    const handleFillPrice = () => {
        const p = prices[selectedPair.symbol];
        if (p) setForm(f => ({ ...f, entryPrice: p.toFixed(4) }));
    };

    const handleShoot = async () => {
        if (firing) return;
        setFiring(true);
        try {
            const body = {
                symbol: selectedPair.symbol,
                action: form.action,
                entryPrice: parseFloat(form.entryPrice),
                stopLoss: parseFloat(form.stopLoss),
                target: parseFloat(form.target),
                riskUsd: parseFloat(form.riskUsd),
                notes: form.notes,
            };
            const res = await fetch('/api/sniper/shoot', {
                method: 'POST', ...API(token), body: JSON.stringify(body),
            }).then(r => r.json());

            if (res.error) {
                setFlash({ type: 'error', msg: res.error });
            } else {
                setFlash({ type: 'success', msg: `✅ Orden disparada: ${body.action} ${selectedPair.label} @ $${fmt(body.entryPrice)} | RR ${liveRR?.toFixed(2)}R` });
                setForm(f => ({ ...f, entryPrice: '', stopLoss: '', target: '', notes: '' }));
                fetchAll();
            }
        } catch (e) {
            setFlash({ type: 'error', msg: e.message });
        }
        setFiring(false);
        setTimeout(() => setFlash(null), 5000);
    };

    const handleCancel = async (orderId, isActive, exitPrice) => {
        const body = { orderId, exitPrice, reason: 'Manual close' };
        const res = await fetch('/api/sniper/cancel', {
            method: 'POST', ...API(token), body: JSON.stringify(body),
        }).then(r => r.json());
        if (!res.error) {
            setFlash({ type: 'success', msg: `Orden ${isActive ? 'cerrada' : 'cancelada'}` });
            fetchAll();
        }
        setTimeout(() => setFlash(null), 3000);
    };

    const openOrders = orders.filter(o => o.status === 'ACTIVE' || o.status === 'PENDING');
    const closedOrders = orders.filter(o => o.status === 'CLOSED' || o.status === 'CANCELLED');

    return (
        <div className="sn-root">
            <style>{SNIPER_CSS}</style>

            {/* Flash message */}
            {flash && <div className={`sn-flash sn-flash--${flash.type}`}>{flash.msg}</div>}

            <div className="sn-layout">

                {/* ── LEFT: FIRE CONTROL ── */}
                <aside className="sn-fire-panel">
                    <div className="sn-fire-header">
                        <span className="sn-crosshair">⊕</span>
                        <h2>FIRE CONTROL</h2>
                    </div>

                    {/* Pair selector */}
                    <div className="sn-pair-selector">
                        {PAIRS.map(p => (
                            <button
                                key={p.symbol}
                                className={`sn-pair-btn ${selectedPair.symbol === p.symbol ? 'active' : ''}`}
                                style={{ '--pair-color': p.color }}
                                onClick={() => setSelectedPair(p)}
                            >
                                <span className="sn-pair-icon">{p.icon}</span>
                                <span className="sn-pair-label">{p.label}</span>
                                {prices[p.symbol] && (
                                    <span className="sn-pair-price">${fmt(prices[p.symbol], prices[p.symbol] > 100 ? 2 : 4)}</span>
                                )}
                            </button>
                        ))}
                    </div>

                    {/* Action selector */}
                    <div className="sn-action-selector">
                        <button
                            className={`sn-action-btn sn-action-buy ${form.action === 'BUY' ? 'active' : ''}`}
                            onClick={() => setForm(f => ({ ...f, action: 'BUY' }))}
                        >▲ LONG</button>
                        <button
                            className={`sn-action-btn sn-action-sell ${form.action === 'SELL' ? 'active' : ''}`}
                            onClick={() => setForm(f => ({ ...f, action: 'SELL' }))}
                        >▼ SHORT</button>
                    </div>

                    {/* Form fields */}
                    <div className="sn-form">
                        <div className="sn-field">
                            <label>ENTRADA (USDT)</label>
                            <div className="sn-input-row">
                                <input
                                    type="number" step="any"
                                    value={form.entryPrice}
                                    onChange={e => setForm(f => ({ ...f, entryPrice: e.target.value }))}
                                    placeholder={prices[selectedPair.symbol] ? `~${fmt(prices[selectedPair.symbol], 2)}` : 'Precio de entrada'}
                                />
                                <button className="sn-fill-btn" onClick={handleFillPrice} title="Usar precio actual">◎</button>
                            </div>
                        </div>

                        <div className="sn-field">
                            <label>STOP LOSS <span className="sn-field-hint">{form.action === 'BUY' ? '↓ Debajo del soporte' : '↑ Encima de resistencia'}</span></label>
                            <input
                                type="number" step="any"
                                value={form.stopLoss}
                                onChange={e => setForm(f => ({ ...f, stopLoss: e.target.value }))}
                                placeholder="Nivel de invalidación"
                                className="sn-input-sl"
                            />
                        </div>

                        <div className="sn-field">
                            <label>TARGET (TP) <span className="sn-field-hint">Nivel de salida</span></label>
                            <input
                                type="number" step="any"
                                value={form.target}
                                onChange={e => setForm(f => ({ ...f, target: e.target.value }))}
                                placeholder="Objetivo de precio"
                                className="sn-input-tp"
                            />
                        </div>

                        <div className="sn-field">
                            <label>RIESGO (USDT) <span className="sn-field-hint">Cuánto arriesgas</span></label>
                            <div className="sn-risk-options">
                                {['5', '10', '20', '50'].map(v => (
                                    <button
                                        key={v}
                                        className={`sn-risk-chip ${form.riskUsd === v ? 'active' : ''}`}
                                        onClick={() => setForm(f => ({ ...f, riskUsd: v }))}
                                    >${v}</button>
                                ))}
                                <input
                                    type="number" step="1" min="1"
                                    value={form.riskUsd}
                                    onChange={e => setForm(f => ({ ...f, riskUsd: e.target.value }))}
                                    className="sn-risk-custom"
                                />
                            </div>
                        </div>

                        {/* Live RR preview */}
                        {liveRR != null && (
                            <div className="sn-preview">
                                <div className="sn-preview-row">
                                    <span>Risk/Reward</span>
                                    <RRBar rr={liveRR} />
                                </div>
                                <div className="sn-preview-row">
                                    <span>Tamaño posición</span>
                                    <span className="sn-preview-val">{fmt(liveSize, 4)} {selectedPair.label} ≈ ${fmt(liveSizeUsdt)}</span>
                                </div>
                                <div className="sn-preview-row">
                                    <span>Riesgo máximo</span>
                                    <span className="sn-preview-val sn-loss">${form.riskUsd} USDT</span>
                                </div>
                                <div className="sn-preview-row">
                                    <span>Ganancia potencial</span>
                                    <span className="sn-preview-val sn-win">+${fmt(parseFloat(form.riskUsd) * liveRR)} USDT</span>
                                </div>
                            </div>
                        )}

                        <div className="sn-field">
                            <label>NOTAS (opcional)</label>
                            <textarea
                                value={form.notes}
                                onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                                placeholder="Setup visto, confluencias, contexto del trade..."
                                rows={2}
                            />
                        </div>

                        <button
                            className={`sn-shoot-btn ${form.action === 'BUY' ? 'buy' : 'sell'} ${firing ? 'firing' : ''}`}
                            onClick={handleShoot}
                            disabled={!form.entryPrice || !form.stopLoss || !form.target || firing}
                        >
                            {firing ? '⏳ EJECUTANDO...' : `${form.action === 'BUY' ? '▲ LONG' : '▼ SHORT'} ${selectedPair.label}`}
                        </button>

                        {liveRR != null && liveRR < 1.5 && (
                            <div className="sn-warning">⚠️ RR menor a 1.5R — considera ajustar el setup</div>
                        )}
                    </div>
                </aside>

                {/* ── RIGHT: ORDERS + STATS ── */}
                <main className="sn-main">
                    <div className="sn-tabs">
                        <button className={`sn-tab ${tab === 'open' ? 'active' : ''}`} onClick={() => setTab('open')}>
                            ABIERTAS <span className="sn-count">{openOrders.length}</span>
                        </button>
                        <button className={`sn-tab ${tab === 'history' ? 'active' : ''}`} onClick={() => setTab('history')}>
                            HISTORIAL <span className="sn-count">{closedOrders.length}</span>
                        </button>
                        <button className={`sn-tab ${tab === 'stats' ? 'active' : ''}`} onClick={() => setTab('stats')}>
                            MI EDGE
                        </button>
                    </div>

                    {tab === 'open' && (
                        <div className="sn-orders">
                            {openOrders.length === 0 ? (
                                <div className="sn-empty">
                                    <span className="sn-empty-icon">⊕</span>
                                    <p>Sin órdenes activas.<br />Define tu setup y dispara.</p>
                                </div>
                            ) : (
                                openOrders.map(o => (
                                    <OrderCard key={o.id} order={o} onClose={handleCancel} prices={prices} />
                                ))
                            )}
                        </div>
                    )}

                    {tab === 'history' && (
                        <div className="sn-orders">
                            {closedOrders.length === 0 ? (
                                <div className="sn-empty"><span className="sn-empty-icon">📋</span><p>Sin trades cerrados aún.</p></div>
                            ) : (
                                closedOrders.map(o => (
                                    <OrderCard key={o.id} order={o} closed prices={prices} />
                                ))
                            )}
                        </div>
                    )}

                    {tab === 'stats' && (
                        <div className="sn-stats">
                            <div className="sn-stats-header">
                                <h3>Tu Edge — Estadísticas de Trading</h3>
                                <p>Basado en {stats?.totalTrades || 0} trades cerrados</p>
                            </div>
                            <StatsPanel stats={stats} />

                            {stats && stats.totalTrades > 0 && (
                                <div className="sn-by-pair">
                                    <h4>Distribución por par</h4>
                                    <div className="sn-pair-stats">
                                        {PAIRS.map(p => {
                                            const count = stats.bySymbol?.[p.symbol] || 0;
                                            const pct = stats.totalTrades > 0 ? (count / stats.totalTrades * 100).toFixed(0) : 0;
                                            return (
                                                <div key={p.symbol} className="sn-pair-stat">
                                                    <span style={{ color: p.color }}>{p.icon} {p.label}</span>
                                                    <div className="sn-pair-bar-wrap">
                                                        <div className="sn-pair-bar" style={{ width: `${pct}%`, background: p.color }} />
                                                    </div>
                                                    <span>{count} trades ({pct}%)</span>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                            )}
                        </div>
                    )}
                </main>
            </div>
        </div>
    );
}

function OrderCard({ order, onClose, closed, prices }) {
    const pair = PAIRS.find(p => p.symbol === order.symbol) || PAIRS[0];
    const isBuy = order.action === 'BUY';
    const price = prices?.[order.symbol];

    // Progress bar between entry and target
    let progress = null;
    if (!closed && price && order.entry_price && order.target) {
        const range = Math.abs(order.target - order.entry_price);
        const done = isBuy ? price - order.entry_price : order.entry_price - price;
        progress = Math.max(0, Math.min(100, (done / range) * 100));
    }

    return (
        <div className={`sn-order-card ${order.status?.toLowerCase()} ${isBuy ? 'long' : 'short'}`}
            style={{ '--pair-color': pair.color }}>
            <div className="sn-order-head">
                <div className="sn-order-id-row">
                    <span className="sn-order-pair" style={{ color: pair.color }}>{pair.icon} {pair.label}</span>
                    <span className={`sn-direction ${isBuy ? 'buy' : 'sell'}`}>{isBuy ? '▲ LONG' : '▼ SHORT'}</span>
                    <span className={`sn-status-dot sn-status-${order.status?.toLowerCase()}`}>{order.status}</span>
                </div>
                {!closed && price && (
                    <span className="sn-current-price">Precio actual: <strong>${fmt(price, price > 100 ? 2 : 4)}</strong></span>
                )}
            </div>

            <div className="sn-order-levels">
                <div className="sn-level sn-level-entry">
                    <span>Entrada</span><strong>${fmt(order.entry_price, 4)}</strong>
                </div>
                <div className="sn-level sn-level-sl">
                    <span>Stop Loss</span><strong>${fmt(order.stop_loss, 4)}</strong>
                </div>
                <div className="sn-level sn-level-tp">
                    <span>Target</span><strong>${fmt(order.target, 4)}</strong>
                </div>
                <div className="sn-level">
                    <span>RR</span><strong className="sn-rr-text">{fmt(order.rr_ratio, 2)}R</strong>
                </div>
            </div>

            {progress != null && (
                <div className="sn-progress-wrap">
                    <div className="sn-progress-bar">
                        <div className="sn-progress-fill" style={{ width: `${progress}%`, background: pair.color }} />
                    </div>
                    <span className="sn-progress-label">{progress.toFixed(0)}% hacia target</span>
                </div>
            )}

            {order.floating_pnl != null && order.status === 'ACTIVE' && (
                <div className="sn-floating"><PnLBadge value={order.floating_pnl} /> flotante</div>
            )}

            {closed && order.pnl != null && (
                <div className="sn-closed-pnl">
                    <PnLBadge value={order.pnl} />
                    <span className="sn-exit-price">Salida: ${fmt(order.exit_price, 4)}</span>
                </div>
            )}

            {order.notes && <div className="sn-notes">💬 {order.notes}</div>}

            <div className="sn-order-foot">
                <span className="sn-ts">{new Date(order.created_at).toLocaleString()}</span>
                <span className="sn-risk-tag">Riesgo: ${fmt(order.risk_usd)} USDT</span>
                {!closed && onClose && (
                    <button
                        className="sn-close-btn"
                        onClick={() => {
                            const exit = prompt(`Precio de salida para ${pair.label}:`, price?.toFixed(4) || '');
                            if (exit) onClose(order.id, order.status === 'ACTIVE', parseFloat(exit));
                        }}
                    >
                        {order.status === 'ACTIVE' ? 'Cerrar' : 'Cancelar'}
                    </button>
                )}
            </div>
        </div>
    );
}

// ─── CSS ────────────────────────────────────────────────────
const SNIPER_CSS = `
  @import url('https://fonts.googleapis.com/css2?family=Space+Mono:wght@400;700&family=DM+Sans:wght@300;400;500;600&display=swap');

  .sn-root {
    --bg:        #0a0b0e;
    --bg2:       #111318;
    --bg3:       #181b22;
    --border:    #22262f;
    --text:      #e2e8f0;
    --text2:     #8892a4;
    --green:     #00c896;
    --red:       #e05555;
    --yellow:    #f0b429;
    --purple:    #a78bfa;
    --mono:      'Space Mono', monospace;
    --sans:      'DM Sans', sans-serif;
    font-family: var(--sans);
    background:  var(--bg);
    color:       var(--text);
    min-height:  100vh;
    padding:     1.5rem;
    position:    relative;
  }

  .sn-layout {
    display: grid;
    grid-template-columns: 340px 1fr;
    gap: 1.5rem;
    max-width: 1400px;
    margin: 0 auto;
  }

  /* ── FLASH ── */
  .sn-flash {
    position: fixed; top: 80px; right: 1.5rem; z-index: 999;
    padding: .75rem 1.25rem; border-radius: 8px;
    font-size: .875rem; font-weight: 500;
    animation: slideIn .2s ease;
  }
  .sn-flash--success { background: #0d3326; border: 1px solid var(--green); color: var(--green); }
  .sn-flash--error   { background: #2d1212; border: 1px solid var(--red);   color: var(--red);   }
  @keyframes slideIn { from { opacity:0; transform:translateX(20px); } to { opacity:1; transform:none; } }

  /* ── FIRE PANEL ── */
  .sn-fire-panel {
    background: var(--bg2);
    border: 1px solid var(--border);
    border-radius: 12px;
    padding: 1.5rem;
    height: fit-content;
    position: sticky;
    top: 1.5rem;
  }
  .sn-fire-header {
    display: flex; align-items: center; gap: .75rem;
    margin-bottom: 1.5rem;
  }
  .sn-crosshair { font-size: 1.5rem; color: var(--red); line-height: 1; }
  .sn-fire-header h2 {
    font-family: var(--mono); font-size: .875rem; letter-spacing: .15em;
    color: var(--text2); margin: 0;
  }

  /* ── PAIR SELECTOR ── */
  .sn-pair-selector {
    display: grid; grid-template-columns: 1fr 1fr; gap: .5rem;
    margin-bottom: 1.25rem;
  }
  .sn-pair-btn {
    background: var(--bg3); border: 1px solid var(--border); border-radius: 8px;
    padding: .6rem .75rem; cursor: pointer; text-align: left;
    transition: all .15s; display: flex; flex-direction: column; gap: 2px;
  }
  .sn-pair-btn:hover   { border-color: var(--pair-color); background: color-mix(in srgb, var(--pair-color) 8%, var(--bg3)); }
  .sn-pair-btn.active  { border-color: var(--pair-color); background: color-mix(in srgb, var(--pair-color) 15%, var(--bg3)); }
  .sn-pair-icon  { font-size: 1rem; color: var(--pair-color); }
  .sn-pair-label { font-size: .75rem; font-weight: 600; color: var(--text); }
  .sn-pair-price { font-family: var(--mono); font-size: .65rem; color: var(--text2); }

  /* ── ACTION ── */
  .sn-action-selector { display: grid; grid-template-columns: 1fr 1fr; gap: .5rem; margin-bottom: 1.25rem; }
  .sn-action-btn {
    padding: .6rem; border: 1px solid var(--border); border-radius: 8px;
    background: var(--bg3); cursor: pointer; font-family: var(--mono);
    font-size: .75rem; font-weight: 700; letter-spacing: .05em; transition: all .15s;
    color: var(--text2);
  }
  .sn-action-buy.active  { background: #0d3326; border-color: var(--green); color: var(--green); }
  .sn-action-sell.active { background: #2d1212; border-color: var(--red);   color: var(--red);   }
  .sn-action-buy:hover   { border-color: var(--green); }
  .sn-action-sell:hover  { border-color: var(--red);   }

  /* ── FORM ── */
  .sn-form { display: flex; flex-direction: column; gap: 1rem; }
  .sn-field { display: flex; flex-direction: column; gap: .35rem; }
  .sn-field label {
    font-size: .7rem; font-weight: 600; letter-spacing: .1em;
    color: var(--text2); display: flex; justify-content: space-between;
  }
  .sn-field-hint { font-weight: 400; letter-spacing: 0; text-transform: none; color: #5a6474; }
  .sn-form input, .sn-form textarea {
    background: var(--bg3); border: 1px solid var(--border); border-radius: 8px;
    color: var(--text); padding: .6rem .75rem;
    font-family: var(--mono); font-size: .8rem;
    transition: border .15s; width: 100%; box-sizing: border-box;
  }
  .sn-form input:focus, .sn-form textarea:focus { outline: none; border-color: #3a3f4c; }
  .sn-input-sl:focus { border-color: var(--red) !important; }
  .sn-input-tp:focus { border-color: var(--green) !important; }
  .sn-input-row { display: flex; gap: .5rem; }
  .sn-input-row input { flex: 1; }
  .sn-fill-btn {
    background: var(--bg3); border: 1px solid var(--border); border-radius: 8px;
    color: var(--text2); cursor: pointer; padding: 0 .75rem; font-size: .9rem;
    transition: all .15s;
  }
  .sn-fill-btn:hover { border-color: var(--purple); color: var(--purple); }

  /* ── RISK CHIPS ── */
  .sn-risk-options { display: flex; gap: .4rem; align-items: center; flex-wrap: wrap; }
  .sn-risk-chip {
    background: var(--bg3); border: 1px solid var(--border); border-radius: 6px;
    padding: .35rem .6rem; font-size: .75rem; cursor: pointer; font-family: var(--mono);
    color: var(--text2); transition: all .15s;
  }
  .sn-risk-chip.active { background: #1a1230; border-color: var(--purple); color: var(--purple); }
  .sn-risk-chip:hover  { border-color: var(--purple); }
  .sn-risk-custom { width: 70px !important; flex-shrink: 0; }

  /* ── LIVE PREVIEW ── */
  .sn-preview {
    background: var(--bg3); border: 1px solid var(--border);
    border-radius: 8px; padding: 1rem; display: flex; flex-direction: column; gap: .5rem;
  }
  .sn-preview-row { display: flex; justify-content: space-between; align-items: center; font-size: .8rem; }
  .sn-preview-row > span:first-child { color: var(--text2); }
  .sn-preview-val { font-family: var(--mono); font-size: .8rem; color: var(--text); }
  .sn-win  { color: var(--green) !important; }
  .sn-loss { color: var(--red) !important; }

  /* ── RR BAR ── */
  .sn-rr-bar { display: flex; align-items: center; gap: .5rem; }
  .sn-rr-track { flex: 1; height: 4px; background: var(--border); border-radius: 2px; overflow: hidden; }
  .sn-rr-fill  { height: 100%; border-radius: 2px; transition: width .3s; }
  .sn-rr-label { font-family: var(--mono); font-size: .75rem; font-weight: 700; min-width: 32px; text-align: right; }

  /* ── SHOOT BUTTON ── */
  .sn-shoot-btn {
    padding: .9rem; border-radius: 10px; border: none; cursor: pointer;
    font-family: var(--mono); font-size: .85rem; font-weight: 700; letter-spacing: .1em;
    transition: all .2s; width: 100%; margin-top: .25rem;
  }
  .sn-shoot-btn.buy  { background: var(--green); color: #001a11; }
  .sn-shoot-btn.sell { background: var(--red);   color: #fff; }
  .sn-shoot-btn:hover:not(:disabled)  { filter: brightness(1.15); transform: translateY(-1px); }
  .sn-shoot-btn:disabled { opacity: .5; cursor: not-allowed; transform: none; }
  .sn-shoot-btn.firing { opacity: .7; }

  .sn-warning {
    background: #2a1f00; border: 1px solid var(--yellow); border-radius: 8px;
    padding: .6rem .75rem; font-size: .75rem; color: var(--yellow);
  }

  /* ── MAIN / TABS ── */
  .sn-main { display: flex; flex-direction: column; gap: 1.25rem; }
  .sn-tabs { display: flex; gap: .25rem; background: var(--bg2); border: 1px solid var(--border); border-radius: 10px; padding: .25rem; width: fit-content; }
  .sn-tab {
    padding: .5rem 1.25rem; border-radius: 8px; border: none; background: transparent;
    color: var(--text2); cursor: pointer; font-family: var(--mono); font-size: .75rem;
    font-weight: 700; letter-spacing: .08em; transition: all .15s; display: flex; align-items: center; gap: .4rem;
  }
  .sn-tab.active { background: var(--bg3); color: var(--text); }
  .sn-count { background: var(--border); border-radius: 12px; padding: .1rem .4rem; font-size: .65rem; }

  /* ── ORDERS ── */
  .sn-orders { display: flex; flex-direction: column; gap: .75rem; }
  .sn-empty  { text-align: center; padding: 4rem 2rem; color: var(--text2); }
  .sn-empty-icon { font-size: 2.5rem; display: block; margin-bottom: .75rem; opacity: .3; }
  .sn-empty p { font-size: .875rem; line-height: 1.6; margin: 0; }

  /* ── ORDER CARD ── */
  .sn-order-card {
    background: var(--bg2); border: 1px solid var(--border); border-radius: 12px;
    padding: 1.25rem; border-left: 3px solid var(--pair-color);
    transition: border-color .2s;
  }
  .sn-order-card.long  { --accent: var(--green); }
  .sn-order-card.short { --accent: var(--red);   }

  .sn-order-head { display: flex; flex-direction: column; gap: .35rem; margin-bottom: 1rem; }
  .sn-order-id-row { display: flex; align-items: center; gap: .75rem; flex-wrap: wrap; }
  .sn-order-pair { font-size: 1rem; font-weight: 700; }
  .sn-direction {
    font-family: var(--mono); font-size: .7rem; font-weight: 700; padding: .2rem .5rem;
    border-radius: 4px; letter-spacing: .05em;
  }
  .sn-direction.buy  { background: #0d3326; color: var(--green); }
  .sn-direction.sell { background: #2d1212; color: var(--red);   }
  .sn-status-dot {
    margin-left: auto; font-size: .65rem; font-weight: 700; letter-spacing: .1em;
    font-family: var(--mono); padding: .15rem .5rem; border-radius: 4px;
  }
  .sn-status-active    { background: #0d3326; color: var(--green); }
  .sn-status-pending   { background: #1a1230; color: var(--purple); }
  .sn-status-closed    { background: #1a1a1a; color: var(--text2); }
  .sn-status-cancelled { background: #1a1a1a; color: var(--text2); opacity: .6; }
  .sn-current-price { font-size: .8rem; color: var(--text2); font-family: var(--mono); }

  .sn-order-levels {
    display: grid; grid-template-columns: repeat(4, 1fr); gap: .75rem;
    background: var(--bg3); border-radius: 8px; padding: .75rem; margin-bottom: .75rem;
  }
  .sn-level { display: flex; flex-direction: column; gap: .2rem; }
  .sn-level span { font-size: .65rem; color: var(--text2); letter-spacing: .05em; text-transform: uppercase; }
  .sn-level strong { font-family: var(--mono); font-size: .8rem; }
  .sn-level-sl strong { color: var(--red); }
  .sn-level-tp strong { color: var(--green); }
  .sn-rr-text { color: var(--purple); }

  .sn-progress-wrap { display: flex; align-items: center; gap: .75rem; margin-bottom: .75rem; }
  .sn-progress-bar  { flex: 1; height: 6px; background: var(--border); border-radius: 3px; overflow: hidden; }
  .sn-progress-fill { height: 100%; border-radius: 3px; transition: width .5s; }
  .sn-progress-label { font-size: .7rem; color: var(--text2); font-family: var(--mono); white-space: nowrap; }

  .sn-floating { font-size: .8rem; margin-bottom: .5rem; display: flex; align-items: center; gap: .5rem; color: var(--text2); }
  .sn-closed-pnl { display: flex; align-items: center; gap: .75rem; margin-bottom: .5rem; }
  .sn-exit-price { font-family: var(--mono); font-size: .75rem; color: var(--text2); }
  .sn-notes {
    font-size: .75rem; color: var(--text2); background: var(--bg3);
    border-radius: 6px; padding: .5rem .75rem; margin-bottom: .5rem; line-height: 1.5;
  }

  .sn-order-foot {
    display: flex; align-items: center; gap: .75rem; flex-wrap: wrap;
    border-top: 1px solid var(--border); padding-top: .75rem; margin-top: .25rem;
  }
  .sn-ts        { font-size: .7rem; color: var(--text2); font-family: var(--mono); }
  .sn-risk-tag  { font-size: .7rem; color: var(--text2); margin-left: auto; font-family: var(--mono); }
  .sn-close-btn {
    background: var(--bg3); border: 1px solid var(--border); border-radius: 6px;
    color: var(--text2); font-size: .75rem; padding: .3rem .75rem; cursor: pointer; transition: all .15s;
  }
  .sn-close-btn:hover { border-color: var(--red); color: var(--red); }

  /* ── BADGES ── */
  .sn-badge { font-family: var(--mono); font-size: .8rem; font-weight: 700; padding: .25rem .6rem; border-radius: 6px; }
  .sn-badge--win     { background: #0d3326; color: var(--green); }
  .sn-badge--loss    { background: #2d1212; color: var(--red);   }
  .sn-badge--neutral { background: var(--bg3); color: var(--text2); }

  /* ── STATS ── */
  .sn-stats { display: flex; flex-direction: column; gap: 1.5rem; }
  .sn-stats-header h3 { margin: 0 0 .25rem; font-size: 1rem; }
  .sn-stats-header p  { margin: 0; font-size: .8rem; color: var(--text2); }
  .sn-stats-empty { text-align: center; padding: 3rem; color: var(--text2); font-size: .875rem; }
  .sn-stats-grid {
    display: grid; grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); gap: 1rem;
  }
  .sn-stat-card {
    background: var(--bg2); border: 1px solid var(--border); border-radius: 10px;
    padding: 1rem; display: flex; flex-direction: column; gap: .35rem;
  }
  .sn-stat-label { font-size: .65rem; text-transform: uppercase; letter-spacing: .1em; color: var(--text2); }
  .sn-stat-value { font-family: var(--mono); font-size: 1.25rem; font-weight: 700; color: var(--text); }

  .sn-by-pair h4 { margin: 0 0 1rem; font-size: .875rem; color: var(--text2); letter-spacing: .05em; text-transform: uppercase; }
  .sn-pair-stats { display: flex; flex-direction: column; gap: .75rem; }
  .sn-pair-stat  { display: grid; grid-template-columns: 80px 1fr 120px; align-items: center; gap: .75rem; font-size: .8rem; }
  .sn-pair-bar-wrap { background: var(--border); border-radius: 3px; height: 6px; overflow: hidden; }
  .sn-pair-bar  { height: 100%; border-radius: 3px; transition: width .5s; min-width: 2px; }

  @media (max-width: 900px) {
    .sn-layout { grid-template-columns: 1fr; }
    .sn-fire-panel { position: static; }
    .sn-order-levels { grid-template-columns: repeat(2, 1fr); }
  }
`;
