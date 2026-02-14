#!/bin/bash

# Boosis Bot - Stop Script
# Detiene Backend + Frontend

echo "🛑 Deteniendo Boosis Bot..."

pkill -9 -f "node src/live/LiveTrader.js"
pkill -9 -f "vite"

echo "✅ Todos los procesos detenidos"
