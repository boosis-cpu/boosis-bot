import React, { useState, useEffect } from 'react'
import axios from 'axios'
import {
  TrendingUp,
  Activity,
  ShieldCheck,
  DollarSign,
  AlertTriangle,
  Zap,
  Cpu,
  RefreshCcw,
  BarChart2,
  Lock
} from 'lucide-react'
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  AreaChart,
  Area
} from 'recharts'

const apiUrl = '/api'

function App() {
  const [password, setPassword] = useState('')
  const [token, setToken] = useState(localStorage.getItem('boosis_token'))
  const [data, setData] = useState({
    bot: 'Loading...',
    balance: { usdt: 0, asset: 0 },
    strategy: '',
    paperTrading: false,
    equityHistory: [],
    realBalance: []
  })
  const [candles, setCandles] = useState([])
  const [trades, setTrades] = useState([])
  const [health, setHealth] = useState(null)
  const [metrics, setMetrics] = useState({ profitFactor: '0', winRate: '0%', totalTrades: 0 })
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(true)
  const [modal, setModal] = useState({ show: false, title: '', message: '', onConfirm: null, type: 'info' })

  useEffect(() => {
    if (token) {
      axios.defaults.headers.common['Authorization'] = `Bearer ${token}`
      fetchData()
      const interval = setInterval(fetchData, 5000)
      return () => clearInterval(interval)
    } else {
      setLoading(false)
    }
  }, [token])

  const toggleTradingMode = async () => {
    const newMode = !data.paperTrading;
    const modeName = newMode ? 'REAL (LIVE)' : 'SIMULADO (PAPER)';

    setModal({
      show: true,
      title: 'Confirmar Cambio de Sistema',
      message: `Estas por cambiar al modo ${modeName}. ¿Estás seguro de continuar? Esto afectará la ejecución de órdenes inmediatamente.`,
      type: newMode ? 'danger' : 'info',
      onConfirm: async () => {
        try {
          await axios.post(`${apiUrl}/settings/trading-mode`, { live: newMode });
          fetchData();
          setModal({ ...modal, show: false });
        } catch (err) {
          setError('No se pudo cambiar el modo de trading.');
          setModal({ ...modal, show: false });
        }
      }
    });
  }

  const fetchData = async () => {
    try {
      const [statusRes, candlesRes, tradesRes, healthRes, metricsRes] = await Promise.all([
        axios.get(`${apiUrl}/status`),
        axios.get(`${apiUrl}/candles?limit=100`),
        axios.get(`${apiUrl}/trades?limit=20`),
        axios.get(`${apiUrl}/health`),
        axios.get(`${apiUrl}/metrics`)
      ])

      setData(statusRes.data)
      setCandles(candlesRes.data.map(c => ({
        time: new Date(c.open_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        close: c.close,
        rsi: c.indicators.rsi,
        sma200: c.indicators.sma200,
        bbUpper: c.indicators.bb?.upper,
        bbLower: c.indicators.bb?.lower
      })))
      setTrades(tradesRes.data)
      setHealth(healthRes.data)
      setMetrics(metricsRes.data)
      setError(null)
    } catch (err) {
      if (err.response?.status === 401) {
        setToken(null)
        localStorage.removeItem('boosis_token')
      }
      setError('Connection error with the bot. Retrying...')
    } finally {
      setLoading(false)
    }
  }

  const handleLogin = async (e) => {
    e.preventDefault()
    try {
      const res = await axios.post(`${apiUrl}/login`, { password })
      setToken(res.data.token)
      localStorage.setItem('boosis_token', res.data.token)
      setError(null)
    } catch (err) {
      setError('Contraseña incorrecta')
    }
  }

  if (!token) {
    return (
      <div style={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <form onSubmit={handleLogin} className="panel" style={{ width: '320px', textAlign: 'center' }}>
          <Zap size={48} color="#58a6ff" style={{ margin: '0 auto 20px' }} />
          <h1 style={{ marginBottom: '20px' }}>Boosis Quant Login</h1>
          <input
            type="password"
            placeholder="Introduce tu contraseña"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            style={{ width: '100%', padding: '12px', marginBottom: '15px', background: '#0d1117', border: '1px solid #30363d', color: 'white', borderRadius: '6px' }}
          />
          <button type="submit" style={{ width: '100%', padding: '12px', background: '#2ea043', border: 'none', color: 'white', fontWeight: 'bold', borderRadius: '6px', cursor: 'pointer' }}>
            Acceder al Búnker
          </button>
          {error && <p style={{ color: '#f85149', marginTop: '15px', fontSize: '14px' }}>{error}</p>}
        </form>
      </div>
    )
  }

  const lastPrice = candles[candles.length - 1]?.close || 0
  const totalBalance = data.balance ? (data.balance.usdt + (data.balance.asset * lastPrice)) : 0
  const realUsdt = parseFloat(data.realBalance?.find(b => b.asset === 'USDT')?.free || 0).toFixed(2)
  const realBtc = parseFloat(data.realBalance?.find(b => b.asset === 'BTC')?.free || 0).toFixed(6)

  return (
    <div className="dashboard-container">
      <header className="header">
        <div className="flex items-center gap-4">
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <Zap color="#58a6ff" size={24} />
            <h1 style={{ fontSize: '1.2rem', margin: 0 }}>Boosis <b>Quant</b></h1>
          </div>
          <div className="status-badge">
            <div className="pulse" />
            LIVE MONITOR: {data.symbol}
          </div>
        </div>

        <div style={{ display: 'flex', gap: '20px', alignItems: 'center' }}>
          <div
            onClick={toggleTradingMode}
            className={`badge ${data.paperTrading ? 'badge-blue' : 'badge-red'}`}
            style={{
              cursor: 'pointer',
              padding: '6px 14px',
              borderRadius: '20px',
              fontSize: '11px',
              fontWeight: '800',
              letterSpacing: '0.5px',
              transition: 'all 0.2s ease',
              border: data.paperTrading ? '1px solid #388bfd' : '1px solid #f85149',
              background: data.paperTrading ? 'rgba(56, 139, 253, 0.1)' : 'rgba(248, 81, 73, 0.1)',
              color: data.paperTrading ? '#58a6ff' : '#ff7b72'
            }}
          >
            {data.paperTrading ? 'OFFLINE (PAPER)' : '⚠️ ONLINE (LIVE)'}
          </div>
          <button onClick={() => { setToken(null); localStorage.removeItem('boosis_token'); }}
            style={{ background: 'transparent', border: '1px solid #30363d', color: 'white', padding: '5px 12px', borderRadius: '4px', cursor: 'pointer', fontSize: '12px' }}>
            Cerrar Sesión
          </button>
        </div>
      </header>

      <div className="grid-layout">
        {/* TOP ROW: KEY METRICS */}
        <div className="metrics-row">
          <div className="stat-card-compact">
            <div className="stat-label-tiny">Total Portfolio</div>
            <div className="stat-value-med text-green-400">${totalBalance.toFixed(2)}</div>
          </div>
          <div className="stat-card-compact" style={{ borderLeftColor: '#ffa500' }}>
            <div className="stat-label-tiny">Real Binance (USDT)</div>
            <div className="stat-value-med" style={{ color: '#ffa500' }}>${realUsdt}</div>
          </div>
          <div className="stat-card-compact" style={{ borderLeftColor: '#9333ea' }}>
            <div className="stat-label-tiny">RSI (14)</div>
            <div className="stat-value-med">{candles[candles.length - 1]?.rsi?.toFixed(1) || '--'}</div>
          </div>
          <div className="stat-card-compact" style={{ borderLeftColor: '#2ea043' }}>
            <div className="stat-label-tiny">Win Rate</div>
            <div className="stat-value-med">{metrics.winRate}</div>
          </div>
          <div className="stat-card-compact" style={{ borderLeftColor: '#f0883e' }}>
            <div className="stat-label-tiny">Avg Slippage</div>
            <div className="stat-value-med">
              {trades.length > 0 ?
                (trades.reduce((sum, t) => sum + (t.slippage || 0), 0) / trades.filter(t => t.slippage).length || 0).toFixed(3) :
                '0.00'
              }%
            </div>
          </div>
          <div className="stat-card-compact" style={{ borderLeftColor: '#388bfd' }}>
            <div className="stat-label-tiny">Profit Factor</div>
            <div className="stat-value-med">{metrics.profitFactor}</div>
          </div>
        </div>

        {/* SIDEBAR AREA: SYSTEM & INDICATORS */}
        <aside className="sidebar-area panel">
          <h3 className="stat-label-tiny mb-3">Wallet Simulation</h3>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '10px' }}>
            <span style={{ fontSize: '12px', color: '#8b949e' }}>USDT Available</span>
            <span style={{ fontSize: '12px', fontWeight: 'bold' }}>${data.balance?.usdt?.toFixed(2)}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '20px' }}>
            <span style={{ fontSize: '12px', color: '#8b949e' }}>BTC Holdings</span>
            <span style={{ fontSize: '12px', fontWeight: 'bold' }}>{data.balance?.asset?.toFixed(6)} BTC</span>
          </div>

          <h3 className="stat-label-tiny mb-3">System Health</h3>
          <div className="space-y-2">
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px' }}>
              <span style={{ color: '#8b949e' }}>Uptime</span>
              <span>{health ? `${Math.floor(health.uptime / 60)}m` : '--'}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px' }}>
              <span style={{ color: '#8b949e' }}>WebSocket</span>
              <span style={{ color: health?.bot.wsConnected ? '#2ea043' : '#da3633' }}>
                {health?.bot.wsConnected ? 'ACTIVE' : 'OFFLINE'}
              </span>
            </div>
          </div>

          <h3 className="stat-label-tiny mt-6 mb-3">Latency Monitor</h3>
          <div className="space-y-2">
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px' }}>
              <span style={{ color: '#8b949e' }}>Binance API</span>
              <span style={{ color: health?.latency?.apiLatency > 500 ? '#f85149' : '#2ea043' }}>
                {health?.latency?.apiLatency || '--'}ms
              </span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px' }}>
              <span style={{ color: '#8b949e' }}>WebSocket RTT</span>
              <span style={{ color: health?.latency?.wsLatency > 300 ? '#f85149' : '#2ea043' }}>
                {health?.latency?.wsLatency || '--'}ms
              </span>
            </div>
          </div>
          <h3 className="stat-label-tiny mt-6 mb-3">Capital Growth</h3>
          <div style={{ height: '120px', width: '100%' }}>
            <ResponsiveContainer>
              <AreaChart data={data.equityHistory}>
                <defs>
                  <linearGradient id="colorVal" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#2ea043" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#2ea043" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <Area type="monotone" dataKey="value" stroke="#3fb950" fillOpacity={1} fill="url(#colorVal)" dot={false} />
                <Tooltip hide />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </aside>

        {/* MAIN CHART AREA */}
        <main className="main-chart-area panel">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-sm font-semibold text-gray-400">BTC/USDT 5M LIVE</h2>
            <div className="text-xl font-bold font-mono">${lastPrice.toFixed(2)}</div>
          </div>
          <div className="chart-wrapper">
            <ResponsiveContainer>
              <LineChart data={candles}>
                <XAxis dataKey="time" hide />
                <YAxis domain={['auto', 'auto']} hide />
                <Tooltip
                  contentStyle={{ backgroundColor: '#0d1117', border: '1px solid #30363d' }}
                  itemStyle={{ color: '#c9d1d9' }}
                />
                <Line type="monotone" dataKey="close" stroke="#58a6ff" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="sma200" stroke="#f85149" strokeWidth={1} dot={false} strokeDasharray="3 3" />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </main>

        {/* ACTIVITY AREA */}
        <section className="activity-area panel">
          <h3 className="stat-label-tiny mb-4 flex items-center gap-2">
            <Activity size={12} /> Execution Logs
          </h3>
          <div className="space-y-2">
            {trades.length === 0 ? (
              <div style={{ color: '#8b949e', fontSize: '11px', textAlign: 'center', padding: '20px' }}>
                Waiting for signals...
              </div>
            ) : (
              trades.slice(0, 15).map((trade, i) => (
                <div key={i} style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: '8px',
                  background: 'rgba(255,255,255,0.02)',
                  borderRadius: '4px',
                  borderLeft: `2px solid ${trade.side === 'BUY' ? '#3fb950' : '#f85149'}`
                }}>
                  <div style={{ display: 'flex', flexDirection: 'column' }}>
                    <span style={{ fontSize: '12px', fontWeight: 'bold' }}>{trade.side} BTC</span>
                    <span style={{ fontSize: '10px', color: '#8b949e' }}>{trade.reason || 'Trend'}</span>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: '11px', fontWeight: 'bold' }}>${trade.price}</div>
                    {trade.slippage && (
                      <div style={{ fontSize: '9px', color: trade.slippage > 0.05 ? '#f85149' : '#8b949e' }}>
                        Slip: {trade.slippage}%
                      </div>
                    )}
                    <div style={{ fontSize: '9px', color: '#58a6ff' }}>{new Date(parseInt(trade.timestamp)).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>
                  </div>
                </div>
              ))
            )}
          </div>
        </section>
      </div>

      {/* PREMIUM MODAL DIALOG */}
      {modal.show && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(8px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          zIndex: 9999, animation: 'fadeIn 0.2s ease'
        }}>
          <div className="panel" style={{
            width: '400px', padding: '30px',
            border: `1px solid ${modal.type === 'danger' ? '#f85149' : '#30363d'}`,
            textAlign: 'center', boxShadow: '0 20px 50px rgba(0,0,0,0.5)'
          }}>
            <div style={{ marginBottom: '20px', color: modal.type === 'danger' ? '#f85149' : '#58a6ff' }}>
              {modal.type === 'danger' ? <AlertTriangle size={48} style={{ margin: '0 auto' }} /> : <ShieldCheck size={48} style={{ margin: '0 auto' }} />}
            </div>
            <h2 style={{ fontSize: '1.5rem', marginBottom: '15px' }}>{modal.title}</h2>
            <p style={{ color: '#8b949e', fontSize: '14px', lineHeight: '1.6', marginBottom: '30px' }}>
              {modal.message}
            </p>
            <div style={{ display: 'flex', gap: '12px' }}>
              <button
                onClick={() => setModal({ ...modal, show: false })}
                style={{ flex: 1, padding: '12px', background: 'transparent', border: '1px solid #30363d', color: 'white', borderRadius: '6px', cursor: 'pointer' }}
              >
                Cancelar
              </button>
              <button
                onClick={modal.onConfirm}
                style={{
                  flex: 1, padding: '12px',
                  background: modal.type === 'danger' ? '#f85149' : '#2ea043',
                  border: 'none', color: 'white', fontWeight: 'bold', borderRadius: '6px', cursor: 'pointer'
                }}
              >
                Confirmar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default App
