# PRD — Rastro Capa de Lectura para No-Técnicos v1

**Versión:** 1.0
**Estado:** planificado
**Fecha:** 2026-08-29
**Producto:** Rastro / Follow the Sol
**Autor:** Ricardo Cuba Alván
**PRD anterior:** [`docs/PRD_Confiabilidad_y_Evidencia_AppsPeru_v1.md`](PRD_Confiabilidad_y_Evidencia_AppsPeru_v1.md) (cambió CI/timeout/observabilidad, **no** agregó UI)
**PRD paralelo:** [`docs/PRD_CEPLAN_Rastro_Fase2_5Regiones_v1.md`](PRD_CEPLAN_Rastro_Fase2_5Regiones_v1.md) (Fase 2 cerró Sprints 6–10 con 82 tools MCP; este PRD parte de ese cierre)
**Ámbito:** **interfaz de lectura web** sobre los 82 tools MCP y las 14 APIs existentes. No agrega backend nuevo, no expande cobertura territorial, no introduce datos no verificados.

---

## 1. Decisión de producto

Rastro ya tiene la **infraestructura de datos y de agente** completa: 14 apps (Postgres + Express, puertos 4000–4013), 82 tools MCP y una disciplina de "vacío de evidencia, no conclusión" codificada en cada `description` de tool. Lo que falta es la **superficie de lectura** para los destinatarios reales del producto: funcionarios de Gobierno Regional, periodistas de datos, equipos de OCI, y ciudadanía técnica.

Hoy, ese público objetivo solo puede llegar a la información abriendo una terminal y ejecutando `npm run sectors:inventory -- --anio 2026`. Eso **ya no escala**. Este PRD no agrega una línea de analítica nueva: **convierte los 82 tools en una experiencia de lectura que preserve su honestidad epistémica**.

```text
Hoy:        API/CLI/MCP sólidos, sin cara visible para no-programadores
            (la landing Rastro-landing.html es marketing, no producto)
Objetivo:   tres lectores web (GORE, prensa, auditoría) sobre las APIs
            existentes, sin cambiar su contrato ni su semántica
```

## 2. Problema

| Brecha | Evidencia | Consecuencia |
|---|---|---|
| **Sin capa de lectura para no-técnicos** | `npm run sectors:inventory`, `npm run ficha:sector`, `npm run sectores/comparativo` solo corren en terminal; `Rastro-landing.html` no consume ningún endpoint | El destinatario (GORE, OCI, prensa) no entra. Rastro es invisible fuera del círculo técnico |
| **Frescura no visible en interfaz** | Los 82 tools declaran `SIN_SCHEDULER` en su descripción (`mcp-server/src/catalog.ts:11-12`) y los `meta_sources` ya existen | Un periodista no puede saber si el dato de hoy tiene 1 día o 60 días |
| **Sin narrativa territorial verificable** | Hay 6 memos de La Libertad, 1 reporte de servicios que cuidan, 1 radar competitividad — todos en Markdown | No se navegan, no se comparten, no se citan como fuente con corte y cobertura |
| **Material de anclas disperso** | `docs/POST_LINKEDIN_*.md`, `presentacion-*.pdf`, `sintesis-*.pdf` viven sin un "home" que los ancle al producto | Rastro se ve como portafolio, no como plataforma |
| **Cero telemetría de uso** | No hay analytics, logs de producto, ni heatmaps | No se sabe qué lee la gente ni qué se queda sin encontrar |

## 3. Objetivo y no objetivos

### 3.1 Objetivo v1

Entregar una **interfaz web de solo lectura** sobre los 82 tools MCP / 14 APIs existentes, con tres lectores diferenciados pero construidos sobre la misma base de URLs y la misma semántica de respuesta (`matcher`, `cobertura`, `restriccion`, `dependencias`, `corte`).

### 3.2 No objetivos (decisiones de no hacer)

- **No agregar backend nuevo.** La UI consume exclusivamente los endpoints ya existentes (puertos 4000–4013 o el MCP server). Si un endpoint falta, se documenta como gap; no se crea.
- **No introducir datos que no estén ya en BD.** La UI muestra "vacío de evidencia" con la misma semántica que los tools (`/api/.../integridad` con `estricto=true` → 409).
- **No expandir cobertura territorial.** La Libertad primero; los demás departamentos solo si la fuente ya los trae (Fase 2 verificó 5, pero Sprint 26-08 cerró a La Libertad). **Esta es la regla vigente.**
- **No publicar afirmaciones causales.** Sin "el plan causó el gasto", sin "X provocó Y". Solo lectura descriptiva con cobertura explícita.
- **No entrenar un modelo de lenguaje.** La UI usa los datos crudos + un servidor de búsqueda. No hay LLM en el primer release.
- **No monetizar ni capturar leads.** Sin login en v1. Sin cookies de tracking más allá de un contador de uso agregado y público.

### 3.3 Métricas de éxito

| Métrica | Meta de aceptación | Cómo se mide |
|---|---|---|
| Cobertura de los 3 lectores | GORE, prensa, auditoría — los 3 navegables end-to-end sin terminal | QA manual: 5 consultas por lector sin tocar consola |
| Latencia percibida | P95 < 1.5 s en vista con 50 filas; P95 < 3 s en vista con 500 | Logs de la UI + cronómetro de QA |
| Trazabilidad de fuente | Cada cifra visible cita `fuente` + `corte` + `cobertura` | Linter de UI: ningún número sin metadata |
| Cero alucinaciones de UI | Ningún endpoint de UI devuelve dato que no vino de la API; cero inferencias | Test E2E + diff de JSON |
| Honesta con la frescura | Cada página muestra cuándo se ingirió el último lote (de `meta_sources`) | Visible en header de página |
| Reutilización del contrato API | Cero endpoint nuevo en `apps/*/api`; cero migración nueva | `git diff` entre este PRD y el cierre de Fase 2 |

## 4. Principios (mantener la disciplina existente)

| # | Principio | Cómo se refleja en la UI |
|---|---|---|
| P1 | **Vacío de evidencia, no conclusión** | Cada celda vacía muestra el ícono y la nota del tool (`"404 = no vínculo materializado, no conclusión sobre el proveedor"`) |
| P2 | **Cobertura antes que narrativa** | Cada vista declara su alcance ("solo La Libertad", "5 regiones piloto", "snapshot manual") antes de mostrar datos |
| P3 | **Corte y frescura visibles** | Header muestra `última corrida MEF: 2026-08-26 14:32 (manual)` con enlace al `meta_sources` |
| P4 | **Sin causalidad sin diseño** | La UI describe, no explica. Comparativos con etiqueta "exploratorio" se renderizan con color distinto |
| P5 | **Cobertura parcial ≠ error** | Estados `PARCIAL` / `BLOQUEADA` / `NO_APLICA` se renderizan con texto explícito, no como spinner ni celda vacía silenciosa |
| P6 | **API-only por debajo** | La UI no llama a bases de datos; todo pasa por `apps/*/api`. Si la API está caída, la UI muestra 503 honesto |

## 5. Diseño (alto nivel)

### 5.1 Tres lectores, una plataforma

| Lector | Pregunta que responde | Tools MCP clave | URL pública |
|---|---|---|---|
| **GORE La Libertad** | "¿Cómo vamos vs la cohorte? ¿Dónde está el vacío?" | `radar_ejecucion_sector_ficha`, `radar_ejecucion_benchmark`, `radar_ejecucion_budget_movement`, `ceplan_estrategico_crossref_territorial` | `/gore/la-libertad` |
| **Prensa de datos** | "¿Cuál es el proveedor X? ¿Cuánto contrató? ¿Fue sancionado?" | `identidad_fiscal_contribuyente_by_ruc`, `compras_publicas_supplier_by_id`, `proveedores_sancionados_sanciones`, `compras_publicas_suppliers` | `/proveedor/{ruc}` |
| **Auditoría / OCI** | "¿Qué obras hay en este distrito? ¿Tienen cierre, operador, mantenimiento?" | `radar_ejecucion_infrastructure_assets`, `infobras_public_works`, `radar_ejecucion_infrastructure_integrity` | `/distrito/{ubigeo}` |

### 5.2 Stack propuesto (a confirmar en TICKETS)

- **Frontend:** **Vite 5 + React Router 6 + Tailwind v4** (mismo lenguaje visual de `Rastro-landing.html`). SPA pura, sin SSR.
- **Consumo de datos:** cliente HTTP a las 14 APIs (puertos 4000–4013) en el navegador; **`fetch(..., { cache: 'no-store' })` en cada llamada** para forzar revalidación honesta y respetar P3 (sin SWR stale-while-revalidate). Loading state explícito: spinner + "consultando API…", nunca datos viejos.
- **Búsqueda:** un endpoint interno (`/api/search`) que pregunta a 3 tools MCP clave (`radar_inversiones_investments` filtrado por texto + `identidad_fiscal_contribuyentes` + `infobras_public_works`) y los une por rank.
- **Hosting:** **Cloudflare Pages** (D5 cerrada). No se usa Vercel; Fly.io queda como plan B documentado si en el futuro aparece lógica server-side que Workers no cubra.
- **Observabilidad:** logs estructurados a un endpoint público de "estado del producto" (no más PII que `count`, `path`, `latencyMs`).

### 5.3 Lo que la UI NO hace en v1

- No es un CMS. No edita nada.
- No es un dashboard ejecutivo con KPIs inventados. Lo que muestra, lo trae la API.
- No es un buscador nacional. Solo La Libertad en v1; el resto aparece solo si la API responde con datos verificados.
- No tiene login ni roles. Si en el futuro se agregan, se reabre el PRD.

## 6. Personas y casos de uso

| Persona | Necesidad | Resultado esperado en v1 |
|---|---|---|
| Especialista de planeamiento del GORE La Libertad | Comparar su sector vs la cohorte nacional sin abrir terminal | Abre `/gore/la-libertad`, ve ficha del sector, ve benchmark con percentil |
| Periodista de datos (OjoPúblico, IDL-Reporteros, Convoca) | Verificar un RUC o un CUI antes de publicar | Pega RUC en `/proveedor/{ruc}` → ve identidad, contrataciones, sanciones, observaciones de proveedores |
| Auditor OCI | Saber qué obras tienen cierre y cuáles no, en su ámbito | Abre `/distrito/{ubigeo}` → ve tabla con activos + estado de integridad |
| Ciudadano curioso | Entender qué se invierte en su región | Abre `/gore/la-libertad` → ve resumen con corte y fuente explícitos |
| Agente externo (otro LLM con MCP) | Consumir los 82 tools por su cuenta | Sin cambios: el MCP server sigue siendo el canal programático |

## 7. Riesgos y mitigaciones

| Riesgo | Mitigación |
|---|---|
| Que la UI "prometa" más de lo que la API entrega (alucinación de frontend) | Test E2E que compara JSON de la API con JSON renderizado; cualquier diff rompe CI |
| Que el dato esté desactualizado y se muestre como vigente | Header de página con `última corrida` desde `meta_sources`; color ámbar si > 7 días |
| Que el equipo de ui quiera "rellenar" vacíos para que se vea bonito | Linter de UI: bloquea cualquier nodo de tabla sin `matcher`/`cobertura`/`corte` |
| Que la audiencia quiera expansión nacional inmediata | `cobertura: LA LIBERTAD` visible; el botón "expandir" muestra el roadmap, no promete fecha |
| Que el hosting (Cloudflare Pages) cobre por tráfico no esperado | Rate limit por IP en el `/api/search`; HTTP 429 con `Retry-After` en `/proveedor/{ruc}` después de 60 req/min |

## 8. Entregables de v1

1. **Aplicación web** desplegada en **Cloudflare Pages** (D5 cerrada), con los 3 lectores navegables.
2. **Documentación pública de la API consumida** (página `/docs/api` que enumera los tools MCP con su semántica).
3. **Página de estado del producto** (`/estado`) que muestra `meta_sources` de cada app en una tabla.
4. **Manual de uso** (1 página Markdown) que explica cómo citar Rastro en un medio o un informe.
5. **Reporte de smoke test** de los 3 lectores con corte y cobertura visibles.

---

## 9. Decisiones abiertas (a resolver en Sprint 1)

| # | Decisión | Opciones | Cierre propuesto |
|---|---|---|---|
| D1 | ¿Next.js 15 o Vite + React Router? | (a) Next.js 15 (SSR) (b) Vite + React Router (SPA pura) | **CERRADA — 2026-08-29: (b) Vite + React Router.** Razón: encaja directo con Cloudflare Pages (D5), bundle liviano, deploy trivial. P3 se respeta vía `fetch(..., { cache: 'no-store' })` y loading state explícito. |
| D2 | ¿Búsqueda usa embeddings o keyword? | (a) keyword (b) embeddings vía `SEMANTIC_EMBEDDINGS_URL` ya configurado | (a) v1, (b) v2 si Ricardo confirma |
| D3 | ¿Anclar a La Libertad o mostrar 5 regiones con cobertura parcial visible? | (a) solo La Libertad (b) 5 regiones con `cobertura: PARCIAL` visible | (b) si la API ya responde, (a) si no |
| D4 | ¿Publicar `/estado` o un panel más simple? | (a) `/estado` con tabla de `meta_sources` (b) badge simple en footer | (a) — coherente con P3 |
| D5 | **¿Cloudflare Pages o Fly.io?** | (a) **Cloudflare Pages** (build estático de Vite); edge global; free tier generoso; sin adapter; ideal para SEO y latencia desde LATAM. (b) **Fly.io** (contenedor Node que sirve `dist/` con un servidor estático como Caddy/Nginx); útil solo si más adelante se requiere lógica de servidor que Cloudflare Workers no resuelva. | **CERRADA por D1 — 2026-08-29: (a) Cloudflare Pages.** D1=Vite hace (a) el camino de menor fricción. Fly.io queda como plan B si en Sprint 11+ aparece una necesidad de server-side que Workers no cubra. **No se usa Vercel** (preferencia de Ricardo). |
