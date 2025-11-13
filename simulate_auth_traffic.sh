# ===== one-shot diagnostic + 2-minute authenticated traffic =====
BASE="https://pizza-service.trevorscs329.click"

json() { python3 - <<'PY' 2>/dev/null
import sys, json
data=sys.stdin.read().strip()
try:
    obj=json.loads(data or "{}")
    print(obj.get("token",""))
except:
    print("")
PY
}

# 1) Try to obtain a token from likely endpoints
TOKEN=""
# Try admin/demo – adjust if your known creds differ
for EP in "/auth/login" "/login"; do
  for CREDS in \
    '{"username":"admin","password":"password"}' \
    '{"username":"demo","password":"demo"}'
  do
    TOKEN=$(curl -s -X POST "$BASE$EP" -H "Content-Type: application/json" -d "$CREDS" | json)
    [ -n "$TOKEN" ] && AUTH_EP="$EP" && USED_CREDS="$CREDS" && break
  done
  [ -n "$TOKEN" ] && break
done

# 2) If no token, try registering a demo user then log in
if [ -z "$TOKEN" ]; then
  curl -s -X POST "$BASE/auth/register" -H "Content-Type: application/json" \
    -d '{"username":"demo","password":"demo"}' >/dev/null 2>&1
  TOKEN=$(curl -s -X POST "$BASE/auth/login" -H "Content-Type: application/json" \
    -d '{"username":"demo","password":"demo"}' | json)
  [ -n "$TOKEN" ] && AUTH_EP="/auth/login" && USED_CREDS='{"username":"demo","password":"demo"}'
fi

# 3) Run authenticated traffic for ~2 minutes if we have a token
start=$(date +%s); dur=120
while [ -n "$TOKEN" ] && [ $(( $(date +%s) - start )) -lt $dur ]; do
  # public reads (just for http_requests_total)
  curl -s "$BASE/pizzas" >/dev/null
  curl -s "$BASE/users"  >/dev/null

  # auth attempts (one success, one intentional failure)
  curl -s -X POST "$BASE$AUTH_EP" -H "Content-Type: application/json" \
    -d "$USED_CREDS" >/dev/null
  curl -s -X POST "$BASE$AUTH_EP" -H "Content-Type: application/json" \
    -d '{"username":"wrong","password":"nope"}' >/dev/null

  # pizza create/delete (emits pizzas_sold, revenue, pizza_creation_latency_ms)
  curl -s -X POST "$BASE/pizzas" \
    -H "Authorization: Bearer $TOKEN" \
    -H "Content-Type: application/json" \
    -d '{"type":"pepperoni","size":"large"}' >/dev/null
  curl -s -X DELETE "$BASE/pizzas/1" \
    -H "Authorization: Bearer $TOKEN" >/dev/null

  sleep 0.5
done

# 4) Minimal summary
if [ -n "$TOKEN" ]; then
  echo "ok: token acquired via $AUTH_EP; sent authenticated pizza + auth traffic for ~2 min"
else
  echo "no-token: couldn’t log in via /auth/login or /login with admin/demo creds"
fi
