
import React, { useState } from 'react';
import MetricsRow from '../components/MetricsRow';
import Sidebar from '../components/Sidebar';
import PriceChart from '../components/PriceChart';
import ActivityPanel from '../components/ActivityPanel';
import { useLogs } from '../hooks/useLogs';

const DashboardPage = ({ data, candles, trades, health, metrics, token }) => {
    const [activeTab, setActiveTab] = useState('logs');
    const { logs, status: logsStatus, lastAttempt } = useLogs(token);

    const lastPrice = (candles && candles.length > 0 && candles[candles.length - 1].close !== null)
        ? candles[candles.length - 1].close
        : 0;
    const totalBalance = data.balance ? (Number(data.balance.usdt || 0) + (Number(data.balance.asset || 0) * lastPrice)) : 0;
    const realUsdt = parseFloat(data.realBalance?.find(b => b.asset === 'USDT')?.free || 0).toFixed(2);

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

            {/* MAIN CHART AREA */}
            <PriceChart lastPrice={lastPrice} candles={candles} />

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
