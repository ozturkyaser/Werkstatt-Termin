# Ein Container: Frontend (Nginx) + Backend (Node) – gleiche Funktion wie docker-compose.yml, nur ein Image.
FROM node:20-bookworm-slim AS frontend-build
WORKDIR /build
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

FROM node:20-bookworm-slim AS backend-build
WORKDIR /app
COPY backend/package.json backend/package-lock.json ./
RUN npm ci --omit=dev

FROM node:20-bookworm-slim
RUN apt-get update \
  && apt-get install -y --no-install-recommends dumb-init nginx wget \
  && rm -rf /var/lib/apt/lists/* \
  && rm -f /etc/nginx/sites-enabled/default

WORKDIR /
COPY --from=backend-build /app/node_modules /app/backend/node_modules
COPY backend/package.json backend/package-lock.json /app/backend/
COPY backend/src /app/backend/src
COPY backend/public /app/backend/public

COPY --from=frontend-build /build/dist /usr/share/nginx/html
COPY docker/nginx/all-in-one.conf /etc/nginx/conf.d/default.conf
COPY docker/all-in-one-entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh && mkdir -p /app/data

ENV NODE_ENV=production
ENV PORT=4100
ENV DATABASE_PATH=/app/data/werkstatt.sqlite

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD wget -q -O /dev/null http://127.0.0.1/api/health || exit 1

ENTRYPOINT ["dumb-init", "--"]
CMD ["/entrypoint.sh"]
