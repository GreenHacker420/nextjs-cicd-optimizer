#!/bin/sh
# Zero-Node Lightweight Healthcheck for Next.js Docker Containers
# Runs in <2ms on BusyBox Alpine without node process memory consumption.

PORT="${1:-3000}"
ENDPOINT="http://127.0.0.1:${PORT}/api/health"

if wget -q -O - "$ENDPOINT" >/dev/null 2>&1; then
  exit 0
else
  exit 1
fi
