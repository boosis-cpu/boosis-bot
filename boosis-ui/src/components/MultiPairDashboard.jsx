import React, { useState, useEffect } from 'react';
import { getStatus, addTradingPair, removeTradingPair, emergencyStop } from '../services/api';
import PairCard from './PairCard';
import PortfolioCard from './PortfolioCard';
import './MultiPairDashboard.css';

export default function MultiPairDashboard({ token }) {
    const [activeSymbols, setActiveSymbols] = useState(['BTCUSDT', 'SOLUSDT', 'PEPEUSDT', 'WIFUSDT', 'BONKUSDT', 'DOGEUSDT', 'SHIBUSDT', 'LINKUSDT', 'ETHUSDT', 'XRPUSDT', 'ADAUSDT', 'AVAXUSDT']);
    const [pairsData, setPairsData] = useState({});
    const [portfolio, setPortfolio] = useState(null);
    const [loading, setLoading] = useState(false);

    // Lista de soldados disponibles para el dashboard
    const ALL_SOLDIERS = ['BTC', 'SOL', 'PEPE', 'WIF', 'BONK', 'DOGE', 'SHIB', 'LINK', 'ETH', 'XRP', 'ADA', 'AVAX'];

    useEffect(() => {
        loadMultiPairData();
        const interval = setInterval(loadMultiPairData, 10000);
        return () => clearInterval(interval);
    }, [activeSymbols]);

    const delay = (ms) => new Promise(r => setTimeout(r, ms));

    const loadMultiPairData = async () => {
        try {
            setLoading(true);
            const data = {};
            const authToken = token || localStorage.getItem('boosis_token');

            for (let i = 0; i < activeSymbols.length; i++) {
                const symbol = activeSymbols[i];
                try {
                    const response = await getStatus(symbol);
                    data[symbol] = response.data;
                } catch (e) {
                    console.error(`Error cargando ${symbol}:`, e);
                }
                if (i < activeSymbols.length - 1) await delay(200);
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
        let totalNetPnL = 0;
        let totalTrades = 0;
        let winningTrades = 0;
        let pairBreakdown = [];

        const dataValues = Object.values(data);
        if (dataValues.length > 0) {
            // El USDT es el pool global de liquidez compartido
            globalUSDT = Number(dataValues[0].balance?.usdt) || 0;
        }

        // 1. Recorrer cada soldado (par) para sumar su valor y rendimiento
        for (const [symbol, pairData] of Object.entries(data)) {
            const assetValue = Number(pairData.balance?.assetValue) || 0;
            const pnl = Number(pairData.metrics?.netPnL) || 0;
            const trades = Number(pairData.metrics?.totalTrades || pairData.metrics?.trades) || 0;

            totalAssetValue += assetValue;
            totalNetPnL += pnl;
            totalTrades += trades;
            winningTrades += Number(pairData.metrics?.winningTrades) || 0;

            // Solo incluimos en el desglose lo que tenga valor o actividad
            if (assetValue > 0 || trades > 0) {
                pairBreakdown.push({
                    name: symbol.replace('USDT', ''),
                    value: assetValue,
                    trades: trades,
                    pnl: pnl,
                    isAsset: true
                });
            }
        }

        // 2. Definir el Valor Total de la Cartera (Equity)
        const totalEquity = globalUSDT + totalAssetValue;

        // 3. Añadir el USDT (Cash) al desglose de activos para el donut chart
        if (globalUSDT > 0) {
            pairBreakdown.unshift({
                name: 'USDT (Cash)',
                value: globalUSDT,
                trades: 0,
                pnl: 0,
                isAsset: false
            });
        }

        // El Capital Inicial Lógico es la Equity actual menos el PnL acumulado
        const logicalInitialCapital = totalEquity - totalNetPnL;

        setPortfolio({
            totalBalance: totalEquity,
            totalEquity: totalEquity,
            totalTrades,
            winRate: totalTrades > 0 ? (winningTrades / totalTrades * 100).toFixed(2) : 0,
            pairBreakdown,
            pnl: totalNetPnL,
            pnlPercent: logicalInitialCapital > 0 ? (totalNetPnL / logicalInitialCapital * 100).toFixed(2) : 0,
        });
    };

    const COLORS = ['#00ff88', '#00ffff', '#ff0080', '#ffaa00', '#ffea00', '#007aff', '#ff4d4d', '#a371f7'];

    return (
        <div className="multi-pair-dashboard">
            <div className="dashboard-header compact-header">
                {loading && <div className="loading-indicator">Refrescando Batallón...</div>}
                {Object.values(pairsData).some(p => p.emergencyStopped) && (
                    <div className="emergency-alert">
                        🚨 SISTEMA DETENIDO
                    </div>
                )}

                <button
                    className="emergency-btn-top"
                    onClick={async () => {
                        if (window.confirm("🚨 ¿Cerrar TODA la operación del Batallón Hormiga?")) {
                            try {
                                await emergencyStop();
                                window.location.reload();
                            } catch (e) { console.error(e); }
                        }
                    }}
                >
                    🛑 TERMINAR TODO
                </button>
            </div>

            <div className="pairs-grid">
                {activeSymbols.map((symbol, index) => (
                    <PairCard
                        key={symbol}
                        symbol={symbol}
                        data={pairsData[symbol]}
                        token={token || localStorage.getItem('boosis_token')}
                        loadDelay={index * 300}
                        onToggle={() => setTimeout(loadMultiPairData, 500)}
                    />
                ))}
            </div>

            {portfolio && (
                <PortfolioCard portfolio={portfolio} colors={COLORS} />
            )}
        </div>
    );
}
