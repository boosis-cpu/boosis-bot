# 🔒 Plan de Mejoras Críticas - Boosis Quant Bot
**Fecha:** 12 de Febrero de 2026  
**Prioridad:** INMEDIATA  
**Autor:** Equipo de Revisión Técnica

---

## 📋 Resumen Ejecutivo

El Boosis Quant Bot tiene una arquitectura sólida pero **requiere mejoras críticas de seguridad antes de operar con fondos reales**. Este documento detalla 14 acciones prioritarias organizadas en 4 fases.

---

## 🚨 FASE 1: SEGURIDAD CRÍTICA (Semana 1-2)

### 1.1 Implementar Autenticación JWT en Dashboard

**Problema:** El dashboard es accesible sin contraseña en https://boosis.io

**Solución:**
```javascript
// backend: src/core/auth.js
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');

class AuthManager {
  constructor() {
    this.secret = process.env.JWT_SECRET || 'change-me-in-production';
    this.users = new Map(); // En producción, usar DB
  }

  async register(email, password) {
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);
    this.users.set(email, { email, hashedPassword });
    return { success: true };
  }

  async login(email, password) {
    const user = this.users.get(email);
    if (!user) return { error: 'Usuario no encontrado' };
    
    const isValid = await bcrypt.compare(password, user.hashedPassword);
    if (!isValid) return { error: 'Contraseña inválida' };

    const token = jwt.sign({ email }, this.secret, { expiresIn: '24h' });
    return { token };
  }

  verifyToken(token) {
    try {
      return jwt.verify(token, this.secret);
    } catch (e) {
      return null;
    }
  }
}

module.exports = new AuthManager();
```

```javascript
// backend: src/live/LiveTrader.js - Middleware de autenticación
const auth = require('../core/auth');

this.app.use((req, res, next) => {
  // Permitir login sin token
  if (req.path === '/api/auth/login' || req.path === '/api/auth/register') {
    return next();
  }

  // Validar token en otros endpoints
  const authHeader = req.headers.authorization || '';
  const token = authHeader.replace('Bearer ', '');
  
  const user = auth.verifyToken(token);
  if (!user) {
    return res.status(401).json({ error: 'No autorizado' });
  }
  
  req.user = user;
  next();
});

// Nuevo endpoint: POST /api/auth/login
this.app.post('/api/auth/login', async (req, res) => {
  const { email, password } = req.body;
  const result = await auth.login(email, password);
  
  if (result.error) {
    return res.status(401).json(result);
  }
  
  res.json(result);
});
```

```javascript
// frontend: boosis-ui/src/pages/LoginPage.jsx
import { useState } from 'react';
import axios from 'axios';

export default function LoginPage({ onLogin }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  const handleLogin = async (e) => {
    e.preventDefault();
    try {
      const response = await axios.post('/api/auth/login', { email, password });
      localStorage.setItem('token', response.data.token);
      onLogin(response.data.token);
    } catch (err) {
      setError(err.response?.data?.error || 'Error al iniciar sesión');
    }
  };

  return (
    <div className="login-container">
      <form onSubmit={handleLogin}>
        <h1>🔐 Boosis Quant Bot</h1>
        <input
          type="email"
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
        <input
          type="password"
          placeholder="Contraseña"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />
        <button type="submit">Iniciar Sesión</button>
        {error && <p className="error">{error}</p>}
      </form>
    </div>
  );
}
```

**Instalaciones necesarias:**
```bash
npm install jsonwebtoken bcryptjs
```

**Tiempo estimado:** 4-6 horas

---

### 1.2 Migrar Credenciales a Variables de Entorno

**Problema:** Las contraseñas están en `docker-compose.yml` visible en el repositorio

**Solución:**

```bash
# .env (crear en VPS, NO versionar en Git)
NODE_ENV=production
JWT_SECRET=tu_secreto_muy_seguro_aqui_cambiar

# Database
DB_HOST=db
DB_USER=boosis_admin
DB_PASS=tu_contraseña_segura_aleatoria_aqui
DB_NAME=boosis_db

# Binance (si usarás trading real)
BINANCE_API_KEY=tu_api_key_binance
BINANCE_SECRET=tu_secret_binance

# Email para Let's Encrypt
LETSENCRYPT_EMAIL=tony@boosis.io
```

```yaml
# docker-compose.yml - Actualizado
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
    env_file:
      - .env
    command:
      - --providers.docker=true
      - --entrypoints.web.address=:80
      - --entrypoints.websecure.address=:443
      - --certificatesresolvers.myresolver.acme.tlschallenge=true
      - --certificatesresolvers.myresolver.acme.email=${LETSENCRYPT_EMAIL}

  boosis-bot:
    build: .
    env_file:
      - .env
    environment:
      - DB_HOST=db
      - DB_USER=${DB_USER}
      - DB_PASS=${DB_PASS}
      - DB_NAME=${DB_NAME}
    volumes:
      - ./data:/app/data
      - ./logs:/app/logs
    networks:
      - traefik_net
      - default

  db:
    image: postgres:15-alpine
    env_file:
      - .env
    environment:
      - POSTGRES_USER=${DB_USER}
      - POSTGRES_PASSWORD=${DB_PASS}
      - POSTGRES_DB=${DB_NAME}
    volumes:
      - postgres_data:/var/lib/postgresql/data
    networks:
      - default

volumes:
  postgres_data:

networks:
  traefik_net:
    external: true
```

```bash
# .gitignore - Asegurar que .env no se versione
node_modules/
.env
.env.local
.env.*.local
letsencrypt/acme.json
data/
logs/
dist/
build/
```

**Tiempo estimado:** 1-2 horas

---

### 1.3 Implementar Validación de Entrada en API

**Problema:** Los endpoints no validan los datos de entrada

**Solución:**
```javascript
// backend: src/core/validators.js
const validateLimit = (limit) => {
  const parsed = parseInt(limit, 10);
  if (isNaN(parsed) || parsed < 1 || parsed > 500) {
    throw new Error('Limit debe ser entre 1 y 500');
  }
  return parsed;
};

const validateEmail = (email) => {
  const regex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!regex.test(email)) {
    throw new Error('Email inválido');
  }
  return email;
};

const validatePassword = (password) => {
  if (!password || password.length < 8) {
    throw new Error('Contraseña debe tener al menos 8 caracteres');
  }
  return password;
};

module.exports = { validateLimit, validateEmail, validatePassword };
```

```javascript
// backend: src/live/LiveTrader.js - Actualizar endpoints
const { validateLimit } = require('../core/validators');

this.app.get('/api/candles', (req, res) => {
  try {
    const limit = validateLimit(req.query.limit || 100);
    const data = this.candles.slice(-limit);
    res.json(data);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

this.app.get('/api/trades', (req, res) => {
  try {
    const limit = validateLimit(req.query.limit || 50);
    const data = this.trades.slice(-limit);
    res.json(data);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});
```

**Tiempo estimado:** 2-3 horas

---

## 🗄️ FASE 2: PERSISTENCIA DE DATOS (Semana 2-3)

### 2.1 Activar Conexión a PostgreSQL

**Problema:** Los datos se guardan solo en memoria y se pierden al reiniciar

**Solución:**
```javascript
// backend: src/core/database.js - Mejorado
const { Pool } = require('pg');

class Database {
  constructor() {
    this.pool = new Pool({
      host: process.env.DB_HOST,
      user: process.env.DB_USER,
      password: process.env.DB_PASS,
      database: process.env.DB_NAME,
      port: 5432,
    });

    this.pool.on('error', (err) => {
      console.error('Error en pool de BD:', err);
    });
  }

  async initialize() {
    try {
      await this.pool.query(`
        CREATE TABLE IF NOT EXISTS candles (
          id SERIAL PRIMARY KEY,
          symbol VARCHAR(20) NOT NULL,
          interval VARCHAR(5) NOT NULL,
          open_time BIGINT NOT NULL UNIQUE,
          close_time BIGINT NOT NULL,
          open DECIMAL(20,8) NOT NULL,
          high DECIMAL(20,8) NOT NULL,
          low DECIMAL(20,8) NOT NULL,
          close DECIMAL(20,8) NOT NULL,
          volume DECIMAL(20,8) NOT NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS trades (
          id SERIAL PRIMARY KEY,
          symbol VARCHAR(20) NOT NULL,
          strategy VARCHAR(50) NOT NULL,
          side VARCHAR(10) NOT NULL,
          price DECIMAL(20,8) NOT NULL,
          amount DECIMAL(20,8) NOT NULL,
          commission DECIMAL(20,8) DEFAULT 0,
          is_paper BOOLEAN DEFAULT true,
          timestamp BIGINT NOT NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS balances (
          id SERIAL PRIMARY KEY,
          symbol VARCHAR(20) NOT NULL UNIQUE,
          usdt DECIMAL(20,8) NOT NULL,
          asset DECIMAL(20,8) NOT NULL,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

        CREATE INDEX IF NOT EXISTS idx_candles_open_time ON candles(open_time);
        CREATE INDEX IF NOT EXISTS idx_trades_timestamp ON trades(timestamp);
      `);

      console.log('[DB] ✅ Tablas inicializadas correctamente');
    } catch (err) {
      console.error('[DB] ❌ Error al inicializar:', err.message);
    }
  }

  async saveCandle(candle) {
    try {
      await this.pool.query(`
        INSERT INTO candles (
          symbol, interval, open_time, close_time, 
          open, high, low, close, volume
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        ON CONFLICT (open_time) DO NOTHING
      `, [
        candle.symbol,
        candle.interval,
        candle.openTime,
        candle.closeTime,
        candle.open,
        candle.high,
        candle.low,
        candle.close,
        candle.volume
      ]);
    } catch (err) {
      console.error('[DB] Error al guardar vela:', err.message);
    }
  }

  async saveTrade(trade) {
    try {
      await this.pool.query(`
        INSERT INTO trades (
          symbol, strategy, side, price, amount, 
          commission, is_paper, timestamp
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      `, [
        trade.symbol,
        trade.strategy,
        trade.side,
        trade.price,
        trade.amount,
        trade.commission || 0,
        trade.isPaper,
        trade.timestamp
      ]);
    } catch (err) {
      console.error('[DB] Error al guardar trade:', err.message);
    }
  }

  async getCandles(symbol, interval, limit = 100) {
    try {
      const result = await this.pool.query(`
        SELECT * FROM candles 
        WHERE symbol = $1 AND interval = $2
        ORDER BY open_time DESC
        LIMIT $3
      `, [symbol, interval, limit]);
      
      return result.rows.reverse();
    } catch (err) {
      console.error('[DB] Error al obtener velas:', err.message);
      return [];
    }
  }

  async getTrades(symbol, limit = 50) {
    try {
      const result = await this.pool.query(`
        SELECT * FROM trades 
        WHERE symbol = $1
        ORDER BY timestamp DESC
        LIMIT $2
      `, [symbol, limit]);
      
      return result.rows.reverse();
    } catch (err) {
      console.error('[DB] Error al obtener trades:', err.message);
      return [];
    }
  }

  async updateBalance(symbol, balance) {
    try {
      await this.pool.query(`
        INSERT INTO balances (symbol, usdt, asset) 
        VALUES ($1, $2, $3)
        ON CONFLICT (symbol) DO UPDATE SET 
          usdt = $2, asset = $3, updated_at = CURRENT_TIMESTAMP
      `, [symbol, balance.usdt, balance.asset]);
    } catch (err) {
      console.error('[DB] Error al actualizar balance:', err.message);
    }
  }

  async close() {
    await this.pool.end();
  }
}

module.exports = new Database();
```

```javascript
// backend: src/live/LiveTrader.js - Integración con DB
const db = require('../core/database');

class LiveTrader {
  async start() {
    // Inicializar BD
    await db.initialize();

    // Cargar velas históricas
    const historicalCandles = await db.getCandles('BTCUSDT', '5m', 200);
    this.candles = historicalCandles;

    // Cargar balance
    const balance = await db.getBalance('BTCUSDT');
    this.balance = balance || { usdt: 1000, asset: 0 };

    // Iniciar servidor y WebSocket...
    this.setupServer();
    this.connectWebSocket();
  }

  async handleKlineMessage(kline) {
    // ... lógica existente ...

    // Guardar vela en BD
    await db.saveCandle({
      symbol: 'BTCUSDT',
      interval: '5m',
      openTime: kline.t,
      closeTime: kline.T,
      open: parseFloat(kline.o),
      high: parseFloat(kline.h),
      low: parseFloat(kline.l),
      close: parseFloat(kline.c),
      volume: parseFloat(kline.v)
    });
  }

  async executePaperTrade(signal) {
    // ... lógica existente ...

    // Guardar trade en BD
    await db.saveTrade({
      symbol: 'BTCUSDT',
      strategy: 'BoosisTrend',
      side: signal.action,
      price: signal.price,
      amount: amount,
      commission: fee,
      isPaper: true,
      timestamp: Date.now()
    });

    // Guardar balance
    await db.updateBalance('BTCUSDT', this.balance);
  }
}
```

**Instalaciones:**
```bash
npm install pg
```

**Tiempo estimado:** 6-8 horas

---

### 2.2 Implementar Backups Automáticos

**Solución:**
```bash
#!/bin/bash
# scripts/backup_db.sh

BACKUP_DIR="/app/backups"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="$BACKUP_DIR/boosis_db_$TIMESTAMP.sql"

mkdir -p $BACKUP_DIR

# Realizar backup
docker exec boosis-db pg_dump -U $DB_USER $DB_NAME > $BACKUP_FILE

# Comprimir
gzip $BACKUP_FILE

# Mantener solo últimos 7 días
find $BACKUP_DIR -name "*.sql.gz" -mtime +7 -delete

echo "[$(date)] ✅ Backup guardado: $BACKUP_FILE.gz"
```

```yaml
# docker-compose.yml - Agregar servicio de backup
  backup:
    image: alpine:latest
    volumes:
      - ./scripts:/app/scripts
      - ./backups:/app/backups
      - /var/run/docker.sock:/var/run/docker.sock
    entrypoint: |
      sh -c "
      apk add --no-cache dcron docker-cli
      echo '0 2 * * * /app/scripts/backup_db.sh' | crontab -
      crond -f
      "
    networks:
      - default
    depends_on:
      - db
```

**Tiempo estimado:** 2 horas

---

## 🔄 FASE 3: CONFIABILIDAD (Semana 3-4)

### 3.1 Implementar Reconexión Automática a WebSocket

**Problema:** Si Binance desconecta, el bot no se reconecta automáticamente

**Solución:**
```javascript
// backend: src/live/LiveTrader.js - WebSocket mejorado
connectWebSocket() {
  const wsUrl = 'wss://stream.binance.us:9443/ws/btcusdt@kline_5m';
  
  const connectWithRetry = (attempt = 1) => {
    const maxAttempts = 10;
    const baseDelay = 1000; // 1 segundo
    const maxDelay = 30000; // 30 segundos

    try {
      this.ws = new WebSocket(wsUrl);

      this.ws.on('open', () => {
        logger.success('✅ Conectado a WebSocket de Binance');
        this.wsAttempts = 0; // Reset contador de intentos
        this.lastPing = Date.now();
      });

      this.ws.on('message', (data) => {
        try {
          const message = JSON.parse(data);
          if (message.e === 'kline') {
            this.handleKlineMessage(message.k);
          }
        } catch (err) {
          logger.error('Error al parsear mensaje:', err.message);
        }
      });

      this.ws.on('error', (error) => {
        logger.error('❌ Error en WebSocket:', error.message);
      });

      this.ws.on('close', () => {
        logger.warn('⚠️  Desconectado de WebSocket, intentando reconectar...');
        this.wsAttempts = attempt;
        
        const delay = Math.min(baseDelay * Math.pow(2, attempt - 1), maxDelay);
        
        if (attempt < maxAttempts) {
          logger.info(`Reintentando en ${delay}ms (intento ${attempt}/${maxAttempts})`);
          setTimeout(() => connectWithRetry(attempt + 1), delay);
        } else {
          logger.error('❌ No se pudo reconectar a WebSocket después de múltiples intentos');
          // Aquí puedes enviar una alerta crítica (email, Discord, etc.)
        }
      });

    } catch (err) {
      logger.error('Error al conectar WebSocket:', err.message);
      setTimeout(() => connectWithRetry(attempt + 1), 5000);
    }
  };

  connectWithRetry();
}

// Health check del WebSocket
startHealthCheck() {
  setInterval(() => {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      // Ping cada 30 segundos
      if (Date.now() - this.lastPing > 30000) {
        this.ws.ping(() => {
          this.lastPing = Date.now();
        });
      }
    }
  }, 5000);
}
```

**Tiempo estimado:** 3-4 horas

---

### 3.2 Implementar Health Checks y Monitoring

**Solución:**
```javascript
// backend: src/core/health.js
class HealthChecker {
  constructor(trader) {
    this.trader = trader;
    this.lastCheck = Date.now();
    this.issues = [];
  }

  check() {
    const health = {
      status: 'healthy',
      timestamp: Date.now(),
      uptime: process.uptime(),
      memory: process.memoryUsage(),
      issues: []
    };

    // Verificar WebSocket
    if (!this.trader.ws || this.trader.ws.readyState !== WebSocket.OPEN) {
      health.issues.push({
        severity: 'critical',
        component: 'websocket',
        message: 'WebSocket desconectado'
      });
      health.status = 'unhealthy';
    }

    // Verificar última vela recibida
    const lastCandle = this.trader.candles[this.trader.candles.length - 1];
    if (lastCandle) {
      const age = Date.now() - lastCandle.close_time;
      if (age > 10 * 60 * 1000) { // > 10 minutos
        health.issues.push({
          severity: 'warning',
          component: 'data-feed',
          message: `Última vela hace ${Math.floor(age/1000)}s`
        });
      }
    }

    // Verificar uso de memoria
    const heapUsed = health.memory.heapUsed / 1024 / 1024; // MB
    if (heapUsed > 500) {
      health.issues.push({
        severity: 'warning',
        component: 'memory',
        message: `Uso alto de memoria: ${heapUsed.toFixed(2)}MB`
      });
    }

    // Verificar tamaño del buffer de velas
    if (this.trader.candles.length === 0) {
      health.issues.push({
        severity: 'warning',
        component: 'candles-buffer',
        message: 'No hay velas en memoria'
      });
    }

    return health;
  }
}

module.exports = HealthChecker;
```

```javascript
// Agregar endpoint de health check
const HealthChecker = require('../core/health');
const healthChecker = new HealthChecker(this);

this.app.get('/api/health', (req, res) => {
  const health = healthChecker.check();
  const statusCode = health.status === 'healthy' ? 200 : 503;
  res.status(statusCode).json(health);
});
```

**Tiempo estimado:** 3 horas

---

## 📊 FASE 4: MONITOREO Y ALERTAS (Semana 4)

### 4.1 Integración con Discord/Telegram

**Solución:**
```javascript
// backend: src/core/notifications.js
const axios = require('axios');

class NotificationManager {
  constructor() {
    this.discordWebhook = process.env.DISCORD_WEBHOOK_URL;
    this.telegramToken = process.env.TELEGRAM_TOKEN;
    this.telegramChatId = process.env.TELEGRAM_CHAT_ID;
  }

  async sendDiscordMessage(message) {
    if (!this.discordWebhook) return;

    try {
      await axios.post(this.discordWebhook, {
        content: message,
        username: 'Boosis Bot'
      });
    } catch (err) {
      console.error('Error enviando mensaje Discord:', err.message);
    }
  }

  async sendTelegramMessage(message) {
    if (!this.telegramToken || !this.telegramChatId) return;

    try {
      await axios.get(`https://api.telegram.org/bot${this.telegramToken}/sendMessage`, {
        params: {
          chat_id: this.telegramChatId,
          text: message
        }
      });
    } catch (err) {
      console.error('Error enviando mensaje Telegram:', err.message);
    }
  }

  async notifyTrade(trade) {
    const message = `
🤖 **OPERACIÓN EJECUTADA**
Acción: ${trade.side}
Precio: $${trade.price}
Cantidad: ${trade.amount} BTC
Hora: ${new Date(trade.timestamp).toLocaleString()}
    `;
    
    await this.sendDiscordMessage(message);
    await this.sendTelegramMessage(message);
  }

  async notifyError(error) {
    const message = `
❌ **ERROR CRÍTICO**
${error.message}
Hora: ${new Date().toLocaleString()}
    `;
    
    await this.sendDiscordMessage(message);
    await this.sendTelegramMessage(message);
  }

  async notifyDisconnection() {
    const message = `
⚠️ **DESCONEXIÓN DETECTADA**
El bot se ha desconectado de Binance WebSocket
Hora: ${new Date().toLocaleString()}
    `;
    
    await this.sendDiscordMessage(message);
    await this.sendTelegramMessage(message);
  }
}

module.exports = new NotificationManager();
```

```javascript
// .env - Agregar variables
DISCORD_WEBHOOK_URL=https://discord.com/api/webhooks/...
TELEGRAM_TOKEN=tu_token_telegram
TELEGRAM_CHAT_ID=tu_chat_id
```

**Tiempo estimado:** 2-3 horas

---

## 📅 Cronograma de Implementación

```
SEMANA 1-2 (CRÍTICA - DETIENE PRODUCCIÓN)
├─ Lunes-Martes: Autenticación JWT
├─ Miércoles: Variables de entorno
├─ Jueves: Validación de entrada
└─ Viernes: Testing y deployment

SEMANA 2-3 (IMPORTANTE)
├─ Lunes-Miércoles: Persistencia en PostgreSQL
├─ Jueves: Backups automáticos
└─ Viernes: Testing integración BD

SEMANA 3-4 (RECOMENDADO)
├─ Lunes-Martes: Reconexión WebSocket
├─ Miércoles: Health checks
└─ Jueves-Viernes: Testing

SEMANA 4 (OPERACIÓN)
├─ Lunes-Martes: Integración Discord/Telegram
├─ Miércoles: Testing notificaciones
└─ Jueves-Viernes: Deployment a producción
```

---

## ✅ Checklist de Validación

### Pre-Deployment
- [ ] Autenticación implementada y testeada
- [ ] Todas las credenciales en variables de entorno
- [ ] Validación de entrada funcionando
- [ ] PostgreSQL activo y sincronizado
- [ ] Backups automáticos configurados
- [ ] WebSocket con reconexión automática
- [ ] Health checks respondiendo correctamente
- [ ] Notificaciones en Discord/Telegram funcionales
- [ ] SSL/TLS validado (openssl test)
- [ ] Logs rotando correctamente

### Post-Deployment
- [ ] Dashboard accesible solo con login
- [ ] Datos persistiendo en BD
- [ ] Trades guardándose correctamente
- [ ] Reconexión automática funciona (prueba desconectando)
- [ ] Alertas recibiéndose en Discord/Telegram
- [ ] Backups completándose diariamente
- [ ] Certificado SSL renovándose automáticamente

---

## 🚀 Consideraciones Finales

### No Esperar a Implementar Todo
**Mínimo requerido antes de operar con dinero real:**
1. ✅ Autenticación en dashboard
2. ✅ Persistencia en PostgreSQL
3. ✅ Reconexión automática WebSocket
4. ✅ Validación de entrada

### Testing Exhaustivo
```bash
# Antes de cada deployment
npm test
npm run lint
npm run build

# Validar conexiones
curl https://boosis.io/api/health
curl https://boosis.io/api/auth/login -X POST
```

### Documentación de Operación
- Guía para usuarios finales
- Runbook para troubleshooting
- Logs centralizados (considerar ELK)
- Dashboards de monitoreo (Grafana)

---

**Documento preparado para:** Antonio "Tony" (tony@boosis.io)  
**Revisión recomendada:** Cada 30 días  
**Próxima actualización:** 12 de Marzo de 2026
