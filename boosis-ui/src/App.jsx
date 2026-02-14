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
  Lock,
  Eye,
  EyeOff
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
    realBalance: [],
    marketStatus: { status: 'UNKNOWN', volatility: 0 }
  })
  const [candles, setCandles] = useState([])
  const [trades, setTrades] = useState([])
  const [health, setHealth] = useState(null)
  const [metrics, setMetrics] = useState({ profitFactor: '0', winRate: '0%', totalTrades: 0 })
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(true)
  const [showPassword, setShowPassword] = useState(false)
  const [modal, setModal] = useState({ show: false, title: '', message: '', onConfirm: null, type: 'info' })
  const [activeTab, setActiveTab] = useState('logs')
  const [logs, setLogs] = useState([])

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

  useEffect(() => {
    // SSE for Logs
    if (token) {
      const eventSource = new EventSource(`${apiUrl}/logs/stream?token=${token}`);

      eventSource.onmessage = (event) => {
        try {
          const log = JSON.parse(event.data);
          setLogs(prev => [log, ...prev].slice(0, 100)); // Keep last 100 logs
        } catch (e) {
          console.error('Error parsing log:', e);
        }
      };

      eventSource.onerror = (err) => {
        // console.error('SSE Error:', err); // Suppress error logs on disconnect
        eventSource.close();
      };

      return () => {
        eventSource.close();
      };
    }
  }, [token]);

  const toggleTradingMode = async () => {
    const targetLive = !!data.paperTrading; // Si está en paper, el objetivo es live (true)
    const modeName = targetLive ? 'REAL (LIVE)' : 'SIMULADO (PAPER)';

    setModal({
      show: true,
      title: targetLive ? '🛑 ¡PELIGRO: DINERO REAL!' : 'Confirmar Cambio de Sistema',
      message: targetLive
        ? `ESTÁS POR ENTRAR EN MODO DE TRADING REAL. El bot comenzará a usar tus fondos de BINANCE inmediatamente e CORRERÁS EL RIESGO DE PERDER DINERO REAL. ¿Estás absolutamente seguro de que la estrategia está lista?`
        : `Estas por cambiar al modo ${modeName}. ¿Estás seguro de continuar? Esto afectará la ejecución de órdenes inmediatamente.`,
      type: targetLive ? 'danger' : 'info',
      onConfirm: async () => {
        try {
          await axios.post(`${apiUrl}/settings/trading-mode`, { live: targetLive });
          fetchData();
          setModal({ ...modal, show: false });
        } catch (err) {
          setError('No se pudo cambiar el modo de trading.');
          setModal({ ...modal, show: false });
        }
      }
    });
  }

  const emergencyStop = () => {
    setModal({
      show: true,
      title: '🚨 PARADA DE EMERGENCIA',
      message: 'Esto detendrá INMEDIATAMENTE todas las operaciones del bot, cerrará la conexión con Binance y cambiará al modo PAPER. ¿Estás seguro?',
      type: 'danger',
      onConfirm: async () => {
        try {
          await axios.post(`${apiUrl}/emergency-stop`);
          fetchData();
          setModal({ ...modal, show: false });
          setError(null);
        } catch (err) {
          setError('Error al ejecutar parada de emergencia.');
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
      } else {
        setError('Error de conexión con el bot. Reintentando...')
      }
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
      <div style={{
        height: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'radial-gradient(circle at center, #161b22 0%, #0d1117 100%)'
      }}>
        <form onSubmit={handleLogin} className="panel" style={{
          width: '380px',
          padding: '40px',
          textAlign: 'center',
          border: '1px solid #30363d',
          boxShadow: '0 20px 50px rgba(0,0,0,0.5)'
        }}>
          <div style={{
            width: '64px',
            height: '64px',
            background: 'rgba(56, 139, 253, 0.1)',
            borderRadius: '16px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            margin: '0 auto 24px'
          }}>
            <Zap size={32} color="#58a6ff" />
          </div>

          <h1 style={{ fontSize: '24px', fontWeight: '800', marginBottom: '8px', color: '#c9d1d9' }}>Boosis Búnker</h1>
          <p style={{ color: '#8b949e', fontSize: '14px', marginBottom: '32px' }}>Introduce tu llave de acceso estratégica</p>

          <div style={{ position: 'relative', marginBottom: '20px' }}>
            <input
              type={showPassword ? "text" : "password"}
              placeholder="Contraseña de administrador"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              style={{
                width: '100%',
                padding: '14px 45px 14px 14px',
                background: '#0d1117',
                border: '1px solid #30363d',
                color: 'white',
                borderRadius: '8px',
                fontSize: '15px',
                outline: 'none',
                transition: 'border-color 0.2s'
              }}
              onFocus={(e) => e.target.style.borderColor = '#58a6ff'}
              onBlur={(e) => e.target.style.borderColor = '#30363d'}
            />
            <div
              onClick={() => setShowPassword(!showPassword)}
              style={{
                position: 'absolute',
                right: '15px',
                top: '50%',
                transform: 'translateY(-50%)',
                cursor: 'pointer',
                color: '#8b949e',
                display: 'flex',
                alignItems: 'center'
              }}
            >
              {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
            </div>
          </div>

          <button type="submit" style={{
            width: '100%',
            padding: '14px',
            background: '#238636',
            border: 'none',
            color: 'white',
            fontWeight: '700',
            borderRadius: '8px',
            cursor: 'pointer',
            fontSize: '15px',
            transition: 'background 0.2s'
          }}
            onMouseOver={(e) => e.target.style.background = '#2ea043'}
            onMouseOut={(e) => e.target.style.background = '#238636'}
          >
            Acceder al Sistema
          </button>

          {error && (
            <div style={{
              marginTop: '20px',
              padding: '12px',
              background: 'rgba(248, 81, 73, 0.1)',
              border: '1px solid rgba(248, 81, 73, 0.2)',
              borderRadius: '6px',
              color: '#f85149',
              fontSize: '13px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px'
            }}>
              <AlertTriangle size={14} />
              {error}
            </div>
          )}
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
          <div className="status-badge" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <div className={`pulse ${data.marketStatus?.status === 'SAFE' ? 'bg-green-500' : 'bg-red-500'}`}
              style={{ background: data.marketStatus?.status === 'SAFE' ? '#2ea043' : '#f85149' }} />
            <span>MERCADO: {data.marketStatus?.status === 'SAFE' ? 'SEGURO' : 'VOLÁTIL'} ({data.marketStatus?.volatility || 0}%)</span>
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

          <div
            onClick={emergencyStop}
            style={{
              cursor: 'pointer',
              padding: '6px 14px',
              borderRadius: '20px',
              fontSize: '11px',
              fontWeight: '800',
              letterSpacing: '0.5px',
              transition: 'all 0.2s ease',
              border: '1px solid #f85149',
              background: '#b62324',
              color: 'white',
              display: 'flex',
              alignItems: 'center',
              gap: '6px'
            }}
          >
            <AlertTriangle size={14} color="white" />
            PARADA DE EMERGENCIA
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
            <div className="stat-label-tiny">Binance Real (USDT)</div>
            <div className="stat-value-med" style={{ color: '#ffa500' }}>${realUsdt}</div>
          </div>
          <div className="stat-card-compact" style={{ borderLeftColor: '#9333ea' }}>
            <div className="stat-label-tiny">Volatilidad (ATR)</div>
            <div className="stat-value-med">{data.marketStatus?.volatility || '0.00'}%</div>
          </div>
          <div className="stat-card-compact" style={{ borderLeftColor: '#2ea043' }}>
            <div className="stat-label-tiny">Tasa de Victoria</div>
            <div className="stat-value-med">{metrics.winRate}</div>
          </div>
          <div className="stat-card-compact" style={{ borderLeftColor: '#f0883e' }}>
            <div className="stat-label-tiny">Slippage Promedio</div>
            <div className="stat-value-med">
              {trades.length > 0 ?
                (trades.reduce((sum, t) => sum + (t.slippage || 0), 0) / trades.filter(t => t.slippage).length || 0).toFixed(3) :
                '0.00'
              }%
            </div>
          </div>
          <div className="stat-card-compact" style={{ borderLeftColor: '#388bfd' }}>
            <div className="stat-label-tiny">Factor de Beneficio</div>
            <div className="stat-value-med">{metrics.profitFactor}</div>
          </div>
        </div>

        {/* SIDEBAR AREA: SYSTEM & INDICATORS */}
        <aside className="sidebar-area panel">
          <h3 className="stat-label-tiny mb-3">Balance Real (Binance)</h3>
          {data.realBalance && data.realBalance.length > 0 ? (
            <div style={{ marginBottom: '20px' }}>
              {/* Total Balance */}
              <div style={{
                background: 'rgba(56, 139, 253, 0.1)',
                border: '1px solid rgba(56, 139, 253, 0.3)',
                borderRadius: '8px',
                padding: '12px',
                marginBottom: '16px'
              }}>
                <div style={{ fontSize: '10px', color: '#8b949e', marginBottom: '4px' }}>BALANCE TOTAL ESTIMADO</div>
                <div style={{ fontSize: '20px', fontWeight: '800', color: '#58a6ff' }}>
                  ${data.totalBalanceUSD ? data.totalBalanceUSD.toFixed(2) : '0.00'}
                </div>
                <div style={{ fontSize: '10px', color: '#8b949e', marginTop: '2px' }}>USD</div>
              </div>

              {/* Individual Assets */}
              <div style={{ fontSize: '10px', color: '#8b949e', marginBottom: '8px', fontWeight: '600' }}>MIS ACTIVOS</div>
              {data.realBalance.map((asset, idx) => (
                <div key={idx} style={{
                  display: 'flex',
                  flexDirection: 'column',
                  padding: '10px 0',
                  borderBottom: idx < data.realBalance.length - 1 ? '1px solid #21262d' : 'none'
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                    <span style={{ fontSize: '13px', fontWeight: '700', color: '#e6edf3' }}>{asset.asset}</span>
                    <span style={{ fontSize: '13px', fontWeight: '700', color: '#e6edf3' }}>
                      {asset.total.toFixed(asset.asset === 'USDT' ? 4 : 8)}
                    </span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ fontSize: '11px', color: '#8b949e' }}>
                      ${asset.priceUSD ? asset.priceUSD.toFixed(asset.priceUSD > 1 ? 2 : 8) : '0.00'} USD
                    </span>
                    <span style={{ fontSize: '11px', color: '#58a6ff', fontWeight: '600' }}>
                      ≈ ${asset.valueUSD ? asset.valueUSD.toFixed(2) : '0.00'}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div style={{ fontSize: '11px', color: '#8b949e', marginBottom: '20px' }}>
              Conectando a Binance...
            </div>
          )}

          <h3 className="stat-label-tiny mb-3">Simulación de Wallet</h3>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '10px' }}>
            <span style={{ fontSize: '12px', color: '#8b949e' }}>USDT Disponible</span>
            <span style={{ fontSize: '12px', fontWeight: 'bold' }}>${data.balance?.usdt?.toFixed(2)}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '20px' }}>
            <span style={{ fontSize: '12px', color: '#8b949e' }}>Tenencia BTC</span>
            <span style={{ fontSize: '12px', fontWeight: 'bold' }}>{data.balance?.asset?.toFixed(6)} BTC</span>
          </div>

          <h3 className="stat-label-tiny mb-3">Salud del Sistema</h3>
          <div className="space-y-2">
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px' }}>
              <span style={{ color: '#8b949e' }}>Uptime</span>
              <span>{health ? `${Math.floor(health.uptime / 60)}m` : '--'}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px' }}>
              <span style={{ color: '#8b949e' }}>WebSocket</span>
              <span style={{ color: health?.bot.wsConnected ? '#2ea043' : '#da3633' }}>
                {health?.bot.wsConnected ? 'ACTIVO' : 'OFFLINE'}
              </span>
            </div>
          </div>

          <h3 className="stat-label-tiny mt-6 mb-3">Monitor de Latencia</h3>
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
          <h3 className="stat-label-tiny mt-6 mb-3">Crecimiento de Capital</h3>
          <div style={{ height: '120px', width: '100%' }}>
            {data.equityHistory && data.equityHistory.length > 0 ? (
              <ResponsiveContainer width="100%" height={120}>
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
            ) : (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#8b949e', fontSize: '11px' }}>
                Sin datos de equity
              </div>
            )}
          </div>
        </aside>

        {/* MAIN CHART AREA */}
        <main className="main-chart-area panel">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-sm font-semibold text-gray-400">BTC/USDT 5M LIVE</h2>
            <div className="text-xl font-bold font-mono">${lastPrice.toFixed(2)}</div>
          </div>
          <div className="chart-wrapper" style={{ height: '400px', width: '100%' }}>
            {candles && candles.length > 0 ? (
              <ResponsiveContainer width="100%" height={400}>
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
            ) : (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#8b949e' }}>
                Cargando datos del mercado...
              </div>
            )}
          </div>
        </main>

        {/* ACTIVITY AREA */}
        {/* ACTIVITY AREA */}
        <section className="activity-area panel" style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
          <div style={{ display: 'flex', gap: '15px', marginBottom: '15px', borderBottom: '1px solid #30363d', paddingBottom: '10px' }}>
            <div
              onClick={() => setActiveTab('logs')}
              style={{
                cursor: 'pointer',
                fontSize: '12px',
                fontWeight: '600',
                color: activeTab === 'logs' ? '#58a6ff' : '#8b949e',
                borderBottom: activeTab === 'logs' ? '2px solid #58a6ff' : 'none',
                paddingBottom: '4px'
              }}
            >
              LOGS DEL SISTEMA
            </div>
            <div
              onClick={() => setActiveTab('trades')}
              style={{
                cursor: 'pointer',
                fontSize: '12px',
                fontWeight: '600',
                color: activeTab === 'trades' ? '#58a6ff' : '#8b949e',
                borderBottom: activeTab === 'trades' ? '2px solid #58a6ff' : 'none',
                paddingBottom: '4px'
              }}
            >
              TRADES ({trades.length})
            </div>
          </div>

          <div style={{ flex: 1, overflowY: 'auto' }}>
            {activeTab === 'trades' ? (
              <div className="space-y-2">
                {trades.length === 0 ? (
                  <div style={{ color: '#8b949e', fontSize: '11px', textAlign: 'center', padding: '20px' }}>
                    Esperando señales...
                  </div>
                ) : (
                  trades.slice(0, 50).map((trade, i) => (
                    <div key={i} style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      padding: '8px',
                      background: 'rgba(255,255,255,0.02)',
                      borderRadius: '4px',
                      borderLeft: `2px solid ${trade.side === 'BUY' ? '#3fb950' : '#f85149'}`,
                      marginBottom: '8px'
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
            ) : (
              <div className="space-y-1" style={{ fontFamily: 'monospace', fontSize: '11px' }}>
                {logs.length === 0 ? (
                  <div style={{ color: '#8b949e', textAlign: 'center', padding: '20px' }}>
                    Conectando a logs...
                  </div>
                ) : (
                  logs.map((log, i) => (
                    <div key={i} style={{
                      display: 'flex',
                      gap: '8px',
                      padding: '4px 0',
                      borderBottom: '1px solid #21262d',
                      color: log.level === 'ERROR' ? '#f85149' : log.level === 'WARN' ? '#d29922' : log.level === 'SUCCESS' ? '#2ea043' : '#e6edf3'
                    }}>
                      <span style={{ color: '#8b949e', minWidth: '60px' }}>{log.timestamp}</span>
                      <span style={{ fontWeight: 'bold', minWidth: '50px' }}>[{log.level}]</span>
                      <span>{log.message}</span>
                    </div>
                  ))
                )}
              </div>
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
                  border: 'none', color: 'white', fontWeight: 'bold', borderRadius: '6px', cursor: 'pointer',
                  boxShadow: modal.type === 'danger' ? '0 0 15px rgba(248, 81, 73, 0.4)' : 'none'
                }}
              >
                {modal.type === 'danger' ? 'ACTIVAR TRADING REAL' : 'Confirmar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default App
