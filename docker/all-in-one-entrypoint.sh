#!/bin/sh
set -eu

(cd /app/backend && exec node src/index.js) &
NODE_PID=$!

on_term() {
  nginx -s quit 2>/dev/null || true
  kill -TERM "$NODE_PID" 2>/dev/null || true
  wait "$NODE_PID" 2>/dev/null || true
}
trap on_term INT TERM

nginx -g "daemon off;"

nginx_exit=$?

kill -TERM "$NODE_PID" 2>/dev/null || true
wait "$NODE_PID" 2>/dev/null || true

exit "$nginx_exit"
