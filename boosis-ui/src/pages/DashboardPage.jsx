
import React, { useState } from 'react';
import MetricsRow from '../components/MetricsRow';
import Sidebar from '../components/Sidebar';
import PriceChart from '../components/PriceChart';
import ActivityPanel from '../components/ActivityPanel';
import { useLogs } from '../hooks/useLogs';
import '../components/Charts/Charts.css';

const DashboardPage = ({ data, candles, trades, health, metrics, token }) => {
    const [activeTab, setActiveTab] = useState('logs');
    const [selectedCurrency, setSelectedCurrency] = useState('BTCUSDT');
    const { logs, status: logsStatus, lastAttempt } = useLogs(token);

    const lastPrice = (candles && candles.length > 0 && candles[candles.length - 1].close !== null)
        ? candles[candles.length - 1].close
        : 0;
    const totalBalance = data.balance ? (Number(data.balance.usdt || 0) + (Number(data.balance.asset || 0) * lastPrice)) : 0;
    const realUsdt = parseFloat(data.realBalance?.find(b => b.asset === 'USDT')?.free || 0).toFixed(2);

    const currencies = ['BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'PEPEUSDT', 'WIFUSDT', 'BONKUSDT', 'DOGEUSDT', 'SHIBUSDT'];

    return (
        <div className="grid-layout">
            {/* TOP ROW: KEY METRICS */}
            <MetricsRow
                totalBalance={totalBalance}
                realUsdt={realUsdt}
                data={data}
                metrics={metrics}
                trades={trades}
            />

            {/* SIDEBAR AREA: SYSTEM & INDICATORS */}
            <Sidebar data={data} health={health} />

            {/* CURRENCY SELECTOR */}
            <div className="currency-selector-section">
                <label htmlFor="currency-select">Trading Pair:</label>
                <select 
                    id="currency-select"
                    value={selectedCurrency} 
                    onChange={(e) => setSelectedCurrency(e.target.value)}
                >
                    {currencies.map((curr) => (
                        <option key={curr} value={curr}>
                            {curr}
                        </option>
                    ))}
                </select>
            </div>

            {/* MAIN CHART AREA */}
            <PriceChart symbol={selectedCurrency} token={token} lastPrice={lastPrice} />

            {/* ACTIVITY AREA */}
            <ActivityPanel
                activeTab={activeTab}
                setActiveTab={setActiveTab}
                trades={trades}
                logs={logs}
                logsStatus={logsStatus}
                logsLastAttempt={lastAttempt}
            />
        </div>
    );
};

export default DashboardPage;

