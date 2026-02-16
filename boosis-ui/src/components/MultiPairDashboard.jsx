import React, { useState, useEffect } from 'react';
import axios from 'axios';
import PairCard from './PairCard';
import PortfolioCard from './PortfolioCard';

export default function MultiPairDashboard({ token }) {
    const [gridMode, setGridMode] = useState('2x2');
    const [activeSymbols, setActiveSymbols] = useState(['BTCUSDT', 'SOLUSDT', 'PEPEUSDT', 'ETHUSDT']);
    const [pairsData, setPairsData] = useState({});
    const [portfolio, setPortfolio] = useState(null);
    const [loading, setLoading] = useState(false);

    // Lista de soldados disponibles para el dashboard
    const ALL_SOLDIERS = ['BTC', 'SOL', 'PEPE', 'WIF', 'BONK', 'DOGE', 'SHIB', 'ETH', 'XRP', 'ADA'];

    useEffect(() => {
        loadMultiPairData();
        const interval = setInterval(loadMultiPairData, 5000);
        return () => clearInterval(interval);
    }, [activeSymbols]);

    const loadMultiPairData = async () => {
        try {
            setLoading(true);
            const data = {};
            const authToken = token || localStorage.getItem('token');

            for (const symbol of activeSymbols) {
                try {
                    const response = await axios.get(
                        `/api/status?symbol=${symbol}`,
                        { headers: { Authorization: `Bearer ${authToken}` } }
                    );
                    data[symbol] = response.data;
                } catch (e) {
                    console.error(`Error cargando ${symbol}:`, e);
                }
            }

            setPairsData(data);
            calculatePortfolio(data);
        } catch (error) {
            console.error('Error general de carga:', error);
        } finally {
            setLoading(false);
        }
    };

    const calculatePortfolio = (data) => {
        let totalAssetValue = 0;
        let globalUSDT = 0;
        let totalTrades = 0;
        let winningTrades = 0;
        let pairBreakdown = [];

        const dataValues = Object.values(data);
        if (dataValues.length > 0) {
            globalUSDT = Number(dataValues[0].balance?.usdt) || 0;
        }

        const firstPair = dataValues[0];
        const initialCapital = Number(firstPair?.initialCapital) || 1000;

        for (const [symbol, pairData] of Object.entries(data)) {
            const assetValue = Number(pairData.balance?.assetValue) || 0;
            totalAssetValue += assetValue;

            const trades = Number(pairData.metrics?.totalTrades || pairData.metrics?.trades) || 0;
            totalTrades += trades;
            winningTrades += Number(pairData.metrics?.winningTrades) || 0;

            pairBreakdown.push({
                name: symbol.replace('USDT', ''),
                value: assetValue,
                trades: trades,
            });
        }

        pairBreakdown.push({ name: 'CASH', value: globalUSDT, trades: 0 });

        const totalBalance = globalUSDT + totalAssetValue;

        setPortfolio({
            totalBalance,
            totalTrades,
            winRate: totalTrades > 0 ? (winningTrades / totalTrades * 100).toFixed(2) : 0,
            pairBreakdown,
            pnl: totalBalance - initialCapital,
            pnlPercent: initialCapital > 0 ? ((totalBalance - initialCapital) / initialCapital * 100).toFixed(2) : 0,
        });
    };

    if (!portfolio && loading) {
        return (
            <div className=\"flex h-64 items-center justify-center\">
                < div className =\"text-xl text-green-400 font-bold animate-pulse\">Desplegando infraestructura multi-activos... 🐜</div>
            </div >
        );
    }

    return (
        <div className=\"p-6\">
            < div className =\"mb-8 flex flex-col md:flex-row items-center justify-between gap-4\">
                < div >
                <h1 className=\"text-3xl font-black tracking-tighter text-green-400 uppercase\">
                    < span className =\"inline-block w-4 h-4 bg-green-500 mr-2 shadow-[0_0_15px_rgba(34,197,94,0.6)]\"></span>
                        Boosis Ant Army Dashboard
                    </h1 >
                </div >

        <div className=\"flex bg-gray-900/50 p-1 rounded-lg border border-gray-800\">
    {
        ['1', '2', '2x2', '4'].map(mode => (
            <button
                key={mode}
                onClick={() => setGridMode(mode)}
                className={`px-4 py-1.5 rounded text-xs font-bold transition-all ${gridMode === mode
                    ? 'bg-green-500 text-black'
                    : 'text-gray-400 hover:text-white'
                    }`}
            >
                {mode.toUpperCase()}
            </button>
        ))
    }
                </div >

        <div className=\"flex flex-wrap gap-3 bg-gray-900/30 p-2 rounded-xl border border-gray-800\">
    {
        ALL_SOLDIERS.map(symbol => (
            <label key={symbol} className=\"flex items-center gap-2 cursor-pointer group\">
        < input
                                type =\"checkbox\"
                                checked = { activeSymbols.includes(`${symbol}USDT`) }
                                onChange = {(e) => {
            const pair = `${symbol}USDT`;
            if(e.target.checked) {
            setActiveSymbols([...activeSymbols, pair]);
        } else {
            setActiveSymbols(activeSymbols.filter(s => s !== pair));
        }
    }
}
className =\"w-4 h-4 rounded border-gray-700 bg-gray-800 text-green-500 focus:ring-green-500\"
    />
    <span className=\"text-[10px] font-bold text-gray-400 group-hover:text-white\">{symbol}</span>
                        </label >
                    ))}
                </div >
            </div >

    <div className={`grid gap-6 ${gridMode === '2x2' ? 'grid-cols-2' : gridMode === '4' ? 'grid-cols-4' : 'grid-cols-1'}`}>
        {activeSymbols.map(symbol => (
            <PairCard
                key={symbol}
                symbol={symbol}
                data={pairsData[symbol]}
                token={token || localStorage.getItem('token')}
            />
        ))}

        <PortfolioCard portfolio={portfolio} />
    </div>
        </div >
    );
}
