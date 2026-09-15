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
