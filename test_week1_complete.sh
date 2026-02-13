#!/bin/bash
# Complete Week 1 Test Script
PORT=3000
# Kill any existing process on 3000
lsof -ti:3000 | xargs kill -9 2>/dev/null || true

echo "🚀 INICIANDO TEST SEMANA 1..."
echo "--------------------------------"

# Start server
npm start > server.log 2>&1 &
SERVER_PID=$!
sleep 5

# --- AUTH TESTS ---
echo "🔹 [AUTH] Test 1: Access without token (Expect 401)"
CODE=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:$PORT/api/status)
if [ "$CODE" == "401" ]; then echo "✅ PASS"; else echo "❌ FAIL ($CODE)"; fi

echo "🔹 [AUTH] Test 2: Login with wrong password (Expect error)"
RESPONSE=$(curl -s -X POST http://localhost:$PORT/api/login -H "Content-Type: application/json" -d '{"password":"wrong"}')
if [[ "$RESPONSE" == *"incorrecta"* ]]; then echo "✅ PASS"; else echo "❌ FAIL ($RESPONSE)"; fi

echo "🔹 [AUTH] Test 3: Login with correct password (Expect token)"
RESPONSE=$(curl -s -X POST http://localhost:$PORT/api/login -H "Content-Type: application/json" -d '{"password":"change-me-immediately"}')
TOKEN=$(echo $RESPONSE | grep -o '"token":"[^"]*"' | cut -d'"' -f4)

if [ -n "$TOKEN" ]; then
  echo "✅ PASS (Token obtained)"
else
  echo "❌ FAIL (No token)"
  kill $SERVER_PID
  exit 1
fi

echo "🔹 [AUTH] Test 4: Access with token (Expect 200)"
CODE=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:$PORT/api/status -H "Authorization: Bearer $TOKEN")
if [ "$CODE" == "200" ]; then echo "✅ PASS"; else echo "❌ FAIL ($CODE)"; fi

# --- VALIDATION TESTS ---
echo "🔹 [VAL] Test 5: Valid limit (Expect 200)"
CODE=$(curl -s -o /dev/null -w "%{http_code}" "http://localhost:$PORT/api/candles?limit=50" -H "Authorization: Bearer $TOKEN")
if [ "$CODE" == "200" ]; then echo "✅ PASS"; else echo "❌ FAIL ($CODE)"; fi

echo "🔹 [VAL] Test 6: Invalid limit > 1000 (Expect 400)"
RESPONSE=$(curl -s "http://localhost:$PORT/api/candles?limit=9999" -H "Authorization: Bearer $TOKEN")
if [[ "$RESPONSE" == *"limit debe estar entre"* ]]; then echo "✅ PASS"; else echo "❌ FAIL ($RESPONSE)"; fi

echo "🔹 [VAL] Test 7: Invalid limit negative (Expect 400)"
RESPONSE=$(curl -s "http://localhost:$PORT/api/candles?limit=-5" -H "Authorization: Bearer $TOKEN")
if [[ "$RESPONSE" == *"limit debe estar entre"* ]]; then echo "✅ PASS"; else echo "❌ FAIL ($RESPONSE)"; fi

# Cleanup
kill $SERVER_PID
echo "--------------------------------"
echo "🎉 TEST COMPLETADO"
