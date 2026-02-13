#!/bin/bash
# Start server in background
PORT=3000
# Kill any existing process on 3000
lsof -ti:3000 | xargs kill -9 2>/dev/null || true

echo "Starting server..."
npm start > server.log 2>&1 &
SERVER_PID=$!

# Wait for server to start
sleep 5

echo "--- Test 1: Access without token (Expect 401) ---"
CODE=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:$PORT/api/status)
echo "Status Code: $CODE"
if [ "$CODE" == "401" ]; then echo "✅ PASS"; else echo "❌ FAIL"; fi

echo "--- Test 2: Login with wrong password (Expect error) ---"
RESPONSE=$(curl -s -X POST http://localhost:$PORT/api/login -H "Content-Type: application/json" -d '{"password":"wrong"}')
echo "Response: $RESPONSE"
if [[ "$RESPONSE" == *"incorrecta"* ]]; then echo "✅ PASS"; else echo "❌ FAIL"; fi

echo "--- Test 3: Login with correct password (Expect token) ---"
RESPONSE=$(curl -s -X POST http://localhost:$PORT/api/login -H "Content-Type: application/json" -d '{"password":"change-me-immediately"}')
echo "Response: $RESPONSE"
TOKEN=$(echo $RESPONSE | grep -o '"token":"[^"]*"' | cut -d'"' -f4)

if [ -n "$TOKEN" ]; then
  echo "✅ PASS (Token received)"
else
  echo "❌ FAIL (No token)"
  kill $SERVER_PID
  exit 1
fi

echo "--- Test 4: Access with token (Expect 200) ---"
CODE=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:$PORT/api/status -H "Authorization: Bearer $TOKEN")
echo "Status Code: $CODE"
if [ "$CODE" == "200" ]; then echo "✅ PASS"; else echo "❌ FAIL"; fi

# Cleanup
kill $SERVER_PID
exit 0
