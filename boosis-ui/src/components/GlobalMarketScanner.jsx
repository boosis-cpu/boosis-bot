import React, { useState, useEffect } from 'react';
import { getStatus } from '../services/api';

const COINGECKO_IDS = {
    'RENDERUSDT': 'render-token',
    'FETUSDT': 'fetch-ai',
    'NEARUSDT': 'near',
    'TAOUSDT': 'bittensor',
    'WLDUSDT': 'worldcoin-wld',
};

const VOL_HIGH = {
    'RENDERUSDT': 120_000_000,
    'FETUSDT': 60_000_000,
    'NEARUSDT': 200_000_000,
    'TAOUSDT': 50_000_000,
    'WLDUSDT': 80_000_000,
};

const NEWS_QUERIES = {
    'RENDERUSDT': 'Render Network GPU AI crypto',
    'FETUSDT': 'Fetch AI autonomous agents crypto',
    'NEARUSDT': 'NEAR Protocol AI blockchain',
    'TAOUSDT': 'Bittensor TAO AI machine learning',
    'WLDUSDT': 'Worldcoin WLD identity crypto',
};

const AI_SYMBOLS = ['RENDERUSDT', 'FETUSDT', 'NEARUSDT', 'TAOUSDT', 'WLDUSDT'];

const calcConviction = (cgData, regime) => {
    if (!cgData) return { conviction: 'YELLOW', reasoning: 'Esperando datos de mercado...' };
    const vol = cgData.usd_24h_vol;
    const change = cgData.usd_24h_change;
    const symbol = cgData._symbol;
    const volHigh = VOL_HIGH[symbol] || 100_000_000;
    const isHighVol = vol > volHigh;
    const isBullish = change > 2;
    const isBearish = change < -2;
    const regimeName = regime?.name || '';
    const regimeBull = regimeName.includes('ALCISTA') || regimeName.includes('REBOTE');
    const regimeBear = regimeName.includes('BAJISTA') || regimeName.includes('CAÍDA');

    if (isHighVol && isBullish)
        return { conviction: 'GREEN', reasoning: `🐋 Vol $${(vol / 1e6).toFixed(0)}M — Demanda institucional detectada` };
    if (regimeBull && isBullish)
        return { conviction: 'GREEN', reasoning: `HMM alcista + precio +${change.toFixed(2)}% — Confluencia confirmada` };
    if (isBearish && isHighVol)
        return { conviction: 'RED', reasoning: `⚠️ Distribución — Vol $${(vol / 1e6).toFixed(0)}M con precio ${change.toFixed(2)}%` };
    if (regimeBear || (isBearish && !isHighVol))
        return { conviction: 'RED', reasoning: `Presión bajista activa — SIT & WAIT` };

    return { conviction: 'YELLOW', reasoning: `Vol $${(vol / 1e6).toFixed(0)}M | ${change >= 0 ? '+' : ''}${change.toFixed(2)}% — Esperando dirección` };
};

const getConvictionStyle = (conviction) => {
    switch (conviction) {
        case 'GREEN': return { color: '#00ff88', glow: '0 0 20px rgba(0,255,136,0.3)', label: 'ALTA CONVICCIÓN' };
        case 'YELLOW': return { color: '#ffcc00', glow: '0 0 20px rgba(255,204,0,0.2)', label: 'VIGILANCIA' };
        case 'RED': return { color: '#ff4444', glow: '0 0 20px rgba(255,68,68,0.2)', label: 'SIT & WAIT' };
        default: return { color: '#8b949e', glow: 'none', label: 'ANALIZANDO' };
    }
};

const timeAgo = (dateStr) => {
    const diff = Date.now() - new Date(dateStr).getTime();
    const h = Math.floor(diff / 3600000);
    const m = Math.floor((diff % 3600000) / 60000);
    if (h > 0) return `${h}h ago`;
    return `${m}m ago`;
};

const GlobalMarketScanner = ({ token }) => {
    const [scannerData, setScannerData] = useState([]);
    const [cgData, setCgData] = useState({});
    const [newsData, setNewsData] = useState({});
    const [holdings, setHoldings] = useState({}); // Balance real de Binance
    const [loading, setLoading] = useState(true);
    const [lastUpdate, setLastUpdate] = useState(null);

    const fetchCoinGecko = async () => {
        try {
            const ids = Object.values(COINGECKO_IDS).join(',');
            const url = `https://api.coingecko.com/api/v3/simple/price?ids=${ids}&vs_currencies=usd&include_24hr_vol=true&include_24hr_change=true`;
            const res = await fetch(url);
            const data = await res.json();
            const mapped = {};
            for (const [symbol, cgId] of Object.entries(COINGECKO_IDS)) {
                if (data[cgId]) mapped[symbol] = { ...data[cgId], _symbol: symbol };
            }
            setCgData(mapped);
            setLastUpdate(new Date());
        } catch (e) { console.error('[Sentinel] CoinGecko error:', e); }
    };

    const fetchNews = async () => {
        try {
            const storedToken = token || localStorage.getItem('boosis_token');
            const results = [];
            for (const symbol of AI_SYMBOLS) {
                const query = NEWS_QUERIES[symbol];
                try {
                    const res = await fetch(`/api/news?query=${encodeURIComponent(query)}`, {
                        headers: { Authorization: `Bearer ${storedToken}` }
                    });
                    const data = await res.json();
                    results.push({ symbol, articles: data.articles || [] });
                } catch (e) {
                    results.push({ symbol, articles: [] });
                }
            }
            const mapped = {};
            results.forEach(r => { mapped[r.symbol] = r.articles; });
            setNewsData(mapped);
        } catch (e) { console.error('[Sentinel] News error:', e); }
    };

    const fetchBotStatus = async () => {
        try {
            const storedToken = token || localStorage.getItem('boosis_token');

            // 1. Balance global de Binance (posiciones reales)
            const globalRes = await fetch('/api/status', {
                headers: { Authorization: `Bearer ${storedToken}` }
            });
            const globalData = await globalRes.json();

            // Mapear balance por asset
            const holdingMap = {};
            // FIX: Priorizar realBalance para detectar fondos reales incluso en modo PAPER
            const balanceData = globalData.realBalance || globalData.balance;

            if (balanceData && Array.isArray(balanceData)) {
                balanceData.forEach(b => {
                    if (b.total > 0) {
                        holdingMap[`${b.asset}USDT`] = {
                            total: b.total,
                            locked: b.locked,
                            free: b.free,
                            valueUSD: b.valueUSD,
                            priceUSD: b.priceUSD,
                        };
                    }
                });
            }
            setHoldings(holdingMap);

            // 2. Estado HMM por símbolo
            const results = await Promise.all(
                AI_SYMBOLS.map(async (s) => {
                    try {
                        const res = await fetch(`/api/status?symbol=${s}`, {
                            headers: { Authorization: `Bearer ${storedToken}` }
                        });
                        const d = await res.json();
                        return {
                            symbol: s,
                            price: d.latestCandle?.close ?? 0,
                            marketRegime: d.marketRegime,
                            shieldMode: d.shieldMode,
                        };
                    } catch (e) { return { symbol: s, error: true }; }
                })
            );
            setScannerData(results.filter(r => !r.error));
        } catch (e) { console.error('[Sentinel] Bot status error:', e); }
        finally { setLoading(false); }
    };

    useEffect(() => {
        fetchCoinGecko();
        fetchBotStatus();
        fetchNews();
        const cgInterval = setInterval(fetchCoinGecko, 60_000);
        const botInterval = setInterval(fetchBotStatus, 15_000);
        const newsInterval = setInterval(fetchNews, 300_000);
        return () => {
            clearInterval(cgInterval);
            clearInterval(botInterval);
            clearInterval(newsInterval);
        };
    }, []);

    if (loading) return (
        <div style={{ padding: '40px', textAlign: 'center', color: '#8b949e', fontSize: '12px' }}>
            Inicializando AI Infra Sentinel...
        </div>
    );

    return (
        <div className="market-scanner-container" style={{ padding: '0' }}>

            {/* Cards — grid de 3 columnas, 5 cards */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1px', background: 'var(--border-color)' }}>
                {scannerData.map((pair) => {
                    const cg = cgData[pair.symbol];
                    const holding = holdings[pair.symbol];
                    const { conviction, reasoning } = calcConviction(cg, pair.marketRegime);
                    const style = getConvictionStyle(conviction);
                    const price = cg?.usd ?? pair.price ?? 0;
                    const change = cg?.usd_24h_change ?? 0;
                    const vol = cg?.usd_24h_vol ?? 0;
                    const isPositive = change >= 0;
                    const news = newsData[pair.symbol] || [];

                    // Calcular PnL si hay holding
                    const hasHolding = holding && holding.total > 0.001;
                    const pnlPct = hasHolding && holding.priceUSD > 0
                        ? ((price - holding.priceUSD) / holding.priceUSD) * 100
                        : null;
                    const pnlUSD = hasHolding ? (price - holding.priceUSD) * holding.total : null;
                    const pnlPositive = pnlPct >= 0;

                    return (
                        <div key={pair.symbol} style={{
                            position: 'relative', overflow: 'hidden',
                            background: 'var(--bg-card)',
                            backdropFilter: 'var(--glass)',
                            outline: hasHolding ? `1px solid var(--accent-secondary)` : `none`,
                            outlineOffset: '-1px',
                            boxShadow: hasHolding ? '0 0 30px rgba(245,158,11,0.1)' : 'var(--card-shadow)',
                            borderRadius: '0', padding: '24px',
                            transition: 'all 0.3s ease'
                        }}>
                            {/* Accent bar */}
                            <div style={{
                                position: 'absolute', top: 0, left: 0,
                                width: '100%', height: '4px',
                                background: hasHolding ? 'var(--accent-secondary)' : style.color,
                                opacity: 0.8
                            }} />

                            {/* Symbol + Price */}
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '16px' }}>
                                <div>
                                    <div style={{ fontSize: '10px', color: 'var(--text-muted)', fontWeight: 800, marginBottom: '4px', letterSpacing: '0.1em' }}>CORE_ASSET</div>
                                    <div style={{ fontSize: '2rem', fontWeight: 900, letterSpacing: '-0.05em', color: 'var(--text-main)', fontFamily: 'Outfit' }}>
                                        {pair.symbol.replace('USDT', '')}
                                    </div>
                                </div>
                                <div style={{ textAlign: 'right' }}>
                                    <div style={{ fontSize: '10px', color: 'var(--text-muted)', fontWeight: 800, marginBottom: '4px', letterSpacing: '0.1em' }}>PRICE_USD</div>
                                    <div style={{ fontSize: '1.2rem', fontWeight: 700, fontFamily: 'JetBrains Mono', color: 'var(--text-main)' }}>
                                        ${price.toFixed(4)}
                                    </div>
                                    <div style={{ fontSize: '12px', color: isPositive ? 'var(--success)' : 'var(--danger)', fontWeight: 800 }}>
                                        {isPositive ? '▲' : '▼'} {Math.abs(change).toFixed(2)}%
                                    </div>
                                    <div style={{ fontSize: '10px', color: 'var(--text-dim)', marginTop: '2px' }}>
                                        Vol ${(vol / 1e6).toFixed(0)}M
                                    </div>
                                </div>
                            </div>

                            {/* HOLDING BADGE — solo si hay posición real */}
                            {hasHolding && (
                                <div style={{
                                    background: 'rgba(245, 158, 11, 0.05)',
                                    border: '1px solid rgba(245, 158, 11, 0.2)',
                                    borderRadius: '0',
                                    padding: '12px',
                                    marginBottom: '14px',
                                }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                                        <span style={{ fontSize: '10px', fontWeight: 900, color: 'var(--accent-secondary)' }}>
                                            🏦 HOLDING EN BINANCE
                                        </span>
                                        <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>
                                            {holding.locked > 0 ? '🔒 Con órdenes activas' : '✅ Libre'}
                                        </span>
                                    </div>
                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '6px' }}>
                                        <div>
                                            <div style={{ fontSize: '9px', color: 'var(--text-dim)', marginBottom: '2px' }}>CANTIDAD</div>
                                            <div style={{ fontSize: '11px', fontWeight: 800, color: 'var(--text-main)', fontFamily: 'JetBrains Mono' }}>
                                                {holding.total.toFixed(2)}
                                            </div>
                                        </div>
                                        <div>
                                            <div style={{ fontSize: '9px', color: 'var(--text-dim)', marginBottom: '2px' }}>VALOR</div>
                                            <div style={{ fontSize: '11px', fontWeight: 800, color: 'var(--text-main)', fontFamily: 'JetBrains Mono' }}>
                                                ${(price * holding.total).toFixed(2)}
                                            </div>
                                        </div>
                                        <div>
                                            <div style={{ fontSize: '9px', color: 'var(--text-dim)', marginBottom: '2px' }}>PnL EST.</div>
                                            <div style={{ fontSize: '11px', fontWeight: 800, color: pnlPositive ? 'var(--success)' : 'var(--danger)', fontFamily: 'JetBrains Mono' }}>
                                                {pnlPct !== null ? `${pnlPositive ? '+' : ''}${pnlPct.toFixed(2)}%` : '—'}
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            )}

                            {/* Semáforo */}
                            <div style={{ background: 'rgba(255,255,255,0.02)', padding: '14px', borderRadius: '0', marginBottom: '14px', border: `1px solid var(--border-color)` }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                                    <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: style.color, boxShadow: `0 0 10px ${style.color}` }} />
                                    <span style={{ fontSize: '11px', fontWeight: 900, color: style.color, letterSpacing: '0.05em' }}>{style.label}</span>
                                </div>
                                <div style={{ fontSize: '11px', color: 'var(--text-dim)', lineHeight: 1.5, fontFamily: 'Outfit' }}>{reasoning}</div>
                            </div>

                            {/* HMM + VOL */}
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '14px' }}>
                                <div style={{ border: '1px solid var(--border-color)', padding: '10px', borderRadius: '0', background: 'rgba(0,0,0,0.1)' }}>
                                    <div style={{ fontSize: '9px', color: 'var(--text-muted)', marginBottom: '4px', fontWeight: 700 }}>HMM_REGIME</div>
                                    <div style={{ fontSize: '11px', fontWeight: 800, color: 'var(--accent-primary)', fontFamily: 'JetBrains Mono' }}>
                                        {pair.marketRegime?.name || 'INICIALIZANDO'}
                                    </div>
                                </div>
                                <div style={{ border: '1px solid var(--border-color)', padding: '10px', borderRadius: '0', background: 'rgba(0,0,0,0.1)' }}>
                                    <div style={{ fontSize: '9px', color: 'var(--text-muted)', marginBottom: '4px', fontWeight: 700 }}>VOL_24H</div>
                                    <div style={{ fontSize: '11px', fontWeight: 800, color: vol > (VOL_HIGH[pair.symbol] || 1e8) ? 'var(--success)' : 'var(--text-dim)', fontFamily: 'JetBrains Mono' }}>
                                        ${(vol / 1e6).toFixed(0)}M
                                    </div>
                                </div>
                            </div>

                            {/* Noticias */}
                            {news.length > 0 && (
                                <div style={{ marginBottom: '16px' }}>
                                    <div style={{ fontSize: '9px', color: 'var(--text-muted)', fontWeight: 800, marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
                                        📰 Neural Feed
                                    </div>
                                    {news.slice(0, 2).map((article, i) => (
                                        <a key={i} href={article.url} target="_blank" rel="noopener noreferrer"
                                            style={{ display: 'block', textDecoration: 'none', marginBottom: '6px', padding: '10px', background: 'rgba(255,255,255,0.02)', borderRadius: '0', border: '1px solid var(--border-color)', transition: 'background 0.2s' }}
                                            onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.05)'}
                                            onMouseLeave={e => e.currentTarget.style.background = 'rgba(255,255,255,0.02)'}>
                                            <div style={{ fontSize: '10px', color: 'var(--text-dim)', lineHeight: 1.4, marginBottom: '4px' }}>
                                                {article.title?.length > 70 ? article.title.substring(0, 70) + '...' : article.title}
                                            </div>
                                            <div style={{ fontSize: '9px', color: 'var(--text-muted)', fontWeight: 600 }}>
                                                {article.source} · {timeAgo(article.publishedAt)}
                                            </div>
                                        </a>
                                    ))}
                                </div>
                            )}

                            {/* CTA */}
                            <button
                                style={{
                                    width: '100%',
                                    background: hasHolding ? 'var(--accent-secondary)' : style.color,
                                    color: '#000',
                                    border: 'none',
                                    padding: '12px',
                                    borderRadius: '0',
                                    fontWeight: 900,
                                    fontSize: '11px',
                                    cursor: 'pointer',
                                    transition: 'all 0.2s',
                                    textTransform: 'uppercase',
                                    letterSpacing: '0.05em',
                                    boxShadow: `0 4px 15px ${hasHolding ? 'rgba(245,158,11,0.3)' : style.color + '44'}`
                                }}
                                onMouseEnter={e => {
                                    e.currentTarget.style.transform = 'translateY(-2px)';
                                    e.currentTarget.style.filter = 'brightness(1.1)';
                                }}
                                onMouseLeave={e => {
                                    e.currentTarget.style.transform = 'translateY(0)';
                                    e.currentTarget.style.filter = 'brightness(1)';
                                }}
                            >
                                {hasHolding ? `⚡ GESTIONAR ${pair.symbol.replace('USDT', '')}` : `EJECUTAR SNIPER ${pair.symbol.replace('USDT', '')}`}
                            </button>
                        </div>
                    );
                })}
            </div>
        </div>
    );
};

export default GlobalMarketScanner;
