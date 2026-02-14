#!/bin/bash

# 🛡️ BOOSIS BOT - SAFETY VERIFICATION SCRIPT
# Protocolo Tony - 13 Feb 2026

echo "═══════════════════════════════════════════════════════"
echo "           🕵️ AUDITORÍA DE SEGURIDAD DIARIA"
echo "═══════════════════════════════════════════════════════"

STATUS=0

# 1. Verificar TRADING_MODE en .env
echo -n "[ ] Verificando MODO PAPER en .env... "
MODE=$(grep "TRADING_MODE" .env | cut -d'=' -f2)
if [ "$MODE" == "PAPER" ]; then
    echo "✅ OK (PAPER)"
else
    echo "🚨 ERROR: MODO ES $MODE"
    STATUS=1
fi

# 2. Verificar FORCE_PAPER_MODE
echo -n "[ ] Verificando FORCE_PAPER_MODE... "
FORCE=$(grep "FORCE_PAPER_MODE" .env | cut -d'=' -f2)
if [ "$FORCE" == "true" ]; then
    echo "✅ OK (ACTIVE)"
else
    echo "🚨 ERROR: FORCE_PAPER_MODE NO ES TRUE"
    STATUS=1
fi

# 3. Buscar API Keys de Binance (No deben estar en .env)
echo -n "[ ] Buscando API Keys de Binance REAL... "
KEYS=$(grep "BINANCE_API_KEY" .env | cut -d'=' -f2)
if [ -z "$KEYS" ]; then
    echo "✅ OK (VACÍO)"
else
    echo "🚨 ADVERTENCIA: SE ENCONTRÓ API KEY"
    # No fallamos aquí si el usuario las tiene para balance real, 
    # pero el modo debe estar en PAPER.
fi

# 4. Verificar checks de seguridad en el código
echo -n "[ ] Verificando candados en LiveTrader.js... "
if grep -q "SAFETY CHECK - PROTOCOLO TONY" src/live/LiveTrader.js; then
    echo "✅ OK (PRESENTES)"
else
    echo "🚨 ERROR: CANDADOS ELIMINADOS!"
    STATUS=1
fi

echo "═══════════════════════════════════════════════════════"
if [ $STATUS -eq 0 ]; then
    echo "      🟢 EL BOT ES SEGURO PARA INICIAR (PAPER)"
else
    echo "      🔴 RIESGO DETECTADO - NO INICIAR EL BOT"
fi
echo "═══════════════════════════════════════════════════════"

exit $STATUS
