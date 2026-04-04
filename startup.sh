#!/usr/bin/env bash
# Auto-start script for launchd — runs on login, waits for Docker, brings up services.
set -euo pipefail

cd "$(dirname "$0")"

LOG="/tmp/lavgents-startup.log"
exec > "$LOG" 2>&1
echo "$(date): lavgents startup triggered"

# Wait for Docker daemon (Docker Desktop may still be launching)
echo "Waiting for Docker daemon..."
for i in $(seq 1 60); do
  if docker info > /dev/null 2>&1; then
    echo "Docker is ready (attempt $i)"
    break
  fi
  if [ "$i" -eq 60 ]; then
    echo "ERROR: Docker did not start within 120s"
    exit 1
  fi
  sleep 2
done

echo "Starting Docker Compose services..."
docker compose up -d

echo "Waiting for app to be ready..."
for i in $(seq 1 60); do
  if curl -sf http://localhost:4111 > /dev/null 2>&1; then
    echo "App is up on http://localhost:4111"
    break
  fi
  if [ "$i" -eq 60 ]; then
    echo "WARNING: App did not become healthy within 120s"
    exit 1
  fi
  sleep 2
done

echo "Exposing via Tailscale Funnel..."
tailscale funnel --bg 4111

echo "$(date): lavgents startup complete"
