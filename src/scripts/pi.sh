#!/usr/bin/env bash
set -euo pipefail

# -----------------------
# Configuration
# -----------------------
PI_IP="172.20.10.8"
PI_PORT="${PI_PORT:-8765}"
PI_URL="http://${PI_IP}:${PI_PORT}/event"
TOKEN="${PI_TOKEN:-ichack-demo}"

# -----------------------
# Arguments
# -----------------------
MESSAGE="${1:-}"
VIBRATE="${2:-false}" # true | false

# -----------------------
# Build JSON
# -----------------------
JSON_PAYLOAD=$(cat <<EOF
{
"message": "$MESSAGE",
"vibrate": $VIBRATE
}
EOF
)

# -----------------------
# Send (robust)
# -----------------------
curl -sS --fail \
--connect-timeout 0.4 \
--max-time 0.8 \
--retry 3 \
--retry-delay 0 \
-X POST "$PI_URL" \
-H "Content-Type: application/json" \
-H "X-Auth: $TOKEN" \
-d "$JSON_PAYLOAD" \
