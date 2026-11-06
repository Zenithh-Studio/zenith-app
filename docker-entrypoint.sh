#!/bin/sh
set -eu

if [ -z "${PAYLOAD_SECRET:-}" ]; then
  secret_file=/app/apps/studio/data/payload-secret
  if [ ! -s "$secret_file" ]; then
    umask 077
    node -e "process.stdout.write(require('node:crypto').randomBytes(48).toString('base64url'))" > "$secret_file"
  fi
  PAYLOAD_SECRET=$(cat "$secret_file")
  export PAYLOAD_SECRET
fi

if [ -z "${APP_MUSE2API_API_KEY:-}" ] && [ -s /run/muse2api-auth/api_key ]; then
  APP_MUSE2API_API_KEY=$(cat /run/muse2api-auth/api_key)
  export APP_MUSE2API_API_KEY
fi

exec node apps/studio/server.js
