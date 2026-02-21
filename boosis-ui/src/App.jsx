import React, { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useBotData } from './hooks/useBotData';
import { setTradingMode, emergencyStop, setAuthToken } from './services/api';
import ErrorBoundary from './components/ErrorBoundary';
import Header from './components/Header';
import VerticalNav from './components/VerticalNav';
import LoginPage from './pages/LoginPage';
import DashboardPage from './pages/DashboardPage';
import ConfirmationModal from './components/ConfirmationModal';
import SniperTerminal from './pages/SniperTerminal';
import PatternVision from './pages/PatternVision';
import './App.css';

const AppContent = ({ token, data, candles, trades, health, metrics, handleToggleTradingMode, handleEmergencyStop, handleLogout, modal, setModal }) => {
  return (
    <div className={`dashboard-container ${data.emergencyStopped ? 'system-stopped' : ''}`}>
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

      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        <VerticalNav />
        <main style={{ flex: 1, overflowY: 'auto', position: 'relative', background: 'var(--bg-color)' }}>
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
            <Route path="/sniper" element={<SniperTerminal token={token} />} />
            <Route path="/vision" element={<PatternVision token={token} />} />
            <Route path="*" element={<Navigate to="/" />} />
          </Routes>
        </main>
      </div>

      <ConfirmationModal
        modal={modal}
        onConfirm={modal.onConfirm}
        onClose={() => setModal({ ...modal, show: false })}
      />
    </div>
  );
};

function App() {
  const [token, setToken] = useState(localStorage.getItem('boosis_token'));
  const { data, candles, trades, health, metrics, refetch } = useBotData(token);
  const [modal, setModal] = useState({ show: false, title: '', message: '', onConfirm: null, type: 'info' });

  useEffect(() => {
    setAuthToken(token);
  }, [token]);

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
          refetch();
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
        <AppContent
          token={token}
          data={data}
          candles={candles}
          trades={trades}
          health={health}
          metrics={metrics}
          handleToggleTradingMode={handleToggleTradingMode}
          handleEmergencyStop={handleEmergencyStop}
          handleLogout={handleLogout}
          modal={modal}
          setModal={setModal}
        />
      </ErrorBoundary>
    </BrowserRouter>
  );
}

export default App;
