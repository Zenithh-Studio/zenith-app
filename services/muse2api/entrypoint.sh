#!/bin/sh
set -eu

resolve_key() {
  env_name=$1
  key_file=$2
  eval "key_value=\${$env_name:-}"
  mkdir -p "$(dirname "$key_file")"

  if [ -z "$key_value" ] && [ -s "$key_file" ]; then
    key_value=$(cat "$key_file")
  fi
  if [ -z "$key_value" ]; then
    key_value="m2a-$(python -c 'import secrets; print(secrets.token_urlsafe(32))')"
  fi

  if [ ! -s "$key_file" ] || [ "$(cat "$key_file" 2>/dev/null || true)" != "$key_value" ]; then
    key_tmp="${key_file}.tmp.$$"
    (umask 077; printf '%s' "$key_value" > "$key_tmp")
    mv "$key_tmp" "$key_file"
  fi

  printf '%s' "$key_value"
}

MUSE2API_API_KEY=$(resolve_key MUSE2API_API_KEY /run/muse2api-auth/api_key)
MUSE2API_ADMIN_KEY=$(resolve_key MUSE2API_ADMIN_KEY /run/muse2api-admin/admin_key)
export MUSE2API_API_KEY MUSE2API_ADMIN_KEY

exec "$@"
