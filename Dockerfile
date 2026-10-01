# syntax=docker/dockerfile:1
# Production image of the XN CRM API. Dev infrastructure lives in docker-compose.yml,
# the production stack in docker-compose.prod.yml.

# ---- build ----------------------------------------------------------------
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npx prisma generate \
 && npm run build \
 && npm prune --omit=dev

# ---- runtime --------------------------------------------------------------
FROM node:22-alpine AS runtime
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/dist ./dist
COPY --from=build --chown=node:node /app/prisma ./prisma
COPY --chown=node:node package.json prisma.config.ts ./
USER node
EXPOSE 3000

HEALTHCHECK --interval=15s --timeout=5s --start-period=20s --retries=3 \
  CMD wget -qO- "http://127.0.0.1:${PORT:-3000}/health" > /dev/null || exit 1

# Node is PID 1's child under `init: true` (tini) and receives SIGTERM directly,
# so the graceful shutdown in src/main.ts runs. Migrations are a separate step
# (the `migrate` service), never part of the API process.
CMD ["node", "dist/main"]
