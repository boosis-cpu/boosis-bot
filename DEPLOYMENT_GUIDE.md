# 🚀 Guía de Despliegue - Boosis Quant Bot

## 📋 Índice
1. [Arquitectura del Sistema](#arquitectura-del-sistema)
2. [Flujo de Desarrollo Local](#flujo-de-desarrollo-local)
3. [Proceso de Despliegue al VPS](#proceso-de-despliegue-al-vps)
4. [Troubleshooting Común](#troubleshooting-común)
5. [Scripts de Utilidad](#scripts-de-utilidad)

---

## 🏗️ Arquitectura del Sistema

### Componentes Principales

```
boosis-bot/
├── src/
│   ├── live/LiveTrader.js      # Backend Node.js + Express
│   ├── core/                   # Módulos core (logger, database, indicators)
│   └── strategies/             # Estrategias de trading
├── boosis-ui/                  # Frontend React + Vite
│   ├── src/App.jsx            # Dashboard principal
│   └── vite.config.js         # Configuración de Vite
├── public/                     # Build de producción del frontend
├── docker-compose.yml          # Orquestación de servicios
└── Dockerfile                  # Imagen del bot
```

### Stack Tecnológico

**Backend:**
- Node.js 20
- Express 5.2.1
- WebSocket (Binance API)
- PostgreSQL 15 (opcional, actualmente en memoria)

**Frontend:**
- React 19
- Vite 7.3.1
- Recharts (gráficos)
- Axios (HTTP client)

**Infraestructura:**
- Docker + Docker Compose
- Traefik (reverse proxy + SSL)
- VPS: 72.62.160.140
- Dominio: boosis.io

---

## 💻 Flujo de Desarrollo Local

### 1. Configuración Inicial

```bash
# Instalar dependencias del backend
npm install

# Instalar dependencias del frontend
cd boosis-ui
npm install
cd ..
```

### 2. Desarrollo en Local

**Terminal 1 - Backend:**
```bash
npm start
# Servidor escuchando en http://localhost:3000
```

**Terminal 2 - Frontend:**
```bash
cd boosis-ui
npm run dev
# Vite dev server en http://localhost:5173
```

### 3. Configuración del Proxy (Vite)

El archivo `boosis-ui/vite.config.js` está configurado para redirigir las llamadas `/api` al backend:

```javascript
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      }
    }
  },
  build: {
    outDir: '../public',
    emptyOutDir: true,
  }
})
```

### 4. Endpoints de la API

| Endpoint | Método | Descripción |
|----------|--------|-------------|
| `/api/status` | GET | Estado del bot, balance, estrategia |
| `/api/candles?limit=N` | GET | Últimas N velas (default: 100) |
| `/api/trades?limit=N` | GET | Últimos N trades (default: 50) |

---

## 🌐 Proceso de Despliegue al VPS

### Paso 1: Build del Frontend

```bash
cd boosis-ui
npm run build
cd ..
```

Esto genera los archivos optimizados en `public/`:
- `index.html`
- `assets/index-[hash].css`
- `assets/index-[hash].js`

### Paso 2: Despliegue Completo

```bash
./full_deploy.exp
```

**¿Qué hace este script?**
1. Sincroniza archivos al VPS vía `rsync` (excluye `node_modules`, `.git`, etc.)
2. Crea/configura certificados SSL (Let's Encrypt)
3. Ejecuta `docker compose up -d --build --remove-orphans`

### Paso 3: Verificación

```bash
# Ver logs del contenedor
./check_vps_logs.exp

# Verificar estado de los servicios
ssh root@72.62.160.140 "docker ps"
```

---

## 🔧 Troubleshooting Común

### Problema 1: Dashboard Parpadea y Desaparece

**Síntomas:**
- La página carga brevemente y luego se queda en blanco
- Errores 404 en `/api/candles` y `/api/trades` en la consola del navegador

**Causa:**
Docker está usando una imagen cacheada antigua que no tiene los endpoints actualizados.

**Solución:**
```bash
./force_rebuild.exp
```

O manualmente:
```bash
ssh root@72.62.160.140
cd ~/boosis-bot
docker compose down
docker compose build --no-cache
docker compose up -d
```

**Explicación:**
- `--no-cache`: Fuerza a Docker a reconstruir desde cero sin usar capas cacheadas
- Esto asegura que el código más reciente de `LiveTrader.js` se incluya en la imagen

### Problema 2: Cambios No Se Reflejan en el VPS

**Verificar que el archivo se subió correctamente:**
```bash
ssh root@72.62.160.140 "cat ~/boosis-bot/src/live/LiveTrader.js | grep -A 5 'api/candles'"
```

**Si el archivo está actualizado pero el contenedor no:**
```bash
# Reiniciar sin caché
./force_rebuild.exp
```

### Problema 3: Error de CORS en Desarrollo Local

**Síntoma:**
```
Access to XMLHttpRequest at 'http://localhost:3000/api/status' from origin 'http://localhost:5173' has been blocked by CORS
```

**Solución:**
Asegúrate de que `LiveTrader.js` tenga CORS habilitado:

```javascript
const cors = require('cors');
this.app.use(cors());
```

### Problema 4: Contenedor se Reinicia Constantemente

**Ver logs para identificar el error:**
```bash
./check_vps_logs.exp
```

**Errores comunes:**
- `npm error signal SIGTERM`: El proceso se está cerrando inesperadamente
- Solución: Usar `node` directamente en lugar de `npm start` en el Dockerfile

```dockerfile
# ✅ Correcto
CMD ["node", "src/live/LiveTrader.js"]

# ❌ Evitar (añade overhead)
CMD ["npm", "start"]
```

---

## 🛠️ Scripts de Utilidad

### `full_deploy.exp`
Despliegue completo con build de Docker.

```bash
./full_deploy.exp
```

### `force_rebuild.exp`
Reconstrucción forzada sin caché (útil cuando los cambios no se reflejan).

```bash
./force_rebuild.exp
```

### `check_vps_logs.exp`
Ver los últimos 30 logs del contenedor del bot.

```bash
./check_vps_logs.exp
```

### `check_live_trader.exp`
Verificar contenido específico del archivo `LiveTrader.js` en el VPS.

```bash
./check_live_trader.exp
```

---

## 📊 Monitoreo y Logs

### Ver Logs en Tiempo Real

```bash
ssh root@72.62.160.140
docker logs -f boosis-bot
```

### Verificar Estado de los Contenedores

```bash
ssh root@72.62.160.140
docker ps
```

Deberías ver:
- `boosis-bot` (el bot de trading)
- `boosis-traefik` (proxy inverso)
- `boosis-db` (PostgreSQL)

### Verificar Conectividad de la API

```bash
curl https://boosis.io/api/status
```

Respuesta esperada:
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

---

## 🔐 Seguridad y Mejores Prácticas

### Variables de Entorno

**Nunca commitear credenciales.** Usar variables de entorno en el VPS:

```bash
# En el VPS
export DB_USER=boosis_admin
export DB_PASS=tu_password_seguro
export DB_NAME=boosis_db
export DB_HOST=db
```

### Certificados SSL

Traefik maneja automáticamente los certificados de Let's Encrypt:
- Se renuevan automáticamente
- Se almacenan en `letsencrypt/acme.json`

### Backup de Datos

```bash
# Backup de la base de datos (cuando esté activa)
ssh root@72.62.160.140
docker exec boosis-db pg_dump -U boosis_admin boosis_db > backup_$(date +%Y%m%d).sql
```

---

## 📝 Notas Importantes

1. **Desarrollo vs Producción:**
   - En desarrollo: Frontend usa proxy de Vite (`localhost:5173` → `localhost:3000`)
   - En producción: Frontend se sirve como archivos estáticos desde Express

2. **Tiempos de Despliegue:**
   - Build del frontend: ~4-5 segundos
   - Rsync al VPS: ~10-15 segundos (depende de la conexión)
   - Docker build (con caché): ~5-10 segundos
   - Docker build (sin caché): ~30-60 segundos

3. **Reflexión Instantánea:**
   - A diferencia de Cloud Run, el VPS refleja cambios casi al instante
   - No hay "cold starts" ni tiempos de espera de plataforma

---

## 🆘 Contacto y Soporte

**VPS:** 72.62.160.140  
**Dominio:** https://boosis.io  
**Dashboard:** https://boosis.io  

**Última actualización:** 2026-02-12

---

## ✅ Checklist de Despliegue

- [ ] Código actualizado localmente
- [ ] Frontend testeado en `localhost:5173`
- [ ] Backend testeado en `localhost:3000`
- [ ] Build del frontend ejecutado (`npm run build`)
- [ ] Script de deploy ejecutado (`./full_deploy.exp`)
- [ ] Logs del VPS verificados (`./check_vps_logs.exp`)
- [ ] Dashboard accesible en `https://boosis.io`
- [ ] Endpoints de API respondiendo correctamente
- [ ] Sin errores en la consola del navegador
