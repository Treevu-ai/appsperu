# Rastro Web — Capa de lectura para no-técnicos + MCP

> **RASTRO** convierte señales dispersas en inteligencia clara para decidir mejor.
> *Cada señal deja un rastro. Nosotros lo hacemos visible.*

**Rastro** es una plataforma de inteligencia que ayuda a equipos y organizaciones a encontrar, conectar y entender las señales que importan. Transformamos información dispersa en contexto accionable, con foco en trazabilidad, claridad y decisiones más seguras.

Porque detrás de cada cambio, oportunidad o riesgo hay un rastro. Y verlo a tiempo cambia lo que viene después.

Esta web app (Vite + React Router 7 SPA) consume las **14 APIs de appsperu** y expone **82 tools MCP** para que agentes IA (Claude Code, Claude Desktop, Cursor, Windsurf, Cline, Continue.dev) encadenen consultas complejas con una sola query.

- **URL producción:** https://rastro.pages.dev/
- **Stack:** Vite 8 + React 19 + TypeScript 6 + React Router 7 + Tailwind v4
- **MCP:** 82 tools de solo lectura, transporte stdio
- **Hosting:** Cloudflare Pages (proyecto `rastro`)

## Estructura

```
apps/rastro-web/
├── package.json
├── vite.config.ts            # valida 14 env vars en build (modo ≠ test)
├── wrangler.toml             # config de Cloudflare Pages
├── tsconfig.app.json
├── .env.example              # 14 URLs VITE_API_BASE_URL_*
├── README.md                 # este archivo
├── DEPLOY.md                 # runbook de Cloudflare Pages
├── docs/
│   └── linter-meta.md        # cómo escribir números con metadata
├── public/
│   ├── rastro-mark.svg
│   ├── robots.txt            # SEO: indexable + AI agents permitidos
│   ├── sitemap.xml           # SEO: sitemap para Google/Bing
│   ├── llms.txt              # GEO: descripción del sitio para LLMs
│   └── citar-rastro.md       # manual de citación (1 página)
├── scripts/
│   └── lint-meta.mjs         # ticket AL3-13
├── src/
│   ├── main.tsx
│   ├── App.tsx               # rutas
│   ├── index.css             # Tailwind v4 + tokens
│   ├── components/
│   │   ├── Layout.tsx
│   │   ├── DataFreshnessBar.tsx   # ticket AL3-03
│   │   ├── CoverageBadge.tsx
│   │   └── NumberWithMetadata.tsx
│   ├── routes/
│   │   ├── Home.tsx
│   │   ├── gore/                  # Sprint 12
│   │   ├── Proveedor.tsx
│   │   ├── Distrito.tsx
│   │   ├── Buscar.tsx
│   │   ├── Estado.tsx
│   │   └── DocsApi.tsx
│   ├── lib/
│   │   ├── types.ts          # WithMetadata, AppKey, APP_CATALOG
│   │   └── api-client.ts     # 14 funciones tipadas, MSW-friendly
│   ├── mocks/
│   │   └── handlers.ts       # respuestas para tests
│   └── test/
│       └── setup.ts
└── tests/
    └── api-client.test.ts
```

## Variables de entorno

Copia `.env.example` a `.env` y completa los 14 puertos. La build falla si falta alguna (excepto en modo `test`).

## Comandos

```bash
npm install
npm run dev              # http://localhost:5173
npm run typecheck        # tsc -b --noEmit
npm run test             # vitest run
npm run lint:meta        # linter AL3-13
npm run build            # tsc + vite build → dist/
npm run ci               # todo lo anterior en orden
```

## Convenciones

- Cada número en JSX pasa por `<NumberWithMetadata>` o lleva un comentario `@alsol-meta` adyacente.
- Cada fetch usa `cache: "no-store"`. La UI nunca muestra datos viejos del navegador (P3).
- Cada respuesta de API se muestra con su `cobertura` en un badge explícito.
- Cero dependencia nueva en `apps/*/api` de appsperu. La UI consume las 14 APIs existentes.

## Lo que NO hace en v1

- No es un CMS. No edita nada.
- No es un dashboard ejecutivo con KPIs inventados.
- No es un buscador nacional. Solo La Libertad en v1.
- No tiene login ni roles.
- No entrena ni usa un LLM.
- No se despliega en Vercel. Solo **Cloudflare Pages**.

## Documentos del proyecto

- PRD: [`docs/PRD_Rastro_Capa_Lectura_No_Tecnicos_v1.md`](../../docs/PRD_Rastro_Capa_Lectura_No_Tecnicos_v1.md)
- Tickets: [`docs/TICKETS_Rastro_Capa_Lectura_v1.md`](../../docs/TICKETS_Rastro_Capa_Lectura_v1.md)
- Backlog: [`docs/BACKLOG_Rastro_Capa_Lectura_v1.md`](../../docs/BACKLOG_Rastro_Lectura_v1.md)
- Estado: [`docs/ESTADO.md`](../../docs/ESTADO.md)
- Conectores: [`docs/conectores.md`](../../docs/conectores.md)
- Brand: Rastro. URL público: `rastro.pages.dev`.

