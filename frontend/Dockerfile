# syntax=docker/dockerfile:1
# XN CRM web — build the SPA, serve it with nginx (non-root, port 8080).
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY . .
ARG BUILD_MODE=production
RUN npx vue-tsc -p tsconfig.app.json --noEmit && npx vite build --mode ${BUILD_MODE}

FROM nginxinc/nginx-unprivileged:1.27-alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=3s CMD wget -qO- http://127.0.0.1:8080/healthz || exit 1
