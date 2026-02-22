import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import {
    LayoutDashboard,
    FlaskConical,
    Cpu,
    Crosshair,
    Eye,
    Settings,
    ChevronRight
} from 'lucide-react';

const API = (token) => ({
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
});

const PAIRS = [
    { symbol: 'FETUSDT', label: 'FET', color: '#0050FF', icon: 'F' },
    { symbol: 'RENDERUSDT', label: 'REND', color: '#FF3333', icon: 'R' },
    { symbol: 'TAOUSDT', label: 'TAO', color: '#BB86FC', icon: 'T' },
    { symbol: 'WLDUSDT', label: 'WLD', color: '#FFFFFF', icon: 'W' },
    { symbol: 'NEARUSDT', label: 'NEAR', color: '#00C896', icon: 'N' },
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
    const navigate = useNavigate();
    const location = useLocation();
    const [prices, setPrices] = useState({});
    const [orders, setOrders] = useState([]);
    const [stats, setStats] = useState(null);
    const [tab, setTab] = useState('open'); // open | history | stats
    const [selectedPair, setSelectedPair] = useState(PAIRS[0]);
    const [form, setForm] = useState({ action: 'BUY', entryPrice: '', stopLoss: '', target: '', riskUsd: '10', notes: '' });
    const [firing, setFiring] = useState(false);
    const [flash, setFlash] = useState(null);
    const [balance, setBalance] = useState({ usdt: 0, realUsdt: 0 });
    const [mode, setMode] = useState('PAPER'); // PAPER | LIVE

    const isActive = (path) => location.pathname === path;

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

            // Sync current mode and balance
            if (res.mode) setMode(res.mode);
            setBalance({
                usdt: res.balance?.usdt || 0,
                realUsdt: res.realBalance?.find(b => b.asset === 'USDT')?.free || 0
            });

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
        if (!p) return;

        const isBuy = form.action === 'BUY';
        const entry = p;
        // Sugerir setup 2:1 (2% stop, 4% target)
        const sl = isBuy ? entry * 0.98 : entry * 1.02;
        const tp = isBuy ? entry * 1.04 : entry * 0.96;

        setForm(f => ({
            ...f,
            entryPrice: entry.toFixed(4),
            stopLoss: sl.toFixed(4),
            target: tp.toFixed(4)
        }));
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
                mode: mode // Send current sniper frontend mode
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

    const toggleTradingMode = async () => {
        const nextMode = mode === 'PAPER' ? true : false; // Backend expects literal boolean for 'live'
        try {
            const res = await fetch('/api/settings/trading-mode', {
                method: 'POST',
                ...API(token),
                body: JSON.stringify({ live: nextMode })
            }).then(r => r.json());

            if (res.error) {
                setFlash({ type: 'error', msg: res.error });
            } else {
                setMode(res.mode);
                setFlash({
                    type: 'success',
                    msg: `MODO CAMBIADO: ${res.mode === 'LIVE' ? '💰 REAL ACTIVADO' : '📝 SIMULACIÓN ACTIVADA'}`
                });
                fetchPrices(); // Refresh balances
            }
        } catch (e) {
            setFlash({ type: 'error', msg: 'Error al cambiar modo' });
        }
        setTimeout(() => setFlash(null), 3000);
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
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
            <style>{SNIPER_CSS}</style>

            <div className="sn-main-content" style={{ flex: 1, display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
                {/* Flash message */}
                {flash && <div className={`sn-flash sn-flash--${flash.type}`}>{flash.msg}</div>}

                <div className="sn-layout" style={{ flex: 1, height: '100%' }}>

                    {/* ── LEFT: FIRE CONTROL ── */}
                    <aside className="sn-fire-panel">
                        {/* Pair selector - Compacted */}

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
                                <label>STOP LOSS (INVALIDACIÓN) <span className="sn-field-hint">{form.action === 'BUY' ? '↓ Debajo del soporte' : '↑ Encima de resistencia'}</span></label>
                                <input
                                    type="number" step="any"
                                    value={form.stopLoss}
                                    onChange={e => setForm(f => ({ ...f, stopLoss: e.target.value }))}
                                    placeholder="Precio de Stop"
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
                                <label>
                                    RIESGO (USDT)
                                    <span className="sn-field-hint">
                                        Simulado: <strong style={{ color: mode === 'LIVE' ? '#58a6ff' : '#a371f7' }}>
                                            ${fmt(mode === 'LIVE' ? balance.realUsdt : balance.usdt)}
                                        </strong>
                                    </span>
                                </label>
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
                                <div className="sn-percent-row">
                                    {[1, 2, 5, 10].map(p => (
                                        <button
                                            key={p}
                                            className="sn-pct-btn"
                                            onClick={() => {
                                                const total = mode === 'LIVE' ? balance.realUsdt : balance.usdt;
                                                const risk = (total * (p / 100)).toFixed(0);
                                                setForm(f => ({ ...f, riskUsd: risk }));
                                            }}
                                        >{p}%</button>
                                    ))}
                                    <span style={{ fontSize: '10px', color: 'var(--text2)' }}>del capital</span>
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

  .sn-root-container {
    display: flex;
    flex-direction: row;
    height: 100%;
    background: var(--bg3);
    overflow: hidden;
    --sans: 'Outfit', 'Inter', sans-serif;
    --mono: 'JetBrains Mono', monospace;
    font-family: var(--sans);
  }

  /* ── SIDEBAR (Synced with PatternVision) ── */
  .vision-sidebar {
    width: 54px;
    background: var(--bg2);
    border-right: 1px solid var(--border);
    display: flex;
    flex-direction: column;
    align-items: center;
    padding: 15px 0;
    gap: 12px;
    z-index: 100;
    flex-shrink: 0;
  }

  .sidebar-icon-btn {
    background: transparent;
    border: none;
    color: var(--text2);
    cursor: pointer;
    width: 42px;
    height: 42px;
    border-radius: 0;
    transition: all 0.2s;
    display: flex;
    align-items: center;
    justify-content: center;
    position: relative;
  }

  .sidebar-icon-btn:hover {
    background: rgba(255, 255, 255, 0.05);
    color: var(--text);
  }

  .sidebar-icon-btn.active {
    background: rgba(255, 255, 255, 0.05);
    color: var(--accent);
  }

  .sidebar-icon-btn.active::after {
    content: '';
    position: absolute;
    left: 0;
    width: 3px;
    height: 20px;
    background: var(--accent);
    border-radius: 0;
  }

  .sn-main-content {
    flex: 1;
    display: flex;
    flex-direction: column;
    padding: 0;
    overflow: hidden;
    background: transparent;
  }

  .sn-layout {
    display: grid;
    grid-template-columns: 320px 1fr;
    gap: 1px;
    background: var(--border);
    width: 100%;
    height: 100%;
    flex: 1;
    overflow: hidden;
    margin: 0;
  }

  /* ── TOKENS ── */
  :root {
    --bg2: rgba(2, 6, 23, 0.6);
    --bg3: #020617;
    --border: rgba(255, 255, 255, 0.1);
    --text: #f8fafc;
    --text2: #94a3b8;
    --green: #22c55e;
    --red: #ef4444;
    --yellow: #f59e0b;
    --purple: #8b5cf6;
    --accent: #00e5ff;
  }

  /* ── FLASH ── */
  .sn-flash {
    position: fixed; top: 20px; right: 1.5rem; z-index: 999;
    padding: .75rem 1.25rem; border-radius: 4px;
    font-size: .875rem; font-weight: 500;
    animation: slideIn .2s ease;
    box-shadow: 0 8px 16px rgba(0,0,0,0.4);
    backdrop-filter: blur(10px);
  }
  .sn-flash--success { background: rgba(34, 197, 94, 0.2); border: 1px solid var(--green); color: #fff; }
  .sn-flash--error   { background: rgba(239, 68, 68, 0.2); border: 1px solid var(--red); color: #fff; }
  @keyframes slideIn { from { opacity:0; transform:translateY(-20px); } to { opacity:1; transform:none; } }

  /* ── FIRE PANEL ── */
  .sn-fire-panel {
    background: var(--bg2);
    border: none;
    border-radius: 0;
    padding: 1rem;
    height: 100%;
    overflow-y: auto;
    box-sizing: border-box;
    scrollbar-width: thin;
    scrollbar-color: rgba(255,255,255,0.1) transparent;
  }

  /* ── MAIN PANEL ── */
  .sn-main {
    display: flex;
    flex-direction: column;
    overflow: hidden;
    height: 100%;
    padding: 1rem;
    box-sizing: border-box;
    background: transparent;
  }

  .sn-orders {
    flex: 1;
    overflow-y: auto;
    scrollbar-width: thin;
    scrollbar-color: rgba(255,255,255,0.1) transparent;
    padding-right: 4px;
  }
  .sn-bal-label { font-size: 0.6rem; color: var(--text2); font-weight: 800; letter-spacing: 0.1em; }
  .sn-bal-value { font-family: var(--mono); font-size: 1.25rem; color: var(--accent); font-weight: 800; }
  .sn-mode-toggle {
    display: flex; align-items: center; gap: .5rem;
    padding: .35rem .75rem; border-radius: 4px;
    font-family: var(--mono); font-size: .65rem; font-weight: 700;
    cursor: pointer; transition: all .2s;
    border: 1px solid var(--border);
    background: rgba(2, 6, 23, 0.8);
  }
  .sn-mode-toggle.paper { color: var(--purple); border-color: rgba(139, 92, 246, 0.3); }
  .sn-mode-toggle.live  { color: var(--green); border-color: rgba(34, 197, 94, 0.3); box-shadow: 0 0 10px rgba(34, 197, 94, 0.1); }
  .sn-mode-toggle:hover { background: rgba(255, 255, 255, 0.05); }

  .sn-mode-dot {
    width: 6px; height: 6px; border-radius: 50%;
    background: currentColor;
    box-shadow: 0 0 8px currentColor;
  }
  .sn-mode-toggle.live .sn-mode-dot { animation: pulse 2s infinite; }
  @keyframes pulse { 0% { opacity: 1; } 50% { opacity: 0.4; } 100% { opacity: 1; } }

  /* ── PAIR SELECTOR ── */
  .sn-pair-selector {
    display: grid; grid-template-columns: 1fr 1fr; gap: .5rem;
    margin-bottom: 1.25rem;
  }
  .sn-pair-btn {
    background: rgba(255, 255, 255, 0.02); border: 1px solid var(--border); border-radius: 4px;
    padding: .5rem .7rem; cursor: pointer; text-align: left;
    transition: all .2s; display: flex; flex-direction: column; gap: 4px;
    color: var(--text);
  }
  .sn-pair-btn:hover { border-color: rgba(255, 255, 255, 0.2); background: rgba(255, 255, 255, 0.05); }
  .sn-pair-btn.active { border-color: var(--pair-color); background: rgba(255,255,255,0.1); box-shadow: inset 0 0 10px rgba(0,0,0,0.5); }
  .sn-pair-icon  { font-size: 1.1rem; color: var(--pair-color); }
  .sn-pair-label { font-size: .8rem; font-weight: 700; letter-spacing: 0.05em; }
  .sn-pair-price { font-family: var(--mono); font-size: .65rem; color: var(--text2); }

  /* ── ACTION ── */
  .sn-action-selector { display: grid; grid-template-columns: 1fr 1fr; gap: .5rem; margin-bottom: 1.5rem; }
  .sn-action-btn {
    padding: .75rem; border: 1px solid var(--border); border-radius: 4px;
    background: rgba(255, 255, 255, 0.02); cursor: pointer; font-family: var(--mono);
    font-size: .8rem; font-weight: 800; letter-spacing: .05em; transition: all .2s;
    color: var(--text2);
  }
  .sn-action-buy.active  { background: rgba(34, 197, 94, 0.2); border-color: var(--green); color: var(--green); text-shadow: 0 0 10px rgba(34,197,94,0.5); box-shadow: 0 0 15px rgba(34,197,94,0.2) inset; }
  .sn-action-sell.active { background: rgba(239, 68, 68, 0.2); border-color: var(--red); color: var(--red); text-shadow: 0 0 10px rgba(239,68,68,0.5); box-shadow: 0 0 15px rgba(239,68,68,0.2) inset; }

  /* ── FORM ── */
  .sn-form { display: flex; flex-direction: column; gap: 1rem; }
  .sn-field { display: flex; flex-direction: column; gap: .5rem; }
  .sn-field label {
    font-size: .75rem; font-weight: 700; letter-spacing: .1em;
    color: var(--text2); display: flex; justify-content: space-between;
  }
  .sn-field-hint { font-weight: 400; letter-spacing: 0; text-transform: none; color: rgba(255, 255, 255, 0.3); }
  .sn-form input, .sn-form textarea {
    background: rgba(2, 6, 23, 0.8); border: 1px solid var(--border); border-radius: 4px;
    color: var(--text); padding: .6rem .75rem;
    font-family: var(--mono); font-size: .9rem;
    transition: all .2s; width: 100%; box-sizing: border-box;
  }
  .sn-form input:focus { border-color: var(--accent); outline: none; box-shadow: 0 0 0 2px rgba(0, 229, 255, 0.2); }
  .sn-fill-btn {
    background: rgba(255, 255, 255, 0.05); border: 1px solid var(--border); border-radius: 0;
    color: var(--text2); cursor: pointer; padding: 0 1rem; font-size: 1rem; transition: all 0.2s;
  }
  .sn-fill-btn:hover { color: var(--accent); border-color: var(--accent); background: rgba(0, 229, 255, 0.1); }

  .sn-percent-row { display: flex; gap: .5rem; align-items: center; margin-top: .5rem; }
  .sn-pct-btn {
    background: transparent; border: 1px solid rgba(255, 255, 255, 0.1); border-radius: 0;
    color: var(--text2); font-size: 11px; padding: 4px 8px; cursor: pointer;
    font-family: var(--mono); transition: all 0.2s;
  }
  .sn-pct-btn:hover { border-color: var(--accent); color: var(--accent); background: rgba(0, 229, 255, 0.1); }

  .sn-risk-options { display: flex; gap: .5rem; align-items: center; flex-wrap: wrap; }
  .sn-risk-chip {
    background: rgba(255, 255, 255, 0.02); border: 1px solid var(--border); border-radius: 0;
    padding: .4rem .75rem; font-size: .8rem; cursor: pointer; font-family: var(--mono);
    color: var(--text2); transition: all 0.2s;
  }
  .sn-risk-chip.active { background: rgba(0, 229, 255, 0.15); border-color: var(--accent); color: var(--accent); font-weight: bold; }

  .sn-preview {
    background: rgba(2, 6, 23, 0.5); border: 1px solid rgba(0, 229, 255, 0.2);
    border-radius: 0; padding: 1rem; display: flex; flex-direction: column; gap: .5rem;
    box-shadow: inset 0 0 20px rgba(0, 229, 255, 0.05);
  }
  .sn-preview-row { display: flex; justify-content: space-between; align-items: center; font-size: .85rem; color: var(--text2); }
  .sn-preview-val { font-family: var(--mono); font-size: .9rem; color: var(--text); font-weight: bold; }
  .sn-win  { color: var(--green) !important; text-shadow: 0 0 10px rgba(34,197,94,0.4); }
  .sn-loss { color: var(--red) !important; }

  .sn-rr-bar { display: flex; align-items: center; gap: .5rem; }
  .sn-rr-track { flex: 1; height: 6px; background: rgba(255, 255, 255, 0.1); border-radius: 0; }
  .sn-rr-fill  { height: 100%; border-radius: 0; box-shadow: 0 0 5px currentColor; }

  .sn-shoot-btn {
    padding: 1rem; border-radius: 0; border: none; cursor: pointer;
    font-family: var(--mono); font-size: 1rem; font-weight: 800; letter-spacing: .1em;
    transition: all .2s; width: 100%; margin-top: .5rem; text-transform: uppercase;
  }
  .sn-shoot-btn.buy  { background: var(--green); color: #000; box-shadow: 0 4px 15px rgba(34,197,94,0.4); }
  .sn-shoot-btn.sell { background: var(--red); color: #000; box-shadow: 0 4px 15px rgba(239,68,68,0.4); }
  .sn-shoot-btn:hover:not(:disabled) { transform: translateY(-2px); filter: brightness(1.2); }
  .sn-shoot-btn:disabled { opacity: 0.5; cursor: not-allowed; filter: grayscale(1); box-shadow: none; transform: none; }

  .sn-tabs { display: flex; gap: .5rem; background: rgba(2, 6, 23, 0.6); border: 1px solid var(--border); border-radius: 0; padding: .4rem; width: fit-content; backdrop-filter: blur(10px); margin-bottom: 20px; }
  .sn-tab {
    padding: .6rem 1.5rem; border-radius: 0; border: none; background: transparent;
    color: var(--text2); cursor: pointer; font-family: var(--mono); font-size: .8rem;
    font-weight: 700; display: flex; align-items: center; gap: .5rem; transition: all 0.2s;
  }
  .sn-tab:hover { color: var(--text); }
  .sn-tab.active { background: rgba(255, 255, 255, 0.1); color: var(--accent); box-shadow: 0 2px 10px rgba(0,0,0,0.2); }

  .sn-order-card {
    background: var(--bg2);
    border: 1px solid var(--border);
    border-radius: 0;
    padding: 1.25rem;
    margin-bottom: 1rem;
    box-shadow: 0 8px 32px 0 rgba(0, 0, 0, 0.3);
    backdrop-filter: blur(8px);
    transition: transform 0.2s;
  }
  .sn-order-card:hover { transform: translateY(-2px); border-color: rgba(255,255,255,0.15); }
  .sn-order-card.long  { border-left: 3px solid #3fb950; }
  .sn-order-card.short { border-left: 3px solid #f85149; }

  .sn-order-levels {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: .75rem;
    background: rgba(0,0,0,0.2);
    border-radius: 0;
    padding: 1rem;
    margin-top: 1.25rem;
    border: 1px solid var(--border);
  }
  .sn-level span { font-size: .65rem; color: var(--text2); text-transform: uppercase; font-weight: 700; letter-spacing: 0.05em; }
  .sn-level strong { font-family: var(--mono); font-size: .85rem; color: var(--text); }

  .sn-status-dot { font-family: var(--mono); font-size: .65rem; padding: .15rem .5rem; border-radius: 0; font-weight: 700; }
  .sn-status-active { background: rgba(63, 185, 80, 0.15); color: #3fb950; }
  .sn-status-pending { background: rgba(137, 87, 229, 0.15); color: #a371f7; }

  .sn-stat-card {
    background: var(--bg2);
    border: 1px solid var(--border);
    border-radius: 0;
    padding: 1.25rem;
    backdrop-filter: blur(4px);
  }
  .sn-stat-label { font-size: 0.7rem; color: var(--text2); font-weight: 700; text-transform: uppercase; margin-bottom: 4px; display: block; }
  .sn-stat-value { font-family: var(--mono); font-size: 1.5rem; font-weight: 800; letter-spacing: -0.02em; }

  @media (max-width: 900px) {
    .sn-layout { grid-template-columns: 1fr; }
  }
`;
