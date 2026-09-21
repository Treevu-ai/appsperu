# Standalone: mcp-server/ tiene su propio package-lock.json y no depende de
# ningún workspace del monorepo (a diferencia de las 27 apps bajo apps/*/api,
# que sí comparten packages/ y usan infra/fly/Dockerfile.api con el repo
# entero como build context). Este Dockerfile usa mcp-server/ como contexto,
# más simple: `docker build -f mcp-server/Dockerfile mcp-server/` o
# equivalente `fly deploy` apuntando a este directorio.
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY tsconfig.json ./
COPY src ./src
RUN npm run build
# `migrate.ts` busca las migraciones en un directorio "migrations" hermano de
# su propio archivo compilado (dist/db/migrations) -- tsc solo compila .ts,
# nunca copia los .sql. Sin este paso el contenedor crashloopea en producción
# (ENOENT en dist/db/migrations, confirmado en vivo 2026-09-20 en el primer
# intento de deploy real). Mismo fix ya aplicado en infra/fly/Dockerfile.api
# para las otras 27 apps del monorepo. El loop con `[ -e "$f" ]` (en vez de
# `cp *.sql dest/` directo) evita que el build falle si el glob no matchea
# nada -- sh expande un glob sin coincidencias al literal sin expandir, y
# `cp` sobre un archivo que no existe rompe el build (hallazgo de Copilot,
# PR #174).
RUN mkdir -p dist/db/migrations && \
    for f in src/db/migrations/*.sql; do [ -e "$f" ] && cp "$f" dist/db/migrations/; done; true

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY --from=build /app/dist ./dist
COPY docker-entrypoint.sh ./
RUN chmod +x docker-entrypoint.sh

ENV MCP_TRANSPORT=http
ENV PORT=8080
EXPOSE 8080

ENTRYPOINT ["./docker-entrypoint.sh"]
