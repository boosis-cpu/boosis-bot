import { useState, useEffect } from 'react'
import axios from 'axios'
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts'
import { Activity, ShieldCheck, DollarSign, TrendingUp, AlertTriangle, Lock } from 'lucide-react'
import './index.css'

function App() {
  const [token, setToken] = useState(localStorage.getItem('token') || '');
  const [password, setPassword] = useState('');
  const [loginError, setLoginError] = useState('');

  const [data, setData] = useState({
    status: 'offline',
    bot: 'Loading...',
    balance: { usdt: 0, asset: 0 },
    strategy: '',
    paperTrading: false
  })
  const [candles, setCandles] = useState([])
  const [trades, setTrades] = useState([])
  const [error, setError] = useState(null)

  // Use relative path since we are served from the same origin
  const apiUrl = '/api';

  useEffect(() => {
    if (token) {
      axios.defaults.headers.common['Authorization'] = `Bearer ${token}`;
    }
  }, [token]);

  const handleLogin = async () => {
    try {
      const response = await axios.post(`${apiUrl}/login`, { password });
      const newToken = response.data.token;

      localStorage.setItem('token', newToken);
      setToken(newToken);
      setPassword('');
      setLoginError('');
    } catch (error) {
      setLoginError('Contraseña incorrecta');
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('token');
    setToken('');
    setData(prev => ({ ...prev, status: 'offline' }));
  };

  useEffect(() => {
    if (!token) return;

    const fetchData = async () => {
      try {
        // Fetch Status from the correct API endpoint
        const statusRes = await axios.get(`${apiUrl}/status`);
        setData(statusRes.data);

        // Fetch Candles
        const candlesRes = await axios.get(`${apiUrl}/candles?limit=50`);
        if (Array.isArray(candlesRes.data)) {
          const formattedCandles = candlesRes.data.map(c => ({
            time: c.close_time ? new Date(parseInt(c.close_time)).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '?',
            close: parseFloat(c.close) || 0,
            open: parseFloat(c.open) || 0
          }));
          setCandles(formattedCandles);
        }

        // Fetch Trades
        const tradesRes = await axios.get(`${apiUrl}/trades?limit=10`);
        if (Array.isArray(tradesRes.data)) {
          setTrades(tradesRes.data);
        }

        setError(null);
      } catch (err) {
        console.error("Error fetching data:", err);
        if (err.response && err.response.status === 401) {
          handleLogout(); // Token invalid/expired
        } else {
          setError("Failed to connect to Boosis Bot. Is it running?");
          setData(prev => ({ ...prev, status: 'disconnected' }));
        }
      }
    };

    // Poll every 5 seconds
    fetchData();
    const interval = setInterval(fetchData, 5000);
    return () => clearInterval(interval);
  }, [token]);

  // LOGIN SCREEN
  if (!token) {
    return (
      <div style={{
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        height: '100vh',
        background: '#0d1117',
        color: '#c9d1d9',
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif'
      }}>
        <div style={{
          background: '#161b22',
          padding: '40px',
          borderRadius: '10px',
          border: '1px solid #30363d',
          boxShadow: '0 10px 40px rgba(0,0,0,0.5)',
          maxWidth: '400px',
          width: '100%',
          textAlign: 'center'
        }}>
          <div style={{ marginBottom: '20px', display: 'flex', justifyContent: 'center' }}>
            <div style={{ background: 'rgba(56, 139, 253, 0.15)', padding: '15px', borderRadius: '50%' }}>
              <Lock size={32} color="#58a6ff" />
            </div>
          </div>
          <h1 style={{ color: '#c9d1d9', marginBottom: '10px', fontSize: '24px' }}>Boosis Quant Bot</h1>
          <p style={{ color: '#8b949e', marginBottom: '30px' }}>Acceso Restringido</p>

          <input
            type="password"
            placeholder="Contraseña de acceso"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onKeyPress={(e) => {
              if (e.key === 'Enter') handleLogin();
            }}
            style={{
              width: '100%',
              padding: '12px',
              marginBottom: '15px',
              borderRadius: '6px',
              border: '1px solid #30363d',
              background: '#0d1117',
              color: 'white',
              fontSize: '16px',
              boxSizing: 'border-box',
              outline: 'none'
            }}
          />

          <button
            onClick={handleLogin}
            style={{
              width: '100%',
              padding: '12px',
              background: '#238636',
              color: 'white',
              border: 'none',
              borderRadius: '6px',
              fontSize: '16px',
              cursor: 'pointer',
              fontWeight: 'bold',
              transition: 'background 0.2s'
            }}
          >
            Iniciar Sesión
          </button>

          {loginError && (
            <div style={{ marginTop: '15px', color: '#da3633', fontSize: '14px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '5px' }}>
              <AlertTriangle size={14} /> {loginError}
            </div>
          )}
        </div>
      </div>
    );
  }

  const lastPrice = candles.length > 0 ? candles[candles.length - 1].close : 0;
  const totalBalance = data.balance ? (data.balance.usdt + (data.balance.asset * lastPrice)) : 0;

  return (
    <div className="dashboard-container">
      <header className="header">
        <div>
          <h1 style={{ marginBottom: '4px', fontSize: '1.5rem' }}>Boosis Quant Dashboard</h1>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#8b949e' }}>
            <Activity size={16} />
            <span>{data.bot}</span>
            <span>•</span>
            <span>{data.strategy}</span>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
          <div className={`status-badge ${data.status === 'online' ? '' : 'offline'}`}
            style={{ color: data.status === 'online' ? '#2ea043' : '#da3633', background: data.status === 'online' ? 'rgba(46,160,67,0.15)' : 'rgba(218,54,51,0.15)' }}>
            <div className="pulse" style={{ backgroundColor: 'currentColor' }}></div>
            {data.status.toUpperCase()}
          </div>

          <button onClick={handleLogout} style={{
            background: 'transparent',
            border: '1px solid #30363d',
            color: '#8b949e',
            padding: '5px 10px',
            borderRadius: '6px',
            cursor: 'pointer',
            fontSize: '12px'
          }}>
            Salir
          </button>
        </div>
      </header>

      {error && (
        <div style={{ padding: '12px', background: 'rgba(218,54,51,0.1)', color: '#da3633', borderRadius: '8px', marginBottom: '20px', display: 'flex', gap: '10px', alignItems: 'center' }}>
          <AlertTriangle size={20} />
          {error}
        </div>
      )}

      <div className="grid">
        {/* Sidebar Stats */}
        <aside className="sidebar panel">
          <div className="stat-card">
            <div className="stat-label flex items-center gap-2">
              <DollarSign size={14} /> Total Balance (USDT)
            </div>
            <div className="stat-value text-green-400">
              ${totalBalance.toFixed(2)}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4 mt-6">
            <div className="stat-small">
              <div className="stat-label">USDT Available</div>
              <div className="stat-value-small">${data.balance?.usdt?.toFixed(2) || '0.00'}</div>
            </div>
            <div className="stat-small">
              <div className="stat-label">BTC Asset</div>
              <div className="stat-value-small">{data.balance?.asset?.toFixed(4) || '0.0000'}</div>
            </div>
          </div>

          <div style={{ marginTop: 'auto', paddingTop: '20px' }}>
            <div className="stat-label flex items-center gap-2 mb-2">
              <ShieldCheck size={14} /> Mode
            </div>
            <div className="badge badge-blue">
              {data.paperTrading ? 'PAPER TRADING' : 'LIVE TRADING'}
            </div>
          </div>
        </aside>

        {/* Main Chart */}
        <main className="chart-container panel">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-lg font-semibold flex items-center gap-2">
              BTC/USDT Live Chart (5m)
            </h2>
            <div className="text-sm text-gray-400">
              Last Price: <span className="text-white font-bold">${lastPrice.toFixed(2)}</span>
            </div>
          </div>

          <div style={{ width: '100%', height: '400px' }}>
            <ResponsiveContainer>
              <LineChart data={candles}>
                <XAxis
                  dataKey="time"
                  stroke="#8b949e"
                  fontSize={12}
                  tickLine={false}
                  axisLine={false}
                />
                <YAxis
                  domain={['auto', 'auto']}
                  stroke="#8b949e"
                  fontSize={12}
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={(value) => value.toFixed(0)}
                />
                <Tooltip
                  contentStyle={{ backgroundColor: '#161b22', border: '1px solid #30363d', borderRadius: '6px' }}
                  itemStyle={{ color: '#c9d1d9' }}
                />
                <Line
                  type="monotone"
                  dataKey="close"
                  stroke="#58a6ff"
                  strokeWidth={2}
                  dot={false}
                  activeDot={{ r: 4, fill: '#58a6ff' }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </main>

        {/* Activity Feed */}
        <section className="activity-feed panel col-span-2">
          <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <TrendingUp size={16} /> Recent Bot Activity
          </h2>

          <div className="space-y-3">
            {trades.length === 0 ? (
              <div style={{ color: '#8b949e', fontStyle: 'italic', textAlign: 'center', padding: '20px' }}>
                No trades executed yet. Waiting for signals...
              </div>
            ) : (
              trades.map((trade, i) => (
                <div key={i} className="trade-item flex justify-between items-center p-3 bg-gray-800 rounded">
                  <div className="flex items-center gap-3">
                    <span className={`badge ${trade.side === 'BUY' ? 'badge-green' : 'badge-red'}`}>
                      {trade.side}
                    </span>
                    <span className="text-gray-300">{trade.symbol}</span>
                  </div>
                  <div className="text-right">
                    <div className="text-white font-mono">${trade.price}</div>
                    <div className="text-xs text-gray-500">
                      {new Date(parseInt(trade.timestamp)).toLocaleTimeString()}
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </section>
      </div>
    </div>
  )
}

export default App
