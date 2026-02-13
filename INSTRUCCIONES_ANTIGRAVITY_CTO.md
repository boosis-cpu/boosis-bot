# 🚀 INSTRUCCIONES PARA CTO ANTIGRAVITY - Boosis Quant Bot

**Para:** antigravity (CTO)  
**De:** Tony (Owner)  
**Asunto:** Implementación Semana 1 - NO te abrumes, esto es simple  
**Fecha:** 12 Feb 2026

---

## 🎯 TU MISIÓN (SEMANA 1)

```
HACER ESTO EN 7 DÍAS:
├─ Lunes-Martes:  JWT login (copia-pega código)
├─ Miércoles:     Variables .env (copia-pega config)
├─ Jueves:        Validación input (copia-pega validadores)
└─ Viernes:       Testing básico + deploy staging

TOTAL: ~7-10 horas de trabajo
RESULTADO: Dashboard seguro en producción ✅
```

---

## 📖 LEE ESTO PRIMERO (30 MINUTOS)

### Paso 1: Overview Quick (5 min)
```bash
# Lee SOLO estas 2 secciones:
1. QUICK_REFERENCE_CARD.md
   └─ Entiende qué hay que hacer en alto nivel

2. Este documento (que estás leyendo)
   └─ Tu roadmap exacto para esta semana
```

### Paso 2: Código a Usar (10 min)
```bash
# Abre QUICK_IMPLEMENTATION_CODE.md
# Lee SOLO estas secciones:
1️⃣ AUTENTICACIÓN BÁSICA RÁPIDA
   └─ El código JWT está ahí, listos para copiar
   
2️⃣ VALIDACIÓN DE ENTRADA
   └─ Validadores simples
   
3️⃣ VARIABLES DE ENTORNO
   └─ Cómo configurar .env
```

### Paso 3: Plan Detallado (15 min)
```bash
# Abre SECURITY_AND_IMPROVEMENTS_PLAN.md
# Lee SOLO "FASE 1: SEGURIDAD CRÍTICA"
   └─ Secciones 1.1, 1.2, 1.3 (las que necesitas)
   
# IGNORA:
   ✗ Fase 2, 3, 4 (son después)
   ✗ Secciones de "Próximos Pasos"
   ✗ TODO lo que no sea SEMANA 1
```

---

## 🎬 LUNES - SETUP INICIAL (2 HORAS)

### Tarea 1.1: Clonar y Setup Local
```bash
# En tu máquina local:
cd ~/projects
git clone <tu-repo-boosis-bot>
cd boosis-bot

# Instalar dependencias que necesitarás
npm install jsonwebtoken bcryptjs express-rate-limit

# Verificar que Express funciona
npm start
# Deberías ver: "✅ Web server listening on port 3000"
```

### Tarea 1.2: Crear rama de desarrollo
```bash
git checkout -b feature/seguridad-semana1
# Ahora trabajas en esta rama, no toquemos main
```

### ✅ LUNES CHECKPOINT
```
□ Repo clonado localmente
□ npm install exitoso
□ npm start funciona
□ Rama feature/seguridad creada
```

---

## 🔐 LUNES-MARTES - JWT (AUTENTICACIÓN)

### Lo que vamos a hacer:
```
ANTES:
  https://boosis.io/api/status → Datos públicos 🔴

DESPUÉS:
  https://boosis.io/api/login → {password} → {token}
  https://boosis.io/api/status → Authorization: Bearer {token}
                                 Datos privados ✅
```

### Código 1: Crea archivo `src/core/auth.js`

**Ve a:** QUICK_IMPLEMENTATION_CODE.md → Sección "AUTENTICACIÓN BÁSICA RÁPIDA"

**Copia TODO el código de `SimpleAuth class`**

```javascript
// Copia ESTE ARCHIVO COMPLETO:
// QUICK_IMPLEMENTATION_CODE.md → "backend: src/core/auth.js - VERSIÓN SIMPLE"

// Resultado: Un archivo nuevo "src/core/auth.js"
```

**Verifica que creaste:**
```bash
ls -la src/core/auth.js
# Debería existir
```

### Código 2: Actualiza `src/live/LiveTrader.js`

**Busca en tu LiveTrader.js dónde está `setupServer()`**

```javascript
// AL PRINCIPIO DEL ARCHIVO (después de imports):
const auth = require('../core/auth');

// DENTRO DE setupServer(), después de crear express app:
// Agregar estas líneas (copia de QUICK_IMPLEMENTATION_CODE.md):

// Endpoint de login
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

// Proteger endpoints
this.app.use('/api/status', authMiddleware);
this.app.use('/api/candles', authMiddleware);
this.app.use('/api/trades', authMiddleware);
```

### Test rápido:
```bash
npm start

# En otra terminal:
# Test 1: Sin token (debería fallar)
curl http://localhost:3000/api/status
# Resultado: {"error":"No autorizado"}

# Test 2: Login con contraseña incorrecta
curl -X POST http://localhost:3000/api/login \
  -H "Content-Type: application/json" \
  -d '{"password":"wrong"}'
# Resultado: {"error":"Contraseña incorrecta"}

# Test 3: Login correcto (password = "change-me-immediately")
curl -X POST http://localhost:3000/api/login \
  -H "Content-Type: application/json" \
  -d '{"password":"change-me-immediately"}'
# Resultado: {"token":"abc123...","expiresIn":"24h"}

# Test 4: Con token válido
TOKEN="abc123..." # copiar del test 3
curl http://localhost:3000/api/status \
  -H "Authorization: Bearer $TOKEN"
# Resultado: {"status":"online", ...}
```

### ✅ MARTES CHECKPOINT
```
□ src/core/auth.js creado
□ LiveTrader.js actualizado con endpoints de login
□ Middleware protector aplicado
□ Tests manuales pasando
□ Commit a git: "feat: JWT authentication"
```

---

## 🌍 MIÉRCOLES - VARIABLES DE ENTORNO (.ENV)

### Lo que vamos a hacer:
```
ANTES:
  Contraseña "hardcoded" en el código
  No es seguro si lo commiteas

DESPUÉS:
  Contraseña en archivo .env local (no versionado)
  Código lee de variables de entorno
```

### Paso 1: Crear `.env` en VPS (NO en tu local)

```bash
# EN EL VPS (root@72.62.160.140):
cd ~/boosis-bot
cat > .env << 'EOF'
NODE_ENV=production
ADMIN_PASSWORD=tu_contraseña_muy_segura_aqui_123
DB_HOST=db
DB_USER=boosis_admin
DB_PASS=tu_contraseña_db_segura_aleatoria
DB_NAME=boosis_db
LETSENCRYPT_EMAIL=tony@boosis.io
EOF

# Verificar que se creó
cat .env
```

### Paso 2: Crear `.env.example` en tu repo (ESTO SÍ commiteamos)

```bash
# En tu máquina local:
cat > .env.example << 'EOF'
NODE_ENV=production
ADMIN_PASSWORD=change-me
DB_HOST=db
DB_USER=boosis_admin
DB_PASS=change-me
DB_NAME=boosis_db
LETSENCRYPT_EMAIL=your-email@example.com
EOF

# Commit
git add .env.example
git commit -m "docs: .env.example template"
```

### Paso 3: Actualizar `.gitignore`

```bash
# En tu repo raíz, abre .gitignore y agrega:
echo ".env" >> .gitignore
echo ".env.local" >> .gitignore
echo ".env.production.local" >> .gitignore

git add .gitignore
git commit -m "security: ignore .env files"
```

### Paso 4: Actualizar `src/core/auth.js` para leer .env

```javascript
// En src/core/auth.js, modifica el constructor:

constructor() {
  // CAMBIAR ESTA LÍNEA:
  // this.adminPassword = process.env.ADMIN_PASSWORD || 'change-me-immediately';
  
  // POR ESTA:
  this.adminPassword = process.env.ADMIN_PASSWORD;
  
  // Validación:
  if (!this.adminPassword) {
    throw new Error('ERROR: ADMIN_PASSWORD no configurado en .env');
  }
  
  this.tokens = new Map();
}
```

### Test:
```bash
# Crear .env local para testing
cat > .env.local << 'EOF'
NODE_ENV=development
ADMIN_PASSWORD=test123
EOF

npm start
# No debería dar error

# Test login con nueva contraseña
curl -X POST http://localhost:3000/api/login \
  -H "Content-Type: application/json" \
  -d '{"password":"test123"}'
# Debería funcionar
```

### ✅ MIÉRCOLES CHECKPOINT
```
□ .env creado en VPS
□ .env.example en repo (sin secretos)
□ .gitignore actualizado
□ src/core/auth.js usa process.env
□ Commits hechos:
  - "docs: .env.example"
  - "security: .env handling"
```

---

## ✔️ JUEVES - VALIDACIÓN DE ENTRADA

### Lo que vamos a hacer:
```
ANTES:
  /api/candles?limit=999999999 → Acepta cualquier número
  
DESPUÉS:
  /api/candles?limit=999999999 → Error: "limit debe estar entre 1 y 1000"
  /api/candles?limit=50 → OK
```

### Código: Crea `src/core/validators.js`

**Ve a:** QUICK_IMPLEMENTATION_CODE.md → Sección "2️⃣ VALIDACIÓN DE ENTRADA"

**Copia TODO el código de `class Validators`**

```bash
# Nuevo archivo:
cat > src/core/validators.js << 'EOF'
# Copia aquí el código completo de QUICK_IMPLEMENTATION_CODE.md
EOF
```

### Actualiza `src/live/LiveTrader.js`

**En setupServer(), busca los endpoints `/api/candles` y `/api/trades`:**

```javascript
// AL PRINCIPIO:
const validators = require('../core/validators');

// REEMPLAZA estos endpoints:
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

### Test:
```bash
npm start

# Test 1: Límite válido
curl http://localhost:3000/api/candles?limit=50 \
  -H "Authorization: Bearer $TOKEN"
# Debería devolver velas

# Test 2: Límite inválido (>1000)
curl http://localhost:3000/api/candles?limit=9999 \
  -H "Authorization: Bearer $TOKEN"
# Resultado: {"error":"limit debe estar entre 1 y 1000"}

# Test 3: Límite inválido (negativo)
curl http://localhost:3000/api/candles?limit=-50 \
  -H "Authorization: Bearer $TOKEN"
# Resultado: {"error":"limit debe estar entre 1 y 1000"}
```

### ✅ JUEVES CHECKPOINT
```
□ src/core/validators.js creado
□ /api/candles validado
□ /api/trades validado
□ Tests de validación pasando
□ Commits hechos:
  - "feat: input validation"
```

---

## 🧪 VIERNES - TESTING Y VERIFICACIÓN

### Checklist de Verificación

```bash
# 1. JWT Funciona
□ Login sin password → Error
□ Login con password incorrecto → Error
□ Login con password correcto → Token
□ Usar token en /api/status → OK
□ Token expirado → Error

# 2. Validación Funciona
□ /api/candles?limit=50 → OK
□ /api/candles?limit=9999 → Error
□ /api/candles → Error (sin token)

# 3. Ambiente Funciona
□ npm start sin errores
□ No hay warnings en logs
□ Variables .env se cargan correctamente

# 4. Código Funciona
□ Sin errores de sintaxis
□ Sin variables undefined
□ Manejo de errores correcto
```

### Script de Testing Completo

```bash
#!/bin/bash
# save as: test-semana1.sh

echo "🧪 TEST SEMANA 1 BOOSIS"
echo "========================="

npm start &
SERVER_PID=$!
sleep 2

echo "✓ Servidor iniciado"

# Test 1: Login incorrecto
echo -n "Test 1 (Login incorrecto): "
RESULT=$(curl -s -X POST http://localhost:3000/api/login \
  -H "Content-Type: application/json" \
  -d '{"password":"wrong"}' | grep -c "error")
[ $RESULT -eq 1 ] && echo "✅ PASS" || echo "❌ FAIL"

# Test 2: Login correcto
echo -n "Test 2 (Login correcto): "
TOKEN=$(curl -s -X POST http://localhost:3000/api/login \
  -H "Content-Type: application/json" \
  -d "{\"password\":\"$(grep ADMIN_PASSWORD .env.local | cut -d= -f2)\"}" | grep -o '"token":"[^"]*"' | cut -d'"' -f4)
[ ! -z "$TOKEN" ] && echo "✅ PASS (Token: ${TOKEN:0:10}...)" || echo "❌ FAIL"

# Test 3: Sin token → Error
echo -n "Test 3 (Sin token, debe fallar): "
RESULT=$(curl -s http://localhost:3000/api/status | grep -c "error")
[ $RESULT -eq 1 ] && echo "✅ PASS" || echo "❌ FAIL"

# Test 4: Con token → OK
echo -n "Test 4 (Con token, debe funcionar): "
RESULT=$(curl -s http://localhost:3000/api/status \
  -H "Authorization: Bearer $TOKEN" | grep -c "status")
[ $RESULT -eq 1 ] && echo "✅ PASS" || echo "❌ FAIL"

# Test 5: Validación
echo -n "Test 5 (Validación límite): "
RESULT=$(curl -s "http://localhost:3000/api/candles?limit=9999" \
  -H "Authorization: Bearer $TOKEN" | grep -c "error")
[ $RESULT -eq 1 ] && echo "✅ PASS" || echo "❌ FAIL"

# Cleanup
kill $SERVER_PID
wait $SERVER_PID 2>/dev/null

echo ""
echo "✅ TESTING COMPLETO"
```

**Ejecutar:**
```bash
chmod +x test-semana1.sh
./test-semana1.sh
```

### ✅ VIERNES CHECKPOINT
```
□ Todos los tests pasando
□ Sin errores en logs
□ Código committeado:
  git commit -m "chore: semana 1 complete - auth, validation"

□ Documentación actualizada:
  git commit -m "docs: semana 1 changes"
```

---

## 🚀 DEPLOY A STAGING (VIERNES TARDE)

```bash
# En VPS:
cd ~/boosis-bot

# Pull últimos cambios
git pull origin feature/seguridad-semana1

# Build y restart
docker compose down
docker compose build --no-cache
docker compose up -d

# Verificar logs
docker logs -f boosis-bot

# Esperar 30 segundos hasta que vea:
# [SUCCESS] Web server listening on port 3000
```

### Verificar en production:
```bash
# HTTPS (requiere certificado):
curl https://boosis.io/api/login \
  -X POST \
  -H "Content-Type: application/json" \
  -d '{"password":"tu_password"}'
```

---

## 📊 SEMANA 1 SUMMARY

```
LUNES:    Setup + Clone
MARTES:   JWT implementado ✅
MIÉRCOLES: .env variables ✅
JUEVES:   Validación ✅
VIERNES:  Testing + Deploy ✅

HORAS TOTALES: ~7-10 horas
COMMITS: 5-6
CÓDIGO NUEVO: ~100 líneas
VULNERABILIDADES FIJAS: 3 críticas

RESULTADO: Dashboard seguro en producción ✅
```

---

## 🎯 PRÓXIMA SEMANA (PREVIEW)

```
SEMANA 2: PERSISTENCIA (PostgreSQL)
├─ Activar conexión a BD
├─ Guardar velas automáticamente
├─ Guardar trades automáticamente
└─ Backups configurados

Tiempo: ~8-10 horas
Fácil: SÍ (código listo en docs)
```

---

## ⚡ TRUCOS PARA NO AHOGARSE

```
✅ LEE SOLO lo que necesitas esta semana
✅ COPIA el código, no lo escribas desde cero
✅ TEST cada parte antes de pasar a la siguiente
✅ COMITTEA después de cada tarea (commit frecuente)
✅ PREGUNTA si algo no está claro (es mejor que adivinar)

❌ NO leas toda la documentación
❌ NO tries de hacer Semana 2 esta semana
❌ NO compliques el código (keep it simple)
❌ NO saltes los tests
❌ NO esperes a tener "todo perfecto" antes de commitear
```

---

## 📞 SI TE ATASCAS

### Error: "Cannot find module 'jsonwebtoken'"
```bash
npm install jsonwebtoken
```

### Error: "AUTH_PASSWORD not configured"
```bash
# Verificar que .env.local existe:
cat .env.local
# Si no, crear:
echo "ADMIN_PASSWORD=test123" > .env.local
```

### Error: "Port 3000 already in use"
```bash
# Matar proceso en puerto 3000:
lsof -i :3000
kill -9 <PID>
```

### Server no inicia
```bash
# Verificar sintaxis JavaScript:
node -c src/live/LiveTrader.js
# Debería no devolver nada (no hay errores)
```

### Tests no pasan
```bash
# Debug: Ver logs
npm start 2>&1 | head -50

# O conectar con curl verbose:
curl -v http://localhost:3000/api/login
```

---

## 💬 RESPUESTAS RÁPIDAS A PREGUNTAS COMUNES

**P: ¿Necesito cambiar todo el código existente?**  
R: NO. Solo agrega código nuevo (auth.js, validators.js) y modifica setupServer()

**P: ¿Qué pasa si no tengo .env?**  
R: El servidor te dirá "ERROR: ADMIN_PASSWORD no configurado"

**P: ¿Debería committear .env?**  
R: NO. Solo .env.example (sin secretos)

**P: ¿Cuánto tarda compilar?**  
R: npm start → 2-3 segundos normalmente

**P: ¿Tengo que hacer todos los tests?**  
R: Solo los 5 tests de viernes. Los anteriores son opcionales.

---

## ✅ CHECKLIST FINAL SEMANA 1

```
ANTES DE VIERNES 23:59:

CÓDIGO:
  □ src/core/auth.js creado
  □ src/core/validators.js creado
  □ LiveTrader.js actualizado
  □ Sin errores de compilación

SEGURIDAD:
  □ .env en VPS (no en repo)
  □ .env.example en repo (sin secretos)
  □ .gitignore actualizado
  □ Endpoints protegidos

TESTING:
  □ Login funciona
  □ Validación funciona
  □ 5 tests de viernes TODOS pasan
  □ npm start sin warnings

GIT:
  □ 5-6 commits limpios
  □ Branch feature/seguridad-semana1 limpia
  □ Listos para merge a main

DEPLOY:
  □ Docker build sin errores
  □ En staging funciona
  □ https://boosis.io accesible (si tienen DNS)

ENTREGABLES:
  □ Lista de cambios documentada
  □ Logs de testing
  □ 5 tests pasando
  □ Pronto para merge

SI TODO ESTÁ ✅: SEMANA 1 COMPLETADA 🎉
```

---

## 📞 CONTACTO SEMANA 1

```
REUNIÓN SEMANAL: VIERNES 17:00 (30 min)

AGENDA:
  1. Demo: Login funciona en staging (5 min)
  2. Métricas: Uptime, errores (5 min)
  3. Blockers: ¿Algo atascado? (10 min)
  4. Próximo sprint (Semana 2) (10 min)

ANTES DE LA REUNIÓN:
  • Prepara lista de cambios
  • Ten logs de testing listos
  • Nota cualquier bloqueador
```

---

## 🎯 ÚLTIMA COSA

**Antigua, tú eres capaz de esto.** Es código simple, bien documentado, y tengo TODO listo para que copies.

**No es:</br>
- ❌ Complicado (es simple)
- ❌ Ambiguo (está paso a paso)
- ❌ Sin apoyo (tengo docs + código)

**Es:**
- ✅ Claro
- ✅ Ejecutable
- ✅ Testeado
- ✅ Apoyado

**Empieza ahora. No pienses demasiado. Copia, pega, testa.**

**¿Preguntas? Escríbeme directo. ¿Bloqueado? Escalala. ¿Completado? Celebra y pasa a Semana 2.**

---

**CTO ANTIGRAVITY ROADMAP**

```
HOY (12 FEB):      Lee este documento (30 min) ← AQUÍ
LUNES 17 FEB:      Empieza setup
VIERNES 21 FEB:    Semana 1 DONE ✅
LUNES 24 FEB:      Semana 2 (Persistencia)
VIERNES 28 FEB:    Semana 2 DONE ✅
LUNES 3 MAR:       Semana 3 (Confiabilidad)
VIERNES 7 MAR:     Semana 3 DONE ✅
LUNES 10 MAR:      Semana 4 (Backtesting)
VIERNES 14 MAR:    Semana 4 DONE ✅
20 MAR:            🎉 Sistema listo para producción

TOTAL: 5 semanas de trabajo = Sistema profesional
```

---

**¡Vamos a hacerlo!** 🚀

Tony
