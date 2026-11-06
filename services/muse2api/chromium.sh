#!/bin/sh

# The Docker host blocks Chromium's unprivileged user-namespace sandbox.
exec /usr/bin/chromium --no-sandbox "$@"
