#!/bin/bash
set -e

echo "=== opencode-cursor-api-auth Setup ==="

npm install
npm run build

if [ -n "$CURSOR_API_KEY" ]; then
  echo "Validating CURSOR_API_KEY against Cursor API..."
  curl --silent --show-error -u "$CURSOR_API_KEY:" https://api.cursor.com/v0/me >/dev/null
  echo "Cursor API key is valid."
else
  echo "CURSOR_API_KEY is not set."
  echo "Set it and rerun if you want automatic validation."
fi
