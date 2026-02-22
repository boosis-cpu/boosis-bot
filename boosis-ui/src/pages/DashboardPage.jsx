
import React from 'react';
import Sidebar from '../components/Sidebar';
import GlobalMarketScanner from '../components/GlobalMarketScanner';
import { useLogs } from '../hooks/useLogs';
import '../components/Charts/Charts.css';

const DashboardPage = ({ data, health, token }) => {
    const { logs, status: logsStatus } = useLogs(token);

    return (
        <div className="grid-layout">
            {/* SIDEBAR: BINANCE + INVENTORY + SYSTEM VITALS + SYSTEM_KERNEL */}
            <Sidebar data={data} health={health} logs={logs} logsStatus={logsStatus} />

            {/* MAIN: GLOBAL MARKET SCANNER */}
            <div className="main-chart-area">
                <GlobalMarketScanner token={token} />
            </div>
        </div>
    );
};

export default DashboardPage;
