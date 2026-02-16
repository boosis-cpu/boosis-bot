
import React, { useState } from 'react';
import { runOptimization } from '../services/api';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip } from 'recharts';
import { FlaskConical, Play, CheckCircle } from 'lucide-react';

const OptimizerPage = () => {
    const [symbol, setSymbol] = useState('BTCUSDT');
    const [period, setPeriod] = useState('1m');
    const [loading, setLoading] = useState(false);
    const [results, setResults] = useState(null);

    const [baseParams, setBaseParams] = useState({
        rsi: { buy: 25, sell: 75 },
        ema: { short: 12, long: 26, trend: 50 },
        bb: { period: 20, stdDev: 2 },
        stopLoss: 0.02
    });

    const handleRun = async () => {
        setLoading(true);
        setResults(null);
        try {
            const res = await runOptimization(symbol, period, baseParams);
            setResults(res.data.results);
        } catch (e) {
            console.error(e);
            alert('Error optimizing: ' + (e.response?.data?.error || e.message));
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="optimizer-page" style={{ padding: '20px' }}>
            {/* Header */}
            <header className="panel" style={{ marginBottom: '20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                    <FlaskConical size={24} color="#a371f7" />
                    <h1 style={{ margin: 0, fontSize: '1.5rem', color: '#a371f7' }}>The Lab <span style={{ fontSize: '0.8rem', color: '#8b949e' }}>AI STRATEGY OPTIMIZER</span></h1>
                </div>

                <div style={{ display: 'flex', gap: '10px' }}>
                    <select
                        value={symbol}
                        onChange={e => setSymbol(e.target.value)}
                        style={{ background: '#0d1117', color: 'white', border: '1px solid #30363d', padding: '8px', borderRadius: '6px' }}
                    >
                        <option value="BTCUSDT">BTCUSDT</option>
                        <option value="ETHUSDT">ETHUSDT</option>
                        <option value="SOLUSDT">SOLUSDT</option>
                        <option value="XRPUSDT">XRPUSDT</option>
                    </select>
                    <select
                        value={period}
                        onChange={e => setPeriod(e.target.value)}
                        style={{ background: '#0d1117', color: 'white', border: '1px solid #30363d', padding: '8px', borderRadius: '6px' }}
                    >
                        <option value="1w">1 Week</option>
                        <option value="1m">1 Month</option>
                        <option value="3m">3 Months</option>
                    </select>
                    <button
                        onClick={handleRun}
                        disabled={loading}
                        style={{
                            background: loading ? '#21262d' : '#8957e5',
                            color: 'white',
                            border: 'none',
                            padding: '8px 20px',
                            borderRadius: '6px',
                            cursor: loading ? 'wait' : 'pointer',
                            fontWeight: 'bold',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '8px'
                        }}
                    >
                        {loading ? 'Optimizing...' : <><Play size={16} /> RUN SIMULATION</>}
                    </button>
                </div>
            </header>

            {/* Results Area */}
            {results && (
                <div className="grid-layout" style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '20px' }}>

                    {/* Main Chart: Compare ROI */}
                    <div className="panel" style={{ gridColumn: '1 / -1' }}>
                        <h3 style={{ marginBottom: '20px', color: '#8b949e' }}>Top Configurations (ROI %)</h3>
                        <div style={{ height: '300px' }}>
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart data={results.allResults.slice(0, 15)}>
                                    <XAxis
                                        dataKey="params.rsi.buy"
                                        tickFormatter={(val, i) => `RSI < ${val}`}
                                        interval={0}
                                        label={{ value: 'Configurations (RSI Buy Threshold)', position: 'insideBottom', offset: -5 }}
                                    />
                                    <YAxis />
                                    <Tooltip
                                        contentStyle={{ backgroundColor: '#161b22', border: '1px solid #30363d' }}
                                        cursor={{ fill: 'rgba(255,255,255,0.05)' }}
                                        formatter={(value) => [`${value}%`, 'ROI']}
                                    />
                                    <Bar dataKey="metrics.roi" fill="#8957e5" radius={[4, 4, 0, 0]} />
                                </BarChart>
                            </ResponsiveContainer>
                        </div>
                    </div>

                    {/* Best Config Card */}
                    <div className="panel" style={{ border: '1px solid #2ea043' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '15px' }}>
                            <CheckCircle size={20} color="#2ea043" />
                            <h3 style={{ margin: 0, color: '#2ea043' }}>Best Configuration</h3>
                        </div>

                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', fontSize: '14px' }}>
                            <div style={{ color: '#8b949e' }}>Net ROI:</div>
                            <div style={{ fontWeight: 'bold', color: '#2ea043' }}>+{results.bestConfig.metrics.roi}%</div>

                            <div style={{ color: '#8b949e' }}>Win Rate:</div>
                            <div>{results.bestConfig.metrics.winRate}%</div>

                            <div style={{ color: '#8b949e' }}>Profit Factor:</div>
                            <div>{results.bestConfig.metrics.profitFactor}</div>

                            <div style={{ color: '#8b949e' }}>Total Trades:</div>
                            <div>{results.bestConfig.metrics.totalTrades}</div>
                        </div>

                        <hr style={{ borderColor: '#30363d', margin: '15px 0' }} />

                        <h4 style={{ fontSize: '12px', color: '#8b949e', marginBottom: '10px' }}>RECOMMENDED SETTINGS</h4>
                        <div style={{ background: '#0d1117', padding: '10px', borderRadius: '6px', fontSize: '13px', fontFamily: 'monospace' }}>
                            <div>RSI Buy: <span style={{ color: '#58a6ff' }}>{results.bestConfig.params.rsi.buy}</span></div>
                            <div>RSI Sell: <span style={{ color: '#58a6ff' }}>{results.bestConfig.params.rsi.sell}</span></div>
                            <div>Stop Loss: <span style={{ color: '#f85149' }}>{(results.bestConfig.params.stopLoss * 100).toFixed(1)}%</span></div>
                        </div>
                    </div>

                    {/* Comparison */}
                    <div className="panel">
                        <h3 style={{ marginBottom: '15px', color: '#8b949e' }}>Improvement</h3>
                        <div style={{ textAlign: 'center', marginTop: '20px' }}>
                            <div style={{ fontSize: '12px', color: '#8b949e' }}>POTENTIAL UPLIFT</div>
                            <div style={{ fontSize: '3rem', fontWeight: '800', color: '#a371f7' }}>
                                +{(results.bestConfig.metrics.roi - (results.originalConfig?.metrics?.roi || 0)).toFixed(2)}%
                            </div>
                            <div style={{ fontSize: '12px', color: '#8b949e' }}>vs Original Strategy ({results.originalConfig?.metrics?.roi || 0}%)</div>
                        </div>
                    </div>

                </div>
            )}

            {!results && !loading && (
                <div style={{ textAlign: 'center', padding: '100px', color: '#8b949e' }}>
                    <FlaskConical size={48} style={{ opacity: 0.2, marginBottom: '20px' }} />
                    <p>Select a symbol and period to start finding the optimal strategy parameters.</p>
                </div>
            )}
        </div>
    );
};

export default OptimizerPage;
