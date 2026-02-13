# 📊 Informe Técnico Completo - Boosis Quant Bot

**Proyecto**: Sistema de Trading Algorítmico con Dashboard en Tiempo Real  
**Versión**: 1.0.0  
**Fecha**: 12 de Febrero de 2026  
**Entorno**: Producción (VPS) + Desarrollo Local  

---

## 📑 Tabla de Contenidos

1. [Resumen Ejecutivo](#resumen-ejecutivo)
2. [Arquitectura del Sistema](#arquitectura-del-sistema)
3. [Stack Tecnológico](#stack-tecnológico)
4. [Estructura del Proyecto](#estructura-del-proyecto)
5. [Flujo de Datos](#flujo-de-datos)
6. [Infraestructura y Deployment](#infraestructura-y-deployment)
7. [Seguridad](#seguridad)
8. [Conexiones Externas](#conexiones-externas)
9. [Monitoreo y Logs](#monitoreo-y-logs)
10. [Escalabilidad](#escalabilidad)

---

## 1. Resumen Ejecutivo

### Propósito del Sistema
Boosis Quant Bot es un sistema de trading algorítmico que:
- Ejecuta estrategias de trading automatizadas en el mercado de criptomonedas (BTC/USDT)
- Proporciona un dashboard web en tiempo real para monitoreo
- Opera en modo Paper Trading (simulación) con capacidad de migrar a trading real
- Consume datos en vivo de Binance US mediante WebSocket

### Componentes Principales
1. **Backend**: Servidor Node.js con Express que ejecuta la lógica de trading
2. **Frontend**: Dashboard React con gráficos interactivos
3. **Infraestructura**: Docker Compose con Traefik como reverse proxy
4. **Base de Datos**: PostgreSQL (configurada pero actualmente en memoria)

---

## 2. Arquitectura del Sistema

### Diagrama de Arquitectura

```
┌─────────────────────────────────────────────────────────────────┐
│                         INTERNET                                 │
└────────────────────────┬────────────────────────────────────────┘
                         │
                         │ HTTPS (443)
                         │ HTTP (80 → redirect 443)
                         ▼
┌─────────────────────────────────────────────────────────────────┐
│                    VPS (72.62.160.140)                           │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │              Traefik (Reverse Proxy)                       │  │
│  │  - SSL/TLS Termination (Let's Encrypt)                    │  │
│  │  - Routing: boosis.io → boosis-bot:3000                   │  │
│  │  - Auto Certificate Renewal                               │  │
│  └──────────────────────┬────────────────────────────────────┘  │
│                         │                                        │
│                         │ HTTP (Internal)                        │
│                         ▼                                        │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │           boosis-bot (Node.js Container)                   │  │
│  │  ┌─────────────────────────────────────────────────────┐  │  │
│  │  │  Express Server (Port 3000)                         │  │  │
│  │  │  ├─ Static Files (React Build)                      │  │  │
│  │  │  ├─ API Endpoints:                                  │  │  │
│  │  │  │  • GET /api/status                               │  │  │
│  │  │  │  • GET /api/candles?limit=N                      │  │  │
│  │  │  │  • GET /api/trades?limit=N                       │  │  │
│  │  │  └─ CORS Enabled                                    │  │  │
│  │  └─────────────────────────────────────────────────────┘  │  │
│  │  ┌─────────────────────────────────────────────────────┐  │  │
│  │  │  LiveTrader (Trading Engine)                        │  │  │
│  │  │  ├─ WebSocket Client → Binance US                   │  │  │
│  │  │  ├─ Strategy Executor (BoosisTrend)                 │  │  │
│  │  │  ├─ Paper Trading Simulator                         │  │  │
│  │  │  └─ In-Memory Data Store                            │  │  │
│  │  │     • Candles Array (last 200)                      │  │  │
│  │  │     • Trades Array                                  │  │  │
│  │  │     • Balance Object                                │  │  │
│  │  └─────────────────────────────────────────────────────┘  │  │
│  └───────────────────────────────────────────────────────────┘  │
│                         │                                        │
│                         │ (Future: PostgreSQL Connection)        │
│                         ▼                                        │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │           boosis-db (PostgreSQL Container)                 │  │
│  │  - Port: 5432 (internal only)                             │  │
│  │  - Database: boosis_db                                    │  │
│  │  - User: boosis_admin                                     │  │
│  │  - Schema: candles, trades tables                         │  │
│  │  - Status: Configurado pero no activo                     │  │
│  └───────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
                         │
                         │ WebSocket (WSS)
                         ▼
┌─────────────────────────────────────────────────────────────────┐
│              Binance US API                                      │
│  - WebSocket: wss://stream.binance.us:9443/ws/btcusdt@kline_5m │
│  - REST API: https://api.binance.us/api/v3                     │
└─────────────────────────────────────────────────────────────────┘
```

### Arquitectura de Red

```
┌─────────────────────────────────────────────────────────────────┐
│                    Docker Networks                               │
│                                                                  │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │  boosis_traefik_net (Bridge Network)                       │ │
│  │  ├─ traefik (172.x.x.2)                                    │ │
│  │  └─ boosis-bot (172.x.x.3)                                 │ │
│  └────────────────────────────────────────────────────────────┘ │
│                                                                  │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │  boosis-bot_default (Bridge Network)                       │ │
│  │  ├─ boosis-bot (172.y.y.2)                                 │ │
│  │  └─ boosis-db (172.y.y.3)                                  │ │
│  └────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
```

---

## 3. Stack Tecnológico

### Backend

| Componente | Tecnología | Versión | Propósito |
|------------|------------|---------|-----------|
| Runtime | Node.js | 20 LTS | Entorno de ejecución JavaScript |
| Framework Web | Express | 5.2.1 | Servidor HTTP y API REST |
| WebSocket Client | ws | 8.19.0 | Conexión en tiempo real con Binance |
| HTTP Client | axios | 1.13.5 | Peticiones HTTP a APIs externas |
| Database Driver | pg | 8.18.0 | Cliente PostgreSQL |
| CORS | cors | 2.8.6 | Cross-Origin Resource Sharing |
| Environment | dotenv | 17.2.4 | Gestión de variables de entorno |
| Logging | chalk | 5.6.2 | Logs con colores en terminal |

### Frontend

| Componente | Tecnología | Versión | Propósito |
|------------|------------|---------|-----------|
| Framework | React | 19.2.0 | UI Library |
| Build Tool | Vite | 7.3.1 | Bundler y dev server |
| HTTP Client | axios | 1.13.5 | Peticiones a la API |
| Charts | Recharts | 3.7.0 | Gráficos interactivos |
| Icons | lucide-react | 0.563.0 | Iconografía |
| Date Utils | date-fns | 4.1.0 | Manipulación de fechas |
| Linter | ESLint | 9.39.1 | Análisis estático de código |

### Infraestructura

| Componente | Tecnología | Versión | Propósito |
|------------|------------|---------|-----------|
| Containerization | Docker | Latest | Aislamiento de aplicaciones |
| Orchestration | Docker Compose | v2 | Gestión multi-contenedor |
| Reverse Proxy | Traefik | 2.11 | Routing y SSL |
| SSL Provider | Let's Encrypt | ACME v2 | Certificados SSL gratuitos |
| Database | PostgreSQL | 15-alpine | Persistencia de datos |
| OS (Container) | Debian (node:20-slim) | - | Base image ligera |

### Herramientas de Desarrollo

| Herramienta | Propósito |
|-------------|-----------|
| Git | Control de versiones |
| GitHub | Repositorio remoto |
| rsync | Sincronización de archivos al VPS |
| expect | Automatización de comandos SSH |
| openssl | Verificación de certificados SSL |

---

## 4. Estructura del Proyecto

### Árbol de Directorios

```
boosis-bot/
├── src/                          # Código fuente del backend
│   ├── core/                     # Módulos core
│   │   ├── config.js            # Configuración global
│   │   ├── database.js          # Cliente PostgreSQL
│   │   ├── data_miner.js        # Descarga de datos históricos
│   │   ├── logger.js            # Sistema de logging
│   │   └── technical_indicators.js  # Indicadores técnicos (SMA, EMA)
│   ├── strategies/              # Estrategias de trading
│   │   ├── BaseStrategy.js      # Clase base abstracta
│   │   └── BoosisTrend.js       # Estrategia de seguimiento de tendencia
│   ├── live/                    # Trading en vivo
│   │   └── LiveTrader.js        # Motor principal del bot
│   └── backtest/                # Sistema de backtesting
│       └── engine.js            # Motor de backtesting
│
├── boosis-ui/                   # Frontend React
│   ├── src/
│   │   ├── App.jsx              # Componente principal del dashboard
│   │   ├── main.jsx             # Entry point de React
│   │   ├── index.css            # Estilos globales
│   │   └── assets/              # Recursos estáticos
│   ├── public/                  # Archivos públicos
│   ├── index.html               # HTML template
│   ├── vite.config.js           # Configuración de Vite
│   ├── package.json             # Dependencias del frontend
│   └── eslint.config.js         # Configuración de linter
│
├── public/                      # Build de producción (generado)
│   ├── index.html
│   ├── vite.svg
│   └── assets/
│       ├── index-[hash].css
│       └── index-[hash].js
│
├── data/                        # Datos persistentes (volumen Docker)
├── logs/                        # Logs del bot (volumen Docker)
├── letsencrypt/                 # Certificados SSL
│   └── acme.json               # Almacén de certificados
│
├── *.exp                        # Scripts de automatización (expect)
│   ├── full_deploy.exp         # Deploy completo
│   ├── force_rebuild.exp       # Rebuild sin caché
│   ├── check_vps_logs.exp      # Ver logs del VPS
│   └── ...                     # Otros scripts de utilidad
│
├── docker-compose.yml           # Orquestación de servicios
├── Dockerfile                   # Imagen del bot
├── package.json                 # Dependencias del backend
├── run_backtest.js             # Script de backtesting
├── DEPLOYMENT_GUIDE.md         # Guía de deployment
└── PLAN.md                     # Plan del proyecto
```

### Descripción de Módulos Clave

#### `src/live/LiveTrader.js` (Motor Principal)
```javascript
class LiveTrader {
  constructor() {
    this.strategy = new BoosisTrend();  // Estrategia activa
    this.candles = [];                  // Buffer de velas (últimas 200)
    this.trades = [];                   // Historial de trades
    this.ws = null;                     // Conexión WebSocket
    this.app = express();               // Servidor Express
    this.balance = { usdt: 1000, asset: 0 };  // Balance simulado
    this.paperTrading = true;           // Modo Paper Trading
  }
  
  // Métodos principales:
  // - setupServer()         → Configura Express y endpoints
  // - start()               → Inicia servidor y WebSocket
  // - loadHistoricalData()  → Carga velas iniciales
  // - connectWebSocket()    → Conecta a Binance
  // - handleKlineMessage()  → Procesa velas en tiempo real
  // - executeStrategy()     → Ejecuta lógica de trading
  // - executePaperTrade()   → Simula operaciones
}
```

#### `src/strategies/BoosisTrend.js` (Estrategia)
```javascript
class BoosisTrend extends BaseStrategy {
  constructor() {
    this.name = 'Boosis Trend Follower';
    this.emaShort = 9;   // EMA corta
    this.emaLong = 21;   // EMA larga
    this.position = null;
  }
  
  onCandle(latestCandle, history) {
    // Calcula EMAs
    // Detecta cruces (Golden Cross / Death Cross)
    // Retorna señal: { action: 'BUY'|'SELL', price, reason }
  }
}
```

#### `boosis-ui/src/App.jsx` (Dashboard)
```javascript
function App() {
  const [data, setData] = useState({...});      // Estado del bot
  const [candles, setCandles] = useState([]);   // Velas para gráfico
  const [trades, setTrades] = useState([]);     // Trades recientes
  
  useEffect(() => {
    // Polling cada 5 segundos
    const fetchData = async () => {
      await axios.get('/api/status');
      await axios.get('/api/candles?limit=50');
      await axios.get('/api/trades?limit=10');
    };
    
    const interval = setInterval(fetchData, 5000);
    return () => clearInterval(interval);
  }, []);
  
  // Renderiza:
  // - Header con estado del bot
  // - Sidebar con balance
  // - Gráfico de BTC/USDT
  // - Lista de trades recientes
}
```

---

## 5. Flujo de Datos

### 5.1 Flujo de Trading en Tiempo Real

```
┌──────────────┐
│ Binance US   │
│ WebSocket    │
└──────┬───────┘
       │ 1. Envía vela cada 5 minutos
       │    (kline data: OHLCV)
       ▼
┌──────────────────────────────────────────┐
│ LiveTrader.handleKlineMessage()          │
│ - Valida si la vela está cerrada (x=true)│
│ - Añade vela al buffer (this.candles)    │
│ - Mantiene solo últimas 200 velas        │
└──────┬───────────────────────────────────┘
       │ 2. Vela cerrada confirmada
       ▼
┌──────────────────────────────────────────┐
│ LiveTrader.executeStrategy()             │
│ - Pasa vela y historial a la estrategia  │
└──────┬───────────────────────────────────┘
       │ 3. Calcula indicadores
       ▼
┌──────────────────────────────────────────┐
│ BoosisTrend.onCandle()                   │
│ - Calcula EMA(9) y EMA(21)               │
│ - Detecta cruces                         │
│ - Genera señal si hay oportunidad        │
└──────┬───────────────────────────────────┘
       │ 4. Retorna señal (BUY/SELL) o null
       ▼
┌──────────────────────────────────────────┐
│ LiveTrader.executeTrade()                │
│ - Verifica modo (Paper/Real)             │
└──────┬───────────────────────────────────┘
       │ 5. Modo Paper Trading
       ▼
┌──────────────────────────────────────────┐
│ LiveTrader.executePaperTrade()           │
│ - Simula compra/venta                    │
│ - Actualiza balance virtual              │
│ - Guarda trade en this.trades[]          │
│ - Log de la operación                    │
└──────────────────────────────────────────┘
```

### 5.2 Flujo de Peticiones del Dashboard

```
┌──────────────┐
│ React App    │
│ (Browser)    │
└──────┬───────┘
       │ Polling cada 5s
       │
       │ GET /api/status
       ├──────────────────────────────────────┐
       │                                      │
       ▼                                      ▼
┌──────────────────┐              ┌──────────────────┐
│ Traefik          │              │ Express Server   │
│ (SSL Termination)│──────────────▶│ Port 3000        │
└──────────────────┘   HTTPS→HTTP └────────┬─────────┘
                                            │
       ┌────────────────────────────────────┤
       │                                    │
       │ GET /api/candles?limit=50          │ GET /api/trades?limit=10
       │                                    │
       ▼                                    ▼
┌──────────────────────┐         ┌──────────────────────┐
│ Endpoint Handler     │         │ Endpoint Handler     │
│ - Lee this.candles   │         │ - Lee this.trades    │
│ - Formatea datos     │         │ - Limita resultados  │
│ - Retorna JSON       │         │ - Retorna JSON       │
└──────┬───────────────┘         └──────┬───────────────┘
       │                                │
       │ Response                       │ Response
       ▼                                ▼
┌──────────────────────────────────────────────────────┐
│ React App                                            │
│ - Actualiza estado (setData, setCandles, setTrades) │
│ - Re-renderiza componentes                          │
│ - Actualiza gráfico con Recharts                    │
└──────────────────────────────────────────────────────┘
```

### 5.3 Flujo de Deployment

```
┌──────────────────┐
│ Desarrollo Local │
└────────┬─────────┘
         │ 1. Editar código
         ▼
┌──────────────────┐
│ npm run build    │ (Frontend)
│ - Vite compila   │
│ - Output: public/│
└────────┬─────────┘
         │ 2. Build completado
         ▼
┌──────────────────────────────────┐
│ ./full_deploy.exp                │
│ ┌──────────────────────────────┐ │
│ │ 1. rsync → VPS               │ │
│ │    - Excluye node_modules    │ │
│ │    - Sincroniza src/, public/│ │
│ └──────────────────────────────┘ │
│ ┌──────────────────────────────┐ │
│ │ 2. SSH → VPS                 │ │
│ │    docker compose up -d      │ │
│ │    --build --remove-orphans  │ │
│ └──────────────────────────────┘ │
└────────┬─────────────────────────┘
         │ 3. Docker build
         ▼
┌──────────────────────────────────┐
│ VPS: Docker Build                │
│ - FROM node:20-slim              │
│ - COPY package*.json             │
│ - RUN npm install --production   │
│ - COPY . .                       │
│ - CMD ["node", "src/live/..."]   │
└────────┬─────────────────────────┘
         │ 4. Contenedor iniciado
         ▼
┌──────────────────────────────────┐
│ Traefik detecta nuevo contenedor│
│ - Lee labels de Docker           │
│ - Configura routing automático   │
│ - Solicita certificado SSL       │
└────────┬─────────────────────────┘
         │ 5. Servicio activo
         ▼
┌──────────────────────────────────┐
│ https://boosis.io                │
│ ✅ Dashboard accesible           │
└──────────────────────────────────┘
```

---

## 6. Infraestructura y Deployment

### 6.1 Configuración del VPS

| Parámetro | Valor |
|-----------|-------|
| **Proveedor** | Hostinger VPS |
| **IP Pública** | 72.62.160.140 |
| **Sistema Operativo** | Linux (Ubuntu/Debian) |
| **Docker** | Instalado |
| **Docker Compose** | v2 |
| **Puertos Abiertos** | 80 (HTTP), 443 (HTTPS), 22 (SSH) |
| **Firewall** | UFW configurado |

### 6.2 Configuración DNS

| Tipo | Nombre | Contenido | TTL |
|------|--------|-----------|-----|
| A | boosis.io | 72.62.160.140 | 14400 |
| ~~CNAME~~ | ~~www~~ | ~~boosis.io~~ | ~~14400~~ (Eliminado) |

### 6.3 Docker Compose Services

```yaml
services:
  traefik:
    image: traefik:v2.11
    ports:
      - "80:80"      # HTTP (redirect a HTTPS)
      - "443:443"    # HTTPS
    volumes:
      - ./letsencrypt:/letsencrypt
      - /var/run/docker.sock:/var/run/docker.sock:ro
    command:
      - --providers.docker=true
      - --entrypoints.web.address=:80
      - --entrypoints.websecure.address=:443
      - --certificatesresolvers.myresolver.acme.tlschallenge=true
      - --certificatesresolvers.myresolver.acme.email=tony@boosis.io
    networks:
      - traefik_net

  boosis-bot:
    build: .
    environment:
      - NODE_ENV=production
      - DB_HOST=db
      - DB_USER=boosis_admin
      - DB_PASS=boosis_secure_pass_2026
      - DB_NAME=boosis_db
    volumes:
      - ./data:/app/data
      - ./logs:/app/logs
    labels:
      - traefik.enable=true
      - traefik.http.routers.boosis.rule=Host(`boosis.io`)
      - traefik.http.routers.boosis.entrypoints=websecure
      - traefik.http.routers.boosis.tls.certresolver=myresolver
      - traefik.http.services.boosis.loadbalancer.server.port=3000
    networks:
      - traefik_net
      - default

  db:
    image: postgres:15-alpine
    environment:
      - POSTGRES_USER=boosis_admin
      - POSTGRES_PASSWORD=boosis_secure_pass_2026
      - POSTGRES_DB=boosis_db
    volumes:
      - postgres_data:/var/lib/postgresql/data
    networks:
      - default
```

### 6.4 Dockerfile

```dockerfile
FROM node:20-slim

WORKDIR /app

# Instalar dependencias
COPY package*.json ./
RUN npm install --production

# Copiar código
COPY . .

# Exponer puerto
EXPOSE 3000

# Ejecutar bot
CMD ["node", "src/live/LiveTrader.js"]
```

### 6.5 Proceso de Deployment

1. **Desarrollo Local**
   ```bash
   cd boosis-ui
   npm run build  # Genera public/
   cd ..
   ```

2. **Deploy al VPS**
   ```bash
   ./full_deploy.exp
   ```
   
   Internamente ejecuta:
   ```bash
   # Sincronizar archivos
   rsync -avz --exclude 'node_modules' ./ root@72.62.160.140:~/boosis-bot/
   
   # Reiniciar servicios
   ssh root@72.62.160.140 "cd ~/boosis-bot && docker compose up -d --build"
   ```

3. **Verificación**
   ```bash
   ./check_vps_logs.exp
   ```

---

## 7. Seguridad

### 7.1 Capa de Transporte

| Aspecto | Implementación |
|---------|----------------|
| **SSL/TLS** | Let's Encrypt (TLS 1.2+) |
| **Certificado** | Renovación automática cada 90 días |
| **HTTPS Redirect** | Forzado desde puerto 80 → 443 |
| **HSTS** | No implementado (recomendado añadir) |

### 7.2 Autenticación y Autorización

| Componente | Estado Actual | Recomendación |
|------------|---------------|---------------|
| **Dashboard** | Sin autenticación | ⚠️ Implementar login (JWT/OAuth) |
| **API Endpoints** | Públicos | ⚠️ Añadir API keys o tokens |
| **SSH** | Password-based | ⚠️ Migrar a SSH keys |
| **Database** | Credenciales en docker-compose | ⚠️ Usar Docker secrets |

### 7.3 Gestión de Secretos

**Estado Actual:**
- Credenciales en `docker-compose.yml` (texto plano)
- No hay archivo `.env` en producción

**Recomendaciones:**
```bash
# Crear archivo .env en el VPS
DB_USER=boosis_admin
DB_PASS=<password_seguro>
DB_NAME=boosis_db
BINANCE_API_KEY=<key>
BINANCE_SECRET=<secret>
```

```yaml
# docker-compose.yml
services:
  boosis-bot:
    env_file:
      - .env
```

### 7.4 Seguridad de Red

| Medida | Estado |
|--------|--------|
| **Firewall (UFW)** | ✅ Activo |
| **Puertos Expuestos** | Solo 22, 80, 443 |
| **Docker Networks** | Aisladas (traefik_net, default) |
| **Database** | Solo accesible internamente |

### 7.5 Vulnerabilidades Conocidas

| Vulnerabilidad | Severidad | Mitigación |
|----------------|-----------|------------|
| Dashboard sin auth | 🔴 Alta | Implementar autenticación |
| Credenciales en código | 🟡 Media | Migrar a variables de entorno |
| No hay rate limiting | 🟡 Media | Implementar en Traefik |
| Logs sin rotación | 🟢 Baja | Configurar logrotate |

---

## 8. Conexiones Externas

### 8.1 Binance US API

**WebSocket Endpoint:**
```
wss://stream.binance.us:9443/ws/btcusdt@kline_5m
```

**Propósito:** Recibir velas de 5 minutos en tiempo real

**Protocolo:** WebSocket (WSS)

**Frecuencia:** Cada 5 minutos (cuando cierra una vela)

**Datos Recibidos:**
```json
{
  "e": "kline",
  "k": {
    "t": 1707782400000,  // Open time
    "T": 1707782699999,  // Close time
    "o": "66541.51",     // Open
    "h": "66600.00",     // High
    "l": "66500.00",     // Low
    "c": "66541.51",     // Close
    "v": "0.0039",       // Volume
    "x": true            // Is candle closed?
  }
}
```

**REST API Endpoint:**
```
https://api.binance.us/api/v3/klines
```

**Propósito:** Cargar datos históricos al iniciar

**Método:** GET

**Parámetros:**
- `symbol=BTCUSDT`
- `interval=5m`
- `limit=100`

**Autenticación:** No requerida (datos públicos)

**Rate Limits:**
- WebSocket: Sin límite
- REST API: 1200 requests/minuto

### 8.2 Let's Encrypt ACME

**Endpoint:**
```
https://acme-v02.api.letsencrypt.org/directory
```

**Propósito:** Obtener y renovar certificados SSL

**Protocolo:** HTTPS (ACME Challenge)

**Frecuencia:** 
- Inicial: Al desplegar
- Renovación: Cada 60 días (automático)

**Rate Limits:**
- 5 certificados por dominio/semana
- 50 certificados por cuenta/semana

### 8.3 GitHub

**Repositorio:**
```
https://github.com/boosis-cpu/boosis-bot.git
```

**Propósito:** Control de versiones

**Protocolo:** HTTPS (Git)

**Autenticación:** Personal Access Token

---

## 9. Monitoreo y Logs

### 9.1 Sistema de Logging

**Backend (LiveTrader):**
```javascript
// src/core/logger.js
logger.info("Mensaje informativo");
logger.success("Operación exitosa");
logger.warn("Advertencia");
logger.error("Error crítico");
```

**Formato:**
```
[7:10:23 PM] [INFO] Initializing Boosis Live Trader
[7:10:24 PM] [SUCCESS] Web server listening on port 3000
[7:10:25 PM] [SUCCESS] Connected to Binance WebSocket
```

**Ubicación:**
- Desarrollo: `stdout` (terminal)
- Producción: `docker logs boosis-bot`

### 9.2 Logs de Docker

```bash
# Ver logs en tiempo real
docker logs -f boosis-bot

# Ver últimas 50 líneas
docker logs --tail 50 boosis-bot

# Ver logs con timestamps
docker logs -t boosis-bot
```

### 9.3 Métricas Disponibles

| Métrica | Fuente | Acceso |
|---------|--------|--------|
| **Balance** | `/api/status` | Dashboard |
| **Trades Ejecutados** | `/api/trades` | Dashboard |
| **Precio Actual** | `/api/candles` | Dashboard |
| **Estado del Bot** | `/api/status` | Dashboard |
| **Uptime** | `docker ps` | SSH |
| **Uso de CPU/RAM** | `docker stats` | SSH |

### 9.4 Alertas

**Estado Actual:** No implementadas

**Recomendaciones:**
- Webhook a Discord/Telegram cuando se ejecuta un trade
- Email si el bot se desconecta de Binance
- Alerta si el balance cae por debajo de un umbral

---

## 10. Escalabilidad

### 10.1 Limitaciones Actuales

| Aspecto | Limitación | Impacto |
|---------|------------|---------|
| **Almacenamiento** | En memoria (volátil) | Pérdida de datos al reiniciar |
| **Concurrencia** | Single-threaded | No puede procesar múltiples pares |
| **Redundancia** | Instancia única | Sin failover |
| **Monitoreo** | Logs básicos | Difícil detectar problemas |

### 10.2 Plan de Escalabilidad

#### Fase 1: Persistencia (Corto Plazo)
```javascript
// Activar PostgreSQL
const db = require('./core/database');

// Al recibir vela
await db.saveCandle({
  symbol: 'BTCUSDT',
  interval: '5m',
  openTime: candle[0],
  closeTime: candle[6],
  open: candle[1],
  high: candle[2],
  low: candle[3],
  close: candle[4],
  volume: candle[5]
});

// Al ejecutar trade
await db.saveTrade({
  symbol: 'BTCUSDT',
  strategy: 'BoosisTrend',
  side: 'BUY',
  price: signal.price,
  amount: amountAsset,
  timestamp: Date.now(),
  isPaper: true
});
```

#### Fase 2: Multi-Par (Mediano Plazo)
```javascript
// Soportar múltiples pares
const pairs = ['BTCUSDT', 'ETHUSDT', 'BNBUSDT'];

pairs.forEach(pair => {
  const trader = new LiveTrader(pair);
  trader.start();
});
```

#### Fase 3: Microservicios (Largo Plazo)
```
┌─────────────────┐
│ API Gateway     │
└────────┬────────┘
         │
    ┌────┴────┬────────┬────────┐
    │         │        │        │
┌───▼───┐ ┌──▼──┐ ┌───▼───┐ ┌──▼──┐
│Trading│ │Data │ │Strategy│ │API  │
│Engine │ │Store│ │Executor│ │Server│
└───────┘ └─────┘ └────────┘ └─────┘
```

### 10.3 Optimizaciones Recomendadas

1. **Caching**
   - Redis para velas recientes
   - Reduce carga en PostgreSQL

2. **Load Balancing**
   - Múltiples instancias del bot
   - Traefik distribuye tráfico

3. **Message Queue**
   - RabbitMQ/Kafka para señales de trading
   - Desacopla estrategia de ejecución

4. **Monitoring**
   - Prometheus + Grafana
   - Alertas automáticas

---

## 11. Anexos

### 11.1 Variables de Entorno

| Variable | Descripción | Valor Actual | Requerida |
|----------|-------------|--------------|-----------|
| `NODE_ENV` | Entorno de ejecución | `production` | Sí |
| `DB_HOST` | Host de PostgreSQL | `db` | Sí |
| `DB_USER` | Usuario de DB | `boosis_admin` | Sí |
| `DB_PASS` | Contraseña de DB | `boosis_secure_pass_2026` | Sí |
| `DB_NAME` | Nombre de DB | `boosis_db` | Sí |
| `PORT` | Puerto del servidor | `3000` (hardcoded) | No |

### 11.2 Endpoints API

#### GET /api/status
**Descripción:** Estado actual del bot

**Response:**
```json
{
  "status": "online",
  "bot": "Boosis Quant Bot",
  "strategy": "Boosis Trend Follower",
  "symbol": "BTCUSDT",
  "paperTrading": true,
  "balance": {
    "usdt": 1000,
    "asset": 0
  }
}
```

#### GET /api/candles?limit=N
**Descripción:** Últimas N velas

**Parámetros:**
- `limit` (opcional): Número de velas (default: 100)

**Response:**
```json
[
  {
    "open_time": 1707782400000,
    "open": 66541.51,
    "high": 66600.00,
    "low": 66500.00,
    "close": 66541.51,
    "volume": 0.0039,
    "close_time": 1707782699999
  }
]
```

#### GET /api/trades?limit=N
**Descripción:** Últimos N trades

**Parámetros:**
- `limit` (opcional): Número de trades (default: 50)

**Response:**
```json
[
  {
    "symbol": "BTCUSDT",
    "side": "BUY",
    "price": 66541.51,
    "amount": 0.015013,
    "timestamp": 1707782400000,
    "is_paper": true
  }
]
```

### 11.3 Comandos Útiles

```bash
# Verificar estado de contenedores
docker ps

# Ver logs del bot
docker logs -f boosis-bot

# Ver logs de Traefik
docker logs -f boosis-traefik

# Reiniciar servicios
docker compose restart

# Rebuild completo
docker compose down
docker compose build --no-cache
docker compose up -d

# Verificar certificado SSL
echo | openssl s_client -servername boosis.io -connect boosis.io:443 2>/dev/null | openssl x509 -noout -dates

# Backup de base de datos
docker exec boosis-db pg_dump -U boosis_admin boosis_db > backup.sql

# Restaurar base de datos
cat backup.sql | docker exec -i boosis-db psql -U boosis_admin boosis_db
```

---

## 12. Conclusiones y Recomendaciones

### Estado Actual del Proyecto

✅ **Fortalezas:**
- Arquitectura modular y bien organizada
- Dashboard funcional en tiempo real
- SSL configurado correctamente
- Deployment automatizado
- Código versionado en Git
- Documentación completa

⚠️ **Áreas de Mejora:**
- Implementar autenticación en el dashboard
- Activar persistencia en PostgreSQL
- Añadir sistema de alertas
- Implementar rate limiting
- Mejorar gestión de secretos
- Añadir tests automatizados

### Próximos Pasos Recomendados

1. **Seguridad (Prioridad Alta)**
   - Implementar autenticación JWT
   - Migrar credenciales a variables de entorno
   - Configurar SSH con keys

2. **Persistencia (Prioridad Alta)**
   - Activar conexión a PostgreSQL
   - Guardar velas y trades en DB
   - Implementar backups automáticos

3. **Monitoreo (Prioridad Media)**
   - Integrar Prometheus + Grafana
   - Configurar alertas (Discord/Telegram)
   - Implementar health checks

4. **Testing (Prioridad Media)**
   - Tests unitarios para estrategias
   - Tests de integración para API
   - Tests end-to-end para dashboard

5. **Escalabilidad (Prioridad Baja)**
   - Soportar múltiples pares de trading
   - Implementar caching con Redis
   - Considerar arquitectura de microservicios

---

**Documento generado el:** 12 de Febrero de 2026  
**Versión:** 1.0.0  
**Autor:** Equipo Boosis  
**Contacto:** tony@boosis.io
