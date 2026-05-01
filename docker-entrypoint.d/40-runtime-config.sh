#!/bin/sh
set -eu

RUNTIME_CONFIG_PATH="/usr/share/nginx/html/app-config.json"

cat > "$RUNTIME_CONFIG_PATH" <<EOF
{
  "googleMapsApiKey": "${FOOD_RESCUE_GOOGLE_MAPS_API_KEY:-}"
}
EOF
