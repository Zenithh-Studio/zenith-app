#!/bin/sh
set -eu

if [ -z "${APP_MUSE2API_API_KEY:-}" ] && [ -s /run/muse2api-auth/api_key ]; then
  APP_MUSE2API_API_KEY=$(cat /run/muse2api-auth/api_key)
  export APP_MUSE2API_API_KEY
fi

exec node apps/studio/server.js
