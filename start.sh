#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")"

echo "▶ Starting Docker services..."
docker compose up -d --build

echo "▶ Waiting for app to be ready..."
until curl -sf http://localhost:4111 > /dev/null 2>&1; do
  sleep 2
done
echo "✓ App is up on http://localhost:4111"

echo "▶ Exposing via Tailscale Funnel..."
tailscale funnel --bg 4111

echo "✓ Public URL:"
tailscale funnel status
