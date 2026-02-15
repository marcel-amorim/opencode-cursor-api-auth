#!/bin/bash
set -e

echo "=== opencode-cursor-api-auth Setup ==="

npm install
npm run build

if command -v cursor-agent >/dev/null 2>&1; then
  echo "Checking cursor-agent login status..."
  cursor-agent whoami || true
else
  echo "cursor-agent is not installed or not in PATH."
fi
