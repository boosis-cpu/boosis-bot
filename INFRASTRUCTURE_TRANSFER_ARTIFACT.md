# 🛰️ ARTIFACT DE TRASPASO: BOOSIS ORCHESTRATOR / SENTINEL

**DE:** Antigravity (CTO / Lead Engineer)  
**PARA:** Nuevo Proyecto de Infraestructura / Devops  
**FECHA:** 13 de Febrero de 2026  
**CONTEXTO:** Boosis Quant Bot - Preparación para Live Trading

---

## ⚖️ 1. ESTADO ACTUAL DE LA INFRAESTRUCTURA (VPS)

*   **Host:** Hostinger VPS (`72.62.160.140`)
*   **SO:** Linux (Ubuntu/Debian)
*   **Orquestación:** Docker Compose (v2)
*   **Ingreso de Tráfico:** Traefik (Docker-based) con Let's Encrypt habilitado para `boosis.io`.
*   **Base de Datos:** PostgreSQL corriendo en contenedor `boosis-db`.
*   **Frontend:** React (Vite) servido por el mismo contenedor del bot o via Traefik.
*   **Red:** `boosis_traefik_net` (externa) para Traefik y red default de compose para comunicación interna.

## ⚠️ 2. DIAGNÓSTICO DEL PROBLEMA (EL "JALÓN DE OREJAS")

Actualmente, el bot sufre de un proceso de despliegue **In-Place** de alto riesgo:
1.  **Cero Versionalización:** Se usa la etiqueta `:latest`. Cada build sobrescribe la imagen anterior. No hay forma de hacer un "Rollback" rápido.
2.  **Corrección al Vuelo:** Debido a que no hay aislamiento, los errores en producción se corrigen "haciendo otro deploy", lo que genera inactividad y riesgo de capital.
3.  **Falta de Staging:** No hay un entorno para validar que el contenedor esté sano antes de moverle el tráfico (Zero-Downtime).
4.  **Acoplamiento:** El código de la aplicación (trading) está mezclado con scripts de SSH y Bash de despliegue, ensuciando el repositorio.

## 🎯 3. OBJETIVO DEL PROYECTO "SENTINEL"

Crear un motor de despliegue **agnóstico y reutilizable** que imite el comportamiento de Cloud Run en un VPS privado:

*   **Versionado con Tags:** Generar imágenes únicas (ej: `boosis-bot:v20260213-1520`).
*   **Blue-Green Deployment:** Capacidad de levantar la nueva versión junto a la antigua, verificar salud, y rotar el tráfico en Traefik sin cortes.
*   **Health-Check Gate:** Si la nueva versión no responde "OK" en 30 segundos, el deploy se detiene y se borra la imagen fallida automáticamente.
*   **Back-to-Last-Stable:** Comando de una sola línea para regresar a la versión anterior en menos de 10 segundos.

## 🛠️ 4. INFORMACIÓN PARA EL ARRANQUE

### Archivos Clave a Extraer/Reorganizar:
- `docker-compose.yml` (actualmente en el root)
- `Dockerfile` (del bot y del UI)
- `full_deploy.exp` (script de Expect actual que debemos jubilar/evolucionar)
- `.env` (gestión de secretos)

### Endpoints de Salud Disponibles:
- `GET /api/health` -> Responde `{ status: "ACTIVE", ... }`

---
**NOTA PARA EL AGENTE ENTRANTE:** 
No intentes arreglar el bot de trading. Tu única misión es construir el **túnel de despliegue seguro**. El usuario (Tony) quiere que este sistema sea una carpeta aparte que pueda usar para CUALQUIER proyecto futuro. 🚀🛰️🛡️
 stone
