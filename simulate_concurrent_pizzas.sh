#!/bin/bash
# Usage:
#   ./simulate_concurrent_pizzas.sh <base_url> [users] [duration_sec] [orders_per_user_per_min]
# Example:
#   ./simulate_concurrent_pizzas.sh https://pizza-service.trevorscs329.click 12 300 6

set -euo pipefail

BASE="${1:-}"
USERS="${2:-10}"          # concurrent diners
DURATION="${3:-300}"      # total run time (seconds)
OPM="${4:-4}"             # orders per user per minute (>=1)

if [ -z "$BASE" ]; then
  echo "Usage: $0 <base_url> [users] [duration_sec] [orders_per_user_per_min]"
  exit 1
fi

command -v jq >/dev/null || { echo "Please install jq (e.g., brew install jq)"; exit 1; }

# ===== helpers =====
login() {
  local email="$1" pass="$2"
  curl -s -X PUT "$BASE/api/auth" \
    -H 'Content-Type: application/json' \
    -d "{\"email\":\"$email\",\"password\":\"$pass\"}" | jq -r '.token // empty'
}

logout() {
  local token="$1"
  curl -s -X DELETE "$BASE/api/auth" -H "Authorization: Bearer $token" >/dev/null 2>&1 || true
}

get_menu() {
  curl -s "$BASE/api/order/menu" >/dev/null 2>&1 || true
}

order_once() {
  local token="$1"
  # a little variety helps; adjust menuId/prices if your API expects specific values
  local prices=(0.05 0.10 0.15 0.20 0.25)
  local names=("Veggie" "Pepperoni" "Margherita" "BBQ" "Hawaiian")
  local idx=$((RANDOM % 5))
  local price="${prices[$idx]}"
  local name="${names[$idx]}"
  local menuId=$(( (RANDOM % 3) + 1 ))

  curl -s -X POST "$BASE/api/order" \
    -H 'Content-Type: application/json' \
    -H "Authorization: Bearer $token" \
    -d "{\"franchiseId\":1,\"storeId\":1,\"items\":[{\"menuId\":$menuId,\"description\":\"$name\",\"price\":$price}]}" \
    >/dev/null 2>&1 || true
}

# Track PIDs to kill on Ctrl+C
PIDS=()
cleanup() {
  for p in "${PIDS[@]:-}"; do kill "$p" 2>/dev/null || true; done
  wait 2>/dev/null || true
  exit 0
}
trap cleanup INT TERM

END=$((SECONDS + DURATION))
INTERVAL=$(( 60 / (OPM > 0 ? OPM : 1) ))
[ "$INTERVAL" -lt 1 ] && INTERVAL=1   # cap at 1s min between orders/user

# Optional: also keep a couple of background invalid logins to light up auth_failures
auth_fail_loop() {
  while [ $SECONDS -lt $END ]; do
    curl -s -X PUT "$BASE/api/auth" \
      -H 'Content-Type: application/json' \
      -d '{"email":"unknown@jwt.com","password":"bad"}' >/dev/null 2>&1 || true
    sleep 5
  done
}
auth_fail_loop & PIDS+=($!)

# Start N diners
for i in $(seq 1 "$USERS"); do
(
  # If your Active Users metric counts unique accounts, rotate emails.
  # If your service allows concurrent sessions per user, one account is fine.
  # Change these if your DB has different seeded users.
  EMAIL="d@jwt.com"
  PASS="diner"

  TOKEN="$(login "$EMAIL" "$PASS")"

  # keep this diner "active" and buying
  while [ $SECONDS -lt $END ]; do
    # menu hits keep session/activity visible even when not ordering
    get_menu

    if [ -n "$TOKEN" ]; then
      order_once "$TOKEN"
      # occasionally churn session to bump active_users changes
      if [ $((RANDOM % 25)) -eq 0 ]; then
        logout "$TOKEN"
        TOKEN="$(login "$EMAIL" "$PASS")"
      fi
    else
      # retry login if it failed initially
      TOKEN="$(login "$EMAIL" "$PASS")"
    fi

    sleep "$INTERVAL"
  done

  [ -n "$TOKEN" ] && logout "$TOKEN"
) & PIDS+=($!)
done

# Optional: periodic "too many items" order to show failures
(
  while [ $SECONDS -lt $END ]; do
    TOKEN="$(login "d@jwt.com" "diner")"
    if [ -n "$TOKEN" ]; then
      items='{ "menuId": 1, "description": "Veggie", "price": 0.05 }'
      for (( k=0; k<21; k++ )); do
        items+=', { "menuId": 1, "description": "Veggie", "price": 0.05 }'
      done
      curl -s -X POST "$BASE/api/order" \
        -H 'Content-Type: application/json' \
        -H "Authorization: Bearer $TOKEN" \
        -d "{\"franchiseId\":1,\"storeId\":1,\"items\":[${items}]}" >/dev/null 2>&1 || true
      logout "$TOKEN"
    fi
    sleep 60
  done
) & PIDS+=($!)

wait "${PIDS[@]}"
