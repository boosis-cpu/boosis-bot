
import React, { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useBotData } from './hooks/useBotData';
import { setTradingMode, emergencyStop, getStatus } from './services/api';
import ErrorBoundary from './components/ErrorBoundary';
import Header from './components/Header';
import NavTabs from './components/NavTabs';
import LoginPage from './pages/LoginPage';
import DashboardPage from './pages/DashboardPage';
import TheRefinery from './components/TheRefinery';
import MultiPairDashboard from './components/MultiPairDashboard';
import ConfirmationModal from './components/ConfirmationModal';
import OptimizerPage from './pages/OptimizerPage';
import './App.css';

function App() {
  const [token, setToken] = useState(localStorage.getItem('boosis_token'));
  const { data, candles, trades, health, metrics, loading, error, refetch } = useBotData(token);
  const [modal, setModal] = useState({ show: false, title: '', message: '', onConfirm: null, type: 'info' });

  const handleLogin = (newToken) => {
    setToken(newToken);
    localStorage.setItem('boosis_token', newToken);
  };

  const handleLogout = () => {
    setToken(null);
    localStorage.removeItem('boosis_token');
  };

  const handleToggleTradingMode = async () => {
    const targetLive = !!data.paperTrading;
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
          await setTradingMode(targetLive);
          refetch(); // Force update
          setModal({ ...modal, show: false });
        } catch (err) {
          console.error("Error changing mode", err);
          setModal({ ...modal, show: false });
        }
      },
      onClose: () => setModal({ ...modal, show: false })
    });
  };

  const handleEmergencyStop = () => {
    setModal({
      show: true,
      title: '🚨 PARADA DE EMERGENCIA',
      message: 'Esto detendrá INMEDIATAMENTE todas las operaciones del bot, cerrará la conexión con Binance y cambiará al modo PAPER. ¿Estás seguro?',
      type: 'danger',
      onConfirm: async () => {
        try {
          await emergencyStop();
          refetch();
          setModal({ ...modal, show: false });
        } catch (err) {
          console.error("Error emergency stop", err);
          setModal({ ...modal, show: false });
        }
      },
      onClose: () => setModal({ ...modal, show: false })
    });
  };

  if (!token) {
    return <ErrorBoundary><LoginPage onLogin={handleLogin} /></ErrorBoundary>;
  }

  return (
    <BrowserRouter>
      <ErrorBoundary>
        <div className={`dashboard-container ${data.emergencyStopped ? 'system-stopped' : ''}`}>
          {/* Emergency & Position Banners */}
          {data.emergencyStopped && (
            <div className="emergency-banner">
              <span>🛑 SISTEMA EN PARADA DE EMERGENCIA - TRADING DETENIDO</span>
              <button onClick={handleToggleTradingMode}>Reanudar Operación</button>
            </div>
          )}

          <Header
            data={data}
            toggleTradingMode={handleToggleTradingMode}
            emergencyStop={handleEmergencyStop}
            logout={handleLogout}
          />

          <NavTabs />

          <Routes>
            <Route path="/" element={
              <DashboardPage
                data={data}
                candles={candles}
                trades={trades}
                health={health}
                metrics={metrics}
                token={token}
              />
            } />
            <Route path="/refinery" element={<TheRefinery token={token} />} />
            <Route path="/multi" element={<MultiPairDashboard token={token} />} />
            <Route path="/lab" element={<OptimizerPage token={token} />} />
            <Route path="*" element={<Navigate to="/" />} />
          </Routes>

          {/* Global Modal */}
          <ConfirmationModal
            modal={modal}
            onConfirm={modal.onConfirm}
            onClose={() => setModal({ ...modal, show: false })}
          />
        </div>
      </ErrorBoundary>
    </BrowserRouter>
  );
}

export default App;
