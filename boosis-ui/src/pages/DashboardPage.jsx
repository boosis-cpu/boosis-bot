
import React, { useState } from 'react';
import MetricsRow from '../components/MetricsRow';
import Sidebar from '../components/Sidebar';
import GlobalMarketScanner from '../components/GlobalMarketScanner';
import ActivityPanel from '../components/ActivityPanel';
import { useLogs } from '../hooks/useLogs';
import '../components/Charts/Charts.css';

const DashboardPage = ({ data, trades, health, metrics, token }) => {
    const [activeTab, setActiveTab] = useState('logs');
    const { logs, status: logsStatus, lastAttempt } = useLogs(token);

    const realUsdt = parseFloat(data.realBalance?.find(b => b.asset === 'USDT')?.free || 0).toFixed(2);
    const totalBalance = data.totalBalanceUSD || data.totalEquity || 0;

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

            {/* MAIN QUANT TERMINAL AREA */}
            <div className="main-chart-area">
                <GlobalMarketScanner token={token} />
            </div>

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

