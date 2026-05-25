# ── Stage 1: Builder ─────────────────────────────────────────────────────────
FROM node:24-alpine AS builder

# OpenSSL requerido por el motor de consultas de Prisma compilado para Alpine (libc musl)
RUN apk add --no-cache openssl

WORKDIR /app

# Manifiestos y schema primero para maximizar la caché de capas
COPY package*.json ./
COPY prisma ./prisma/

# Instalación completa (dev + prod): habilita nest build y la CLI de prisma
RUN npm ci

# Generar el cliente Prisma con previewFeature "driverAdapters" aquí donde la CLI está disponible
RUN npx prisma generate

# Copiar fuentes y compilar TypeScript → dist/
# nest-cli.json copia automáticamente src/protos/** → dist/protos/
COPY . .
RUN npm run build

# Podar devDependencies en el árbol actual para dejar node_modules limpio
# .prisma/client y @prisma/adapter-pg (prod deps) sobreviven el prune
RUN npm prune --production

# ── Stage 2: Runner ───────────────────────────────────────────────────────────
FROM node:24-alpine AS runner

RUN apk add --no-cache openssl

WORKDIR /app

# node_modules podadas: prod only — incluye .prisma/client + @prisma/adapter-pg
COPY --chown=node:node --from=builder /app/node_modules ./node_modules

# Compilado final: dist/main.js + dist/protos/ (assets copiados por nest-cli.json)
COPY --chown=node:node --from=builder /app/dist ./dist

ENV NODE_ENV=production

# Microservicio Reservas actúa como cliente gRPC puro (consumidor)
# Solo expone el canal REST — no levanta servidor gRPC propio
EXPOSE 3002

USER node

CMD ["node", "dist/main"]
