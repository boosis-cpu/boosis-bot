# Plan de Implementación: Boosis Quant Bot

Este documento detalla el estado actual y los próximos pasos para la construcción del bot de trading modular y profesional.

## 1. Estado Actual (✅ Completado)
### Arquitectura Modular
- Estructura de carpetas definida: `src/core`, `src/strategies`, `src/backtest`, `src/live`.
- Componentes Core implementados:
  - `data_miner.js`: Recolección de datos históricos.
  - `technical_indicators.js`: Cálculo de indicadores (RSI, EMAs, BB, ATR).
  - `logger.js`: Sistema de logs centralizado.
  - `config.js`: Configuración global.

### Estrategias
- Clase base `BaseStrategy` creada para estandarizar todas las estrategias.
- Primera implementación: `BoosisTrend` (Estrategia de seguimiento de tendencia con RSI y Bandas de Bollinger).

## 2. Próximos Pasos (🚧 En Progreso)

### Fase A: Limpieza y Migración
- [ ] Mover scripts de prueba y backtest "legacy" (`btc_*.js`, `binance_*.js`) a `archive/` o integrarlos en la nueva estructura.
- [ ] Centralizar el motor de backtesting en `src/backtest/BacktestEngine.js` para que pueda ejecutar cualquier estrategia de `src/strategies`.

### Fase B: Refinamiento de Estrategia
- [ ] Implementar optimización de parámetros para `BoosisTrend`.
- [ ] Agregar indicadores de volumen y análisis de order book (si es posible).

### Fase C: Ejecución en Vivo y Despliegue (Live Trading & VPS) 🚀
- [ ] **Configurar VPS:** Limpiar entorno y preparar Docker (Completado).
- [ ] **Dockerización:** Creados `Dockerfile` y `docker-compose.yml`.
- [ ] **Migración:** Mover el código actual al VPS `72.62.160.140`.
- [x] **Data Persistence:** Configurar PostgreSQL en Docker para guardar ticks e historial. (✅ Completado)
- [x] **LiveTrader.js:** Implementar conexión WebSocket activa con Binance. (✅ Completado)

### Fase D: Dashboard Visor (Interfaz Web) 🖥️
- [ ] **Frontend:** Crear visor en React/Vite para ver gráficas y operaciones.
- [ ] **Backend API:** Exponer endpoints para que la web consulte el estado del bot.
- [ ] **Interactive Control:** Sliders para ajustar estrategias sin código.

## 3. Notas Técnicas
- **Lenguaje**: Node.js
- **Dependencias Clave**: `axios` (API requests), `ws` (WebSockets), `chalk` (Logs), `dotenv` (Variables de entorno).
- **Base de Datos**: Archivos JSON locales por ahora (para simplicidad), posible migración a SQLite/monogDB si el volumen de datos crece.
