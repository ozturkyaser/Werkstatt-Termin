#!/bin/sh
set -eu

# Öffentlicher Port (DigitalOcean/App Platform injiziert PORT=8080 o.Ä. für den Router)
PUBLIC_PORT="${PUBLIC_PORT:-${PORT:-80}}"
sed -i "s/listen 80;/listen ${PUBLIC_PORT};/" /etc/nginx/conf.d/default.conf

(cd /app/backend && NODE_ENV=production PORT=4100 exec node src/index.js) &
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
