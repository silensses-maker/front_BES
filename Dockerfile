# ── Stage 1: build (Bun + Rsbuild) ────────────────────────────────────────────
FROM oven/bun:1-alpine AS builder

WORKDIR /app

# Cachear dependencias antes de copiar el código
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

COPY . .

# Rsbuild corre en modo production y carga .env.production (commiteado):
# PUBLIC_BACKEND_URL=/api (relativo) y la config de Firebase quedan
# inlineadas en el bundle.
#
# Override opcional para backend en OTRO origen (p.ej. http://IP:9000):
#   docker build --build-arg PUBLIC_BACKEND_URL=http://IP:9000 …
# (docker-compose lo pasa desde el .env del server si está definido).
# Si llega vacío se des-setea para que gane el .env.production.
ARG PUBLIC_BACKEND_URL
RUN if [ -z "${PUBLIC_BACKEND_URL:-}" ]; then unset PUBLIC_BACKEND_URL; fi && bun run build

# ── Stage 2: serve (nginx estático) ───────────────────────────────────────────
FROM nginx:1.29-alpine

COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=builder /app/dist /usr/share/nginx/html

EXPOSE 80
