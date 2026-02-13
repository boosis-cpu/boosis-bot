import { useState, useEffect } from 'react'
import axios from 'axios'
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts'
import { Activity, ShieldCheck, DollarSign, TrendingUp, AlertTriangle } from 'lucide-react'
import './index.css'

function App() {
  const [data, setData] = useState({
    status: 'offline',
    bot: 'Loading...',
    balance: { usdt: 0, asset: 0 },
    strategy: '',
    paperTrading: true
  })
  const [candles, setCandles] = useState([])
  const [trades, setTrades] = useState([])
  const [error, setError] = useState(null)

  const apiUrl = 'https://boosis.io/api'; // Pointing to our VPS API
  // const apiUrl = 'http://localhost:3000/api'; // Local dev mode

  useEffect(() => {
    const fetchData = async () => {
      try {
        // Fetch Status
        const statusRes = await axios.get('https://boosis.io/');
        setData(statusRes.data);

        // Fetch Candles
        const candlesRes = await axios.get(`${apiUrl}/candles?limit=50`);
        const formattedCandles = candlesRes.data.map(c => ({
          time: new Date(parseInt(c.close_time)).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          close: parseFloat(c.close),
          open: parseFloat(c.open)
        }));
        setCandles(formattedCandles);

        // Fetch Trades
        const tradesRes = await axios.get(`${apiUrl}/trades?limit=10`);
        setTrades(tradesRes.data);

        setError(null);
      } catch (err) {
        console.error("Error fetching data:", err);
        setError("Failed to connect to Boosis Bot. Is it running?");
        setData(prev => ({ ...prev, status: 'disconnected' }));
      }
    };

    // Poll every 5 seconds
    fetchData();
    const interval = setInterval(fetchData, 5000);
    return () => clearInterval(interval);
  }, []);

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

        <div className={`status-badge ${data.status === 'online' ? '' : 'offline'}`}
          style={{ color: data.status === 'online' ? '#2ea043' : '#da3633', background: data.status === 'online' ? 'rgba(46,160,67,0.15)' : 'rgba(218,54,51,0.15)' }}>
          <div className="pulse" style={{ backgroundColor: 'currentColor' }}></div>
          {data.status.toUpperCase()}
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
              ${(data.balance.usdt + (data.balance.asset * (candles[candles.length - 1]?.close || 0))).toFixed(2)}
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <div>
              <div className="stat-label">USDT Available</div>
              <div style={{ fontSize: '1.1rem', fontWeight: 600 }}>${data.balance.usdt.toFixed(2)}</div>
            </div>
            <div>
              <div className="stat-label">BTC Asset</div>
              <div style={{ fontSize: '1.1rem', fontWeight: 600 }}>{data.balance.asset.toFixed(4)}</div>
            </div>
          </div>

          <div className="stat-card" style={{ marginTop: 'auto' }}>
            <div className="stat-label flex items-center gap-2">
              <ShieldCheck size={14} /> Mode
            </div>
            <div style={{
              marginTop: '4px',
              padding: '4px 8px',
              background: data.paperTrading ? '#1f6feb22' : '#2ea04322',
              color: data.paperTrading ? '#58a6ff' : '#2ea043',
              borderRadius: '4px',
              display: 'inline-block',
              fontSize: '0.8rem',
              fontWeight: 600
            }}>
              {data.paperTrading ? 'PAPER TRADING' : 'REAL MONEY'}
            </div>
          </div>
        </aside>

        {/* Main Chart Area */}
        <main className="panel">
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '20px' }}>
            <h3>BTC/USDT Live Chart (5m)</h3>
            <div style={{ color: '#8b949e', fontSize: '0.9rem' }}>
              Last Price: <span style={{ color: '#e6edf3', fontWeight: 600 }}>${candles[candles.length - 1]?.close.toFixed(2)}</span>
            </div>
          </div>

          <div className="chart-container">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={candles}>
                <XAxis dataKey="time" stroke="#30363d" tick={{ fill: '#8b949e' }} />
                <YAxis domain={['auto', 'auto']} stroke="#30363d" tick={{ fill: '#8b949e' }} />
                <Tooltip
                  contentStyle={{ backgroundColor: '#161b22', border: '1px solid #30363d', color: '#e6edf3' }}
                  itemStyle={{ color: '#58a6ff' }}
                />
                <Line
                  type="monotone"
                  dataKey="close"
                  stroke="#58a6ff"
                  strokeWidth={2}
                  dot={false}
                  activeDot={{ r: 6 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>

          {/* Recent Trades List */}
          <div className="trades-list">
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px', color: '#8b949e' }}>
              <TrendingUp size={16} />
              <h4>Recent Bot Activity</h4>
            </div>

            {trades.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '20px', color: '#8b949e', fontSize: '0.9rem' }}>
                No trades executed yet. Waiting for signals...
              </div>
            ) : (
              trades.map((trade, idx) => (
                <div key={idx} className="trade-item">
                  <span style={{ fontWeight: 600 }} className={trade.side === 'BUY' ? 'trade-buy' : 'trade-sell'}>
                    {trade.side}
                  </span>
                  <span>{parseFloat(trade.amount).toFixed(5)} BTC @ ${parseFloat(trade.price).toFixed(2)}</span>
                  <span style={{ color: '#8b949e' }}>
                    {new Date(parseInt(trade.timestamp)).toLocaleTimeString()}
                  </span>
                </div>
              ))
            )}
          </div>
        </main>
      </div>
    </div>
  )
}

export default App
