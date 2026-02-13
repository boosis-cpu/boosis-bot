# 🔧 Código Implementable - Mejoras Críticas Boosis Quant Bot

Este documento contiene código **listo para usar** que puedes copiar directamente a tu proyecto.

---

## 1️⃣ AUTENTICACIÓN BÁSICA RÁPIDA (30 minutos)

Si prefieres no usar JWT ahora, aquí hay una solución más rápida con token simple:

### Opción: Token Estático (Muy Rápido)

```javascript
// backend: src/core/auth.js - VERSIÓN SIMPLE
const crypto = require('crypto');

class SimpleAuth {
  constructor() {
    this.adminPassword = process.env.ADMIN_PASSWORD || 'change-me-immediately';
    this.tokens = new Map(); // token -> expiry_time
  }

  generateToken(password) {
    if (password !== this.adminPassword) {
      return null;
    }
    
    const token = crypto.randomBytes(32).toString('hex');
    const expiry = Date.now() + (24 * 60 * 60 * 1000); // 24 horas
    this.tokens.set(token, expiry);
    
    return token;
  }

  verifyToken(token) {
    const expiry = this.tokens.get(token);
    
    if (!expiry) return false;
    if (Date.now() > expiry) {
      this.tokens.delete(token);
      return false;
    }
    
    return true;
  }

  revokeToken(token) {
    this.tokens.delete(token);
  }
}

module.exports = new SimpleAuth();
```

```javascript
// backend: src/live/LiveTrader.js - INTEGRACIÓN RÁPIDA
const auth = require('../core/auth');

// En setupServer():
this.app.post('/api/login', (req, res) => {
  const { password } = req.body;
  const token = auth.generateToken(password);
  
  if (!token) {
    return res.status(401).json({ error: 'Contraseña incorrecta' });
  }
  
  res.json({ token, expiresIn: '24h' });
});

// Middleware protector
const authMiddleware = (req, res, next) => {
  // Permitir login sin token
  if (req.path === '/api/login') return next();
  
  const authHeader = req.headers.authorization || '';
  const token = authHeader.replace('Bearer ', '');
  
  if (!auth.verifyToken(token)) {
    return res.status(401).json({ error: 'No autorizado' });
  }
  
  next();
};

// Aplicar middleware a endpoints protegidos
this.app.use('/api/status', authMiddleware);
this.app.use('/api/candles', authMiddleware);
this.app.use('/api/trades', authMiddleware);
this.app.use('/api/health', authMiddleware);
```

```javascript
// frontend: boosis-ui/src/App.jsx - LOGIN RÁPIDO
import { useState, useEffect } from 'react';
import axios from 'axios';

export default function App() {
  const [token, setToken] = useState(localStorage.getItem('token') || '');
  const [password, setPassword] = useState('');
  const [data, setData] = useState(null);

  // Pantalla de login
  if (!token) {
    return (
      <div style={{
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        height: '100vh',
        background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)'
      }}>
        <div style={{
          background: 'white',
          padding: '40px',
          borderRadius: '10px',
          boxShadow: '0 10px 40px rgba(0,0,0,0.3)'
        }}>
          <h1 style={{ color: '#333', marginBottom: '30px' }}>🔐 Boosis Quant Bot</h1>
          
          <input
            type="password"
            placeholder="Ingresa la contraseña"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onKeyPress={(e) => {
              if (e.key === 'Enter') handleLogin();
            }}
            style={{
              width: '100%',
              padding: '10px',
              marginBottom: '10px',
              borderRadius: '5px',
              border: '1px solid #ddd',
              fontSize: '16px',
              boxSizing: 'border-box'
            }}
          />
          
          <button
            onClick={handleLogin}
            style={{
              width: '100%',
              padding: '10px',
              background: '#667eea',
              color: 'white',
              border: 'none',
              borderRadius: '5px',
              fontSize: '16px',
              cursor: 'pointer',
              fontWeight: 'bold'
            }}
          >
            Iniciar Sesión
          </button>
        </div>
      </div>
    );
  }

  const handleLogin = async () => {
    try {
      const response = await axios.post('/api/login', { password });
      const newToken = response.data.token;
      
      localStorage.setItem('token', newToken);
      setToken(newToken);
      setPassword('');
    } catch (error) {
      alert('Contraseña incorrecta');
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('token');
    setToken('');
  };

  // Agregar token a todos los requests
  useEffect(() => {
    axios.defaults.headers.common['Authorization'] = `Bearer ${token}`;
  }, [token]);

  // Dashboard (código existente)
  return (
    <div>
      <button onClick={handleLogout} style={{ position: 'absolute', top: '10px', right: '10px' }}>
        Cerrar Sesión
      </button>
      {/* Tu dashboard aquí */}
    </div>
  );
}
```

```bash
# .env
ADMIN_PASSWORD=tu_password_segura_aqui_123
```

---

## 2️⃣ VALIDACIÓN DE ENTRADA (15 minutos)

```javascript
// backend: src/core/validators.js - COMPLETO
class Validators {
  validateLimit(limit) {
    const parsed = parseInt(limit, 10);
    if (isNaN(parsed) || parsed < 1 || parsed > 1000) {
      throw new Error('limit debe estar entre 1 y 1000');
    }
    return parsed;
  }

  validatePassword(password) {
    if (!password || password.length < 6) {
      throw new Error('Contraseña debe tener al menos 6 caracteres');
    }
    return password;
  }

  validateSymbol(symbol) {
    const valid = ['BTCUSDT', 'ETHUSDT', 'BNBUSDT'];
    if (!valid.includes(symbol)) {
      throw new Error(`Symbol debe ser uno de: ${valid.join(', ')}`);
    }
    return symbol;
  }

  validatePrice(price) {
    const num = parseFloat(price);
    if (isNaN(num) || num <= 0) {
      throw new Error('Price debe ser un número positivo');
    }
    return num;
  }

  validateAmount(amount) {
    const num = parseFloat(amount);
    if (isNaN(num) || num <= 0) {
      throw new Error('Amount debe ser un número positivo');
    }
    return num;
  }

  validateEmail(email) {
    const regex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!regex.test(email)) {
      throw new Error('Email inválido');
    }
    return email.toLowerCase();
  }
}

module.exports = new Validators();
```

```javascript
// backend: src/live/LiveTrader.js - USAR VALIDADORES
const validators = require('../core/validators');

this.app.get('/api/candles', (req, res) => {
  try {
    const limit = validators.validateLimit(req.query.limit || 100);
    const candles = this.candles.slice(-limit);
    res.json(candles);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

this.app.get('/api/trades', (req, res) => {
  try {
    const limit = validators.validateLimit(req.query.limit || 50);
    const trades = this.trades.slice(-limit);
    res.json(trades);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});
```

---

## 3️⃣ VARIABLES DE ENTORNO (10 minutos)

```bash
# .env - CREAR EN EL VPS
# ⚠️ NO VERSIONAR ESTE ARCHIVO EN GIT

# Node Environment
NODE_ENV=production

# Security
ADMIN_PASSWORD=tu_contraseña_muy_segura_aqui

# Database (local)
DB_HOST=db
DB_USER=boosis_admin
DB_PASS=tu_contraseña_db_segura_aleatoria
DB_NAME=boosis_db
DB_PORT=5432

# Email (para certificados SSL)
LETSENCRYPT_EMAIL=tony@boosis.io

# Opcional: Para trading real (cuando estés listo)
# BINANCE_API_KEY=tu_api_key
# BINANCE_SECRET=tu_secret_key

# Opcional: Notificaciones (después)
# DISCORD_WEBHOOK_URL=https://discord.com/api/webhooks/...
```

```bash
# .gitignore - ACTUALIZAR
node_modules/
.env
.env.local
.env.production.local
dist/
build/
letsencrypt/acme.json
data/
logs/
backups/
*.log
*.sql
```

```yaml
# docker-compose.yml - VERSIÓN ACTUALIZADA (relevante)
version: '3.8'

services:
  traefik:
    image: traefik:v2.11
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./letsencrypt:/letsencrypt
      - /var/run/docker.sock:/var/run/docker.sock:ro
    env_file: .env  # ← AGREGAR ESTA LÍNEA
    command:
      - --providers.docker=true
      - --entrypoints.web.address=:80
      - --entrypoints.websecure.address=:443
      - --certificatesresolvers.myresolver.acme.tlschallenge=true
      - --certificatesresolvers.myresolver.acme.email=${LETSENCRYPT_EMAIL}
      - --certificatesresolvers.myresolver.acme.storage=/letsencrypt/acme.json

  boosis-bot:
    build: .
    env_file: .env  # ← AGREGAR ESTA LÍNEA
    environment:
      - NODE_ENV=${NODE_ENV}
      - DB_HOST=${DB_HOST}
      - DB_USER=${DB_USER}
      - DB_PASS=${DB_PASS}
      - DB_NAME=${DB_NAME}
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
    depends_on:
      - db

  db:
    image: postgres:15-alpine
    env_file: .env  # ← AGREGAR ESTA LÍNEA
    environment:
      - POSTGRES_USER=${DB_USER}
      - POSTGRES_PASSWORD=${DB_PASS}
      - POSTGRES_DB=${DB_NAME}
    volumes:
      - postgres_data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U ${DB_USER}"]
      interval: 10s
      timeout: 5s
      retries: 5
    networks:
      - default

volumes:
  postgres_data:

networks:
  traefik_net:
    external: true
  default:
```

---

## 4️⃣ RECONEXIÓN AUTOMÁTICA WEBSOCKET (30 minutos)

```javascript
// backend: src/live/LiveTrader.js - WEBSOCKET ROBUSTO
connectWebSocket() {
  const wsUrl = 'wss://stream.binance.us:9443/ws/btcusdt@kline_5m';
  let reconnectAttempts = 0;
  const maxAttempts = 10;
  const baseDelay = 1000;
  const maxDelay = 30000;

  const attemptConnection = (attempt = 1) => {
    try {
      logger.info(`[WebSocket] Intento de conexión ${attempt}/${maxAttempts}...`);
      
      this.ws = new WebSocket(wsUrl);
      let isOpen = false;

      this.ws.on('open', () => {
        isOpen = true;
        reconnectAttempts = 0;
        this.wsConnected = true;
        this.lastPing = Date.now();
        
        logger.success('✅ [WebSocket] Conectado a Binance');
      });

      this.ws.on('message', (data) => {
        try {
          const message = JSON.parse(data);
          if (message.e === 'kline' && message.k.x) { // x=true = vela cerrada
            this.handleKlineMessage(message.k);
          }
        } catch (err) {
          logger.error(`[WebSocket] Error parsing: ${err.message}`);
        }
      });

      this.ws.on('error', (error) => {
        logger.error(`[WebSocket] Error: ${error.message}`);
      });

      this.ws.on('close', () => {
        isOpen = false;
        this.wsConnected = false;
        
        logger.warn('[WebSocket] ⚠️  Desconectado, intentando reconectar...');
        
        if (reconnectAttempts < maxAttempts) {
          const delay = Math.min(baseDelay * Math.pow(2, reconnectAttempts), maxDelay);
          reconnectAttempts++;
          
          logger.info(`[WebSocket] Reintentando en ${delay}ms...`);
          setTimeout(() => attemptConnection(attempt + 1), delay);
        } else {
          logger.error('[WebSocket] ❌ No se pudo conectar después de varios intentos');
        }
      });

      // Ping cada 30 segundos para mantener vivo
      this.pingInterval = setInterval(() => {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
          try {
            this.ws.ping();
          } catch (err) {
            logger.error(`[WebSocket] Ping error: ${err.message}`);
          }
        }
      }, 30000);

    } catch (err) {
      logger.error(`[WebSocket] Connection error: ${err.message}`);
      
      if (reconnectAttempts < maxAttempts) {
        const delay = Math.min(baseDelay * Math.pow(2, reconnectAttempts), maxDelay);
        reconnectAttempts++;
        
        setTimeout(() => attemptConnection(attempt + 1), delay);
      }
    }
  };

  attemptConnection();
}

// Llamar al iniciar
start() {
  this.setupServer();
  this.loadHistoricalData();
  this.connectWebSocket();
  
  logger.success('✅ Boosis Live Trader iniciado correctamente');
}

// Limpiar al cerrar
async shutdown() {
  if (this.ws) {
    this.ws.close();
  }
  if (this.pingInterval) {
    clearInterval(this.pingInterval);
  }
  if (this.server) {
    this.server.close();
  }
}

process.on('SIGTERM', () => this.shutdown());
process.on('SIGINT', () => this.shutdown());
```

---

## 5️⃣ HEALTH CHECK ENDPOINT (20 minutos)

```javascript
// backend: src/core/health.js - COMPLETO
const os = require('os');

class HealthChecker {
  constructor(trader) {
    this.trader = trader;
  }

  check() {
    const uptime = process.uptime();
    const memUsage = process.memoryUsage();
    const cpuUsage = process.cpuUsage();
    
    const lastCandle = this.trader.candles[this.trader.candles.length - 1];
    const lastCandleAge = lastCandle ? Date.now() - lastCandle.close_time : null;
    
    const health = {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      uptime: Math.floor(uptime),
      memory: {
        heapUsed: (memUsage.heapUsed / 1024 / 1024).toFixed(2) + ' MB',
        heapTotal: (memUsage.heapTotal / 1024 / 1024).toFixed(2) + ' MB',
        external: (memUsage.external / 1024 / 1024).toFixed(2) + ' MB'
      },
      cpu: {
        user: cpuUsage.user,
        system: cpuUsage.system
      },
      bot: {
        connected: this.trader.wsConnected,
        trades: this.trader.trades.length,
        candles: this.trader.candles.length,
        balance: this.trader.balance,
        lastCandleAge: lastCandleAge ? `${(lastCandleAge / 1000).toFixed(0)}s ago` : 'N/A'
      },
      issues: []
    };

    // Validaciones
    if (!this.trader.wsConnected) {
      health.issues.push({
        level: 'critical',
        message: 'WebSocket desconectado'
      });
      health.status = 'unhealthy';
    }

    if (lastCandleAge && lastCandleAge > 10 * 60 * 1000) {
      health.issues.push({
        level: 'warning',
        message: `Última vela hace ${(lastCandleAge / 1000).toFixed(0)}s`
      });
    }

    if (this.trader.candles.length === 0) {
      health.issues.push({
        level: 'warning',
        message: 'No hay velas en memoria'
      });
    }

    const heapPercent = (memUsage.heapUsed / memUsage.heapTotal) * 100;
    if (heapPercent > 80) {
      health.issues.push({
        level: 'warning',
        message: `Uso alto de heap: ${heapPercent.toFixed(1)}%`
      });
    }

    return health;
  }
}

module.exports = HealthChecker;
```

```javascript
// backend: src/live/LiveTrader.js - AGREGAR ENDPOINT
const HealthChecker = require('../core/health');
const healthChecker = new HealthChecker(this);

this.app.get('/api/health', (req, res) => {
  const health = healthChecker.check();
  const statusCode = health.status === 'healthy' ? 200 : 503;
  res.status(statusCode).json(health);
});
```

---

## 6️⃣ RATE LIMITING (15 minutos)

```bash
npm install express-rate-limit
```

```javascript
// backend: src/live/LiveTrader.js
const rateLimit = require('express-rate-limit');

// Límite por IP
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutos
  max: 100, // máx 100 requests
  message: 'Demasiadas peticiones, intenta más tarde',
  standardHeaders: true,
  legacyHeaders: false,
});

// Límite estricto para login
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5, // máx 5 intentos
  skipSuccessfulRequests: true,
});

this.app.use(limiter);
this.app.post('/api/login', loginLimiter, (req, res) => {
  // ... código de login
});
```

---

## 📋 CHECKLIST DE IMPLEMENTACIÓN RÁPIDA

```
✓ Paso 1: Crear archivo .env en VPS
  ssh root@72.62.160.140
  cd ~/boosis-bot
  cat > .env << 'EOF'
  NODE_ENV=production
  ADMIN_PASSWORD=tu_contraseña_segura
  DB_HOST=db
  DB_USER=boosis_admin
  DB_PASS=tu_contraseña_db
  DB_NAME=boosis_db
  EOF

✓ Paso 2: Agregar .env a .gitignore en local

✓ Paso 3: Copiar código de auth a src/core/auth.js

✓ Paso 4: Copiar código de validators a src/core/validators.js

✓ Paso 5: Actualizar LiveTrader.js con middleware

✓ Paso 6: Actualizar App.jsx con login screen

✓ Paso 7: Instalar dependencias
  npm install express-rate-limit

✓ Paso 8: Build frontend
  cd boosis-ui && npm run build && cd ..

✓ Paso 9: Deploy
  ./full_deploy.exp

✓ Paso 10: Verificar
  curl https://boosis.io/api/login -X POST -H "Content-Type: application/json" -d "{\"password\":\"tu_contraseña\"}"
```

---

## 🚀 Próximos Pasos (Orden de Importancia)

1. **Esta semana:** Implementar lo anterior
2. **Próxima semana:** Activar PostgreSQL (PERSISTENCIA)
3. **2 semanas:** Backups automáticos
4. **3 semanas:** Notificaciones Discord/Telegram

---

**Actualizaciones:** Última revisión 12 Feb 2026
