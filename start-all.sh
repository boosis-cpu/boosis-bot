#!/bin/bash

# Boosis Bot - Startup Script
# Levanta Backend + Frontend en paralelo

echo "🚀 Iniciando Boosis Bot..."

# Kill existing processes
pkill -9 -f "node src/live/LiveTrader.js" 2>/dev/null
pkill -9 -f "vite" 2>/dev/null

# Start Backend
echo "📡 Levantando Backend (API)..."
nohup npm start > logs/system.log 2>&1 &
BACKEND_PID=$!

# Wait for backend to be ready
sleep 3

# Start Frontend
echo "🎨 Levantando Frontend (Dashboard)..."
cd boosis-ui
nohup npm run dev > ../logs/frontend.log 2>&1 &
FRONTEND_PID=$!
cd ..

sleep 2

echo ""
echo "✅ Boosis Bot iniciado correctamente"
echo "📊 Dashboard: http://localhost:5173"
echo "🔌 API: http://localhost:3000"
echo ""
echo "Backend PID: $BACKEND_PID"
echo "Frontend PID: $FRONTEND_PID"
echo ""
echo "Para detener: ./stop-all.sh"
