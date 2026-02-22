import React, { useState, useEffect } from 'react';
import { getStatus } from '../services/api';

const COINGECKO_IDS = {
    'RENDERUSDT': 'render-token',
    'FETUSDT': 'fetch-ai',
    'NEARUSDT': 'near',
    'TAOUSDT': 'bittensor',
    'WLDUSDT': 'worldcoin-wld',
    'USDTMXN': 'tether',
};

const VOL_HIGH = {
    'RENDERUSDT': 120_000_000,
    'FETUSDT': 60_000_000,
    'NEARUSDT': 200_000_000,
    'TAOUSDT': 50_000_000,
    'WLDUSDT': 80_000_000,
    'USDTMXN': 500_000_000, // Pesos
};

const NEWS_QUERIES = {
    'RENDERUSDT': 'Render Network GPU AI crypto',
    'FETUSDT': 'Fetch AI autonomous agents crypto',
    'NEARUSDT': 'NEAR Protocol AI blockchain',
    'TAOUSDT': 'Bittensor TAO AI machine learning',
    'WLDUSDT': 'Worldcoin WLD identity crypto',
    'USDTMXN': 'peso mexicano tether usdt exchange rate',
};

const AI_SYMBOLS = ['RENDERUSDT', 'FETUSDT', 'NEARUSDT', 'TAOUSDT', 'WLDUSDT', 'USDTMXN'];

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
        return { conviction: 'GREEN', reasoning: `🐋 Demanda institucional en bloque detectada` };
    if (regimeBull && isBullish)
        return { conviction: 'GREEN', reasoning: `Confluencia alcista múltiple confirmada` };
    if (isBearish && isHighVol)
        return { conviction: 'RED', reasoning: `⚠️ Fuerte señal de distribución de activos` };
    if (regimeBear || (isBearish && !isHighVol))
        return { conviction: 'RED', reasoning: `Flujo bajista activo — SIT & WAIT` };

    return { conviction: 'YELLOW', reasoning: `Sin dirección tendencial clara — Monitoreando` };
};

const getConvictionStyle = (conviction) => {
    switch (conviction) {
        case 'GREEN': return { color: '#00ff88', glow: '0 0 20px rgba(0,255,136,0.3)', label: 'ALTA CONVICCIÓN' };
        case 'RED': return { color: '#ff4444', glow: '0 0 20px rgba(255,68,68,0.3)', label: 'SIT & WAIT' };
        case 'YELLOW': default: return { color: '#ffcc00', glow: '0 0 20px rgba(255,204,0,0.3)', label: 'VIGILANCIA' };
    }
};

const formatVol = (volume) => {
    if (volume >= 1e9) return `$${(volume / 1e9).toFixed(1)}B`;
    if (volume >= 1e6) return `$${(volume / 1e6).toFixed(0)}M`;
    return `$${(volume / 1e3).toFixed(0)}K`;
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
            const url = `https://api.coingecko.com/api/v3/simple/price?ids=${ids}&vs_currencies=usd,mxn&include_24hr_vol=true&include_24hr_change=true`;
            const res = await fetch(url);
            const data = await res.json();
            const mapped = {};
            for (const [symbol, cgId] of Object.entries(COINGECKO_IDS)) {
                if (data[cgId]) {
                    // Si es USDTMXN, usamos MXN como base para precio y cambios
                    const isMXN = symbol === 'USDTMXN';
                    mapped[symbol] = {
                        usd: isMXN ? data[cgId].mxn : data[cgId].usd,
                        usd_24h_vol: isMXN ? data[cgId].mxn_24h_vol : data[cgId].usd_24h_vol,
                        usd_24h_change: isMXN ? data[cgId].mxn_24h_change : data[cgId].usd_24h_change,
                        _symbol: symbol
                    };
                }
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
                    } catch (e) {
                        if (s === 'USDTMXN') return { symbol: s, isSynthetic: true };
                        return { symbol: s, error: true };
                    }
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
        <div className="market-scanner-container" style={{ padding: '24px 24px 0 24px' }}>

            {/* Cards — grid de 3 columnas, 5 cards */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '24px' }}>
                {scannerData.map((pair) => {
                    const cg = cgData[pair.symbol];
                    const holding = holdings[pair.symbol];
                    const price = cg?.usd ?? pair.price ?? 0;
                    const change = cg?.usd_24h_change ?? 0;
                    const vol = cg?.usd_24h_vol ?? 0;
                    const isPositive = change >= 0;

                    // Si el backend no provee régimen (ej. USDTMXN), calculamos uno sintético basado en el movimiento
                    let displayRegime = pair.marketRegime;
                    if (!displayRegime && pair.symbol === 'USDTMXN') {
                        displayRegime = { name: change > 0.8 ? 'ALCISTA ESTABLE' : change < -0.8 ? 'BAJISTA ESTABLE' : 'LATERAL' };
                    }

                    const { conviction, reasoning } = calcConviction(cg, displayRegime);
                    const style = getConvictionStyle(conviction);
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
                            outline: 'none',
                            outlineOffset: '-1px',
                            boxShadow: 'var(--card-shadow)',
                            borderRadius: '0', padding: '24px',
                            height: '420px',
                            minHeight: '420px',
                            display: 'flex',
                            flexDirection: 'column',
                            transition: 'all 0.3s ease'
                        }}>
                            {/* Accent bar */}
                            <div style={{
                                position: 'absolute', top: 0, left: 0,
                                width: '100%', height: '4px',
                                background: style.color,
                                opacity: 0.8
                            }} />

                            {/* Symbol + Price */}
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '16px' }}>
                                <div>
                                    <div style={{ fontSize: '2.2rem', fontWeight: 900, letterSpacing: '-0.05em', color: 'var(--text-main)', fontFamily: 'Outfit', lineHeight: 1 }}>
                                        {pair.symbol === 'USDTMXN' ? 'USDT/MXN' : pair.symbol.replace('USDT', '')}
                                    </div>
                                </div>
                                <div style={{ textAlign: 'right' }}>
                                    <div style={{ fontSize: '1.4rem', fontWeight: 800, fontFamily: 'JetBrains Mono', color: 'var(--text-main)', marginBottom: '4px', lineHeight: 1 }}>
                                        ${price.toFixed(4)}
                                    </div>
                                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '4px' }}>
                                        <div style={{
                                            display: 'inline-block',
                                            padding: '2px 6px',
                                            background: isPositive ? 'rgba(0, 255, 136, 0.1)' : 'rgba(255, 68, 68, 0.1)',
                                            border: `1px solid ${isPositive ? 'var(--success)' : 'var(--danger)'}`,
                                            color: isPositive ? 'var(--success)' : 'var(--danger)',
                                            fontSize: '12px',
                                            fontWeight: 900,
                                            borderRadius: '2px',
                                        }}>
                                            {isPositive ? '▲' : '▼'} {Math.abs(change).toFixed(2)}%
                                        </div>
                                        <div style={{ fontSize: '11px', color: 'var(--text-dim)', fontWeight: 800, opacity: 0.8 }}>
                                            VOL: {formatVol(vol)}
                                        </div>
                                    </div>
                                </div>
                            </div>


                            <div style={{ background: 'rgba(255,255,255,0.02)', padding: '18px', borderRadius: '0', marginBottom: '12px', border: `1px solid var(--border-color)`, textAlign: 'center' }}>
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px', marginBottom: '8px' }}>
                                    <div style={{ width: '10px', height: '10px', borderRadius: '50%', background: style.color, boxShadow: `0 0 15px ${style.color}` }} />
                                    <span style={{ fontSize: '16px', fontWeight: 900, color: style.color, letterSpacing: '0.1em' }}>{style.label}</span>
                                </div>
                                <div style={{ fontSize: '13px', color: 'var(--text-dim)', lineHeight: 1.5, fontFamily: 'Outfit', fontWeight: 600 }}>{reasoning}</div>
                            </div>

                            <div style={{ border: '1px solid var(--border-color)', padding: '20px', background: 'rgba(0,0,0,0.2)', marginBottom: '16px', textAlign: 'center' }}>
                                <div style={{ fontSize: '10px', color: 'var(--text-muted)', marginBottom: '8px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.15em' }}>REGIMEN DEL MERCADO</div>
                                <div style={{ fontSize: '22px', fontWeight: 900, color: 'var(--accent-primary)', fontFamily: 'Outfit', letterSpacing: '0.05em', textTransform: 'uppercase' }}>
                                    {displayRegime?.name?.replace(/[^a-zA-ZáéíóúÁÉÍÓÚñÑ\s]/g, '').trim() || 'ANALIZANDO'}
                                </div>
                            </div>

                            {/* SLOT DE NOTICIAS — Priorizado y Ampliado */}
                            <div style={{
                                marginBottom: '16px',
                                flex: 1,
                                overflowY: 'auto',
                                display: 'flex',
                                flexDirection: 'column',
                                scrollbarWidth: 'none'
                            }}>
                                <div style={{ fontSize: '9px', color: 'var(--text-muted)', fontWeight: 800, marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.15em', textAlign: 'center' }}>
                                    INTEL DE MERCADO
                                </div>
                                {news.length > 0 ? (
                                    news.slice(0, 3).map((article, i) => (
                                        <a key={i} href={article.url} target="_blank" rel="noopener noreferrer"
                                            style={{ display: 'block', textDecoration: 'none', marginBottom: '6px', padding: '8px 10px', background: 'rgba(255,255,255,0.02)', border: '1px solid var(--border-color)', borderRadius: '0', transition: 'all 0.2s' }}
                                            onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.05)'}
                                            onMouseLeave={e => e.currentTarget.style.background = 'rgba(255,255,255,0.02)'}>
                                            <div style={{ fontSize: '10px', color: 'var(--text-main)', fontWeight: 600, lineHeight: 1.2, marginBottom: '3px' }}>
                                                {article.title?.length > 70 ? article.title.substring(0, 70) + '...' : article.title}
                                            </div>
                                            <div style={{ fontSize: '8px', color: 'var(--text-muted)', display: 'flex', justifyContent: 'space-between' }}>
                                                <span>{article.source}</span>
                                                <span>{timeAgo(article.publishedAt)}</span>
                                            </div>
                                        </a>
                                    ))
                                ) : (
                                    <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px dashed rgba(255,255,255,0.1)', background: 'rgba(0,0,0,0.2)' }}>
                                        <span style={{ fontSize: '10px', fontWeight: 800, color: 'var(--text-dim)', letterSpacing: '0.2em' }}>■ EN VIGILANCIA ■</span>
                                    </div>
                                )}
                            </div>


                        </div>
                    );
                })}
            </div>
        </div>
    );
};

export default GlobalMarketScanner;
