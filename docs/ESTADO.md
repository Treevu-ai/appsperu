# Estado del proyecto — Follow the Sol

Última actualización: 2026-08-27.

Once apps standalone con API propia; ocho de ellas también tienen frontend Next.js verificado. `ceplan-geo`, `actividad-agraria` y `seguridad-ciudadana` son API-only (sin web, por la política acordada de no construir más frontends nuevos — ver "Cómo levantar todo de nuevo" más abajo). `salud-institucional` no tiene Postgres propio — es un agregador de solo lectura sobre las otras fuentes.

## Última sesión operativa — 2026-08-27

Alcance del proyecto reducido a **La Libertad únicamente** (decisión de producto) — Lambayeque, Piura, Cajamarca y Cusco quedan fuera de scope; sus memos de análisis se conservan como histórico sin actualizar.

- **INFOBRAS destrabado localmente**: el cloud agent no alcanza `infobras.contraloria.gob.pe` (timeout de red); ingesta corrida en máquina local sin ese bloqueo. Verificado: 178,638 obras totales en BD, 10,134 en La Libertad.
- **4 apps certificadas en el ledger de cobertura territorial** (`territorial_coverage`) que estaban `BLOQUEADA` solo por falta del script de materialización, no por falta de datos: `identidad-fiscal` (106,918 contribuyentes), `proveedores-sancionados` (certifica por cruce RUC↔identidad-fiscal, sin UBIGEO propio), `actividad-agraria` (108 registros MIDAGRI), `salud-institucional` (score derivado — certifica verificando que sus 5 dependencias estén completas).
- **Nueva app — `seguridad-ciudadana`** (ver sección dedicada más abajo): denuncias policiales SIDPOL (MININTER).
- Checkpoint final: `cobertura:territorial -- --jurisdiccion "LA LIBERTAD" --require-complete` sale exit 0 — las 9 apps aplicables a La Libertad quedan `COMPLETA_VERIFICADA`; solo `ceplan-estrategico` permanece `NO_APLICA` por diseño (sin llave geográfica departamental).
- **Bug de infraestructura encontrado y corregido**: `.gitignore` de `radar-ejecucion/api` tenía una entrada bare `coverage` (pensada para el output de test-coverage) que también atrapaba `src/coverage/` — el módulo real detrás de `cobertura:territorial`. Nunca había llegado a git; CI fallaba en el PR hasta corregirlo (`coverage` → `/coverage`).
- `scripts/seguimiento-semanal-territorial.ps1` + tarea de Windows Task Scheduler (miércoles 7pm hora Perú): re-ingesta MEF/INFOBRAS/Invierte y guarda snapshot de cobertura territorial por corrida.
- PR #27 (`cursor/alsol-ingest-5-regiones-f938` → `master`) mergeado, CI 19/19 jobs verdes.

## Sesión anterior — 2026-08-26

- Se implementó `ceplan-geo` (API 4005, PostGIS 5437): ingesta WFS de distritos/aeropuertos/puertos, endpoints de lectura, cruces con `radar-inversiones`/`infobras`/`radar-ejecucion`, CLI `cobertura:geoserver` y 11 tools MCP.
- Sin frontend web — puerto 3005 sigue reservado.
- **Planificación Fase 2** (5 regiones ALSOL: La Libertad, Lambayeque, Piura, Cajamarca, Cusco): PRD y backlog en `docs/PRD_CEPLAN_ALSOL_Fase2_5Regiones_v1.md` y `docs/BACKLOG_CEPLAN_ALSOL_Fase2_5Regiones_v1.md` — puente ceplan-estrategico↔geo, indicadores SEG/PBA, spike capas geo, memos regionales.
- **Sprint 6 cerrado:** spike CG-25 (`npm run spike:layers`); matriz cobertura 5 regiones; contratos API territorial y PBA; tests piloto 5 deptos.
- **Sprint 7 cerrado:** `GET /api/crossref/territorial` (ceplan-estrategico) + `GET /api/territories/summary` (ceplan-geo); 2 tools MCP nuevos; validación documentada en `docs/validacion-crossref-territorial-5-regiones-2026-08.md`.
- **Sprint 8 cerrado:** `GET /api/indicators/seg`, `/execution-efficiency`, `/plan-budget-alignment`; proxy departamental MEF+INFOBRAS; CLI `indicators:regional`; 3 tools MCP nuevos (60 total).
- **Sprint 9 cerrado:** plantilla memo ALSOL + 6 memos Lambayeque/Piura; preflight PARCIAL documentado; geo verificado (38 y 65 distritos).
- **Sprint 10 cerrado — Fase 2 ALSOL lista para review:** memos Cajamarca y Cusco; índice comparativo 5 regiones; release checklist; 60 tools MCP; 10 memos regionales + plantilla.

Sesión anterior (2026-08-24):

- INFOBRAS e Invierte.pe fueron refrescados para La Libertad; se recorrieron los cinco rangos
  del CSV de Invierte publicados por el MEF y se corrigió INFOBRAS para descubrir el enlace
  diario del XLSX en vez de depender de una URL fija.
- El cruce INFOBRAS ↔ radar-ejecución se reconstruyó (75 coincidencias confirmadas y 17
  candidatas) y las nueve APIs disponibles respondieron correctamente en sus puertos.
- Se detectó y corrigió una colisión temporal: 4002 servía una segunda instancia de
  `compras-publicas`; ahora vuelve a servir `radar-inversiones`.

Registro técnico reproducible, resultados de recarga y límites:
[`docs/SESION_ACTUALIZACION_DATOS_Y_RUNTIME_2026-08-24.md`](SESION_ACTUALIZACION_DATOS_Y_RUNTIME_2026-08-24.md).

## Apps

| App | Dominio | API | Web | Postgres | Estado |
|---|---|---|---|---|---|
| `radar-ejecucion` | Presupuesto/ejecución (MEF) + benchmark territorial | 4000 | 3000 | 5432 | Construida, probada, verificada |
| `compras-publicas` | Contrataciones (OECE/OCDS) + proveedores/concentración | 4001 | 3001 | 5433 | Construida, probada, verificada |
| `radar-inversiones` | Inversiones (Invierte.pe) | 4002 | 3002 | 5434 | Construida, probada, verificada |
| `infobras` | Obras públicas (Contraloría) | 4003 | 3003 | 5435 | Construida, probada, verificada |
| `ceplan-estrategico` | Gestión estratégica del Estado (ObservaPerú, agregado por nivel de gobierno) | 4004 | 3004 | 5436 | Construida, probada, verificada |
| `identidad-fiscal` | Padrón RUC (SUNAT) + cruce con proveedores/entidades | 4006 | 3006 | 5438 | Construida, probada, verificada |
| `salud-institucional` | Score compuesto por entidad (agrega las otras 5, sin base propia) | 4007 | 3007 | — | Construida, probada, verificada |
| `proveedores-sancionados` | Inhabilitaciones/multas del Tribunal de Contrataciones (RNP/OECE) | 4008 | 3008 | 5439 | Construida, probada, verificada |
| `actividad-agraria` | Serie MIDAGRI de jornal agrícola por departamento/año/mes | 4009 | — (API-only) | 5440 | Construida (API), sin web |
| `seguridad-ciudadana` | Denuncias policiales SIDPOL (MININTER) por distrito/mes/modalidad | 4010 | — (API-only) | 5441 | Construida (API), sin web |
| `ceplan-geo` | GeoServer (capas territoriales/infraestructura) | 4005 | — (reservado 3005) | 5437 (PostGIS) | Construida (API), sin web |

Puerto 4005/3005/5437 quedó reservado para `ceplan-geo` y no se reutilizó en las apps
construidas después. `actividad-agraria` y `seguridad-ciudadana` son API-only por la misma
política (ver "Cómo levantar todo de nuevo").

## `mcp-server` (2026-08-26)

Servidor MCP standalone (`mcp-server/`, transporte stdio) que expone las APIs como tools de
solo lectura para un agente Claude — un tool por endpoint `GET /api/*` real, sin transformar el
shape de la respuesta. Catálogo derivado de `docs/conectores.md` (cada `description` de tool
incluye cobertura parcial/completa y el recordatorio de que ninguna ingesta tiene scheduler).
Validado manualmente: registro del catálogo, llamada con query params reales contra una API
fake, y manejo de error de conectividad cuando la API de destino no responde — más test
automatizado del catálogo (`mcp-server/src/__tests__/catalog.test.ts`). No incluye las ingestas
(`npm run ingest:*`, fuera de alcance) ni autenticación (mismo estado que las APIs que agrega — ver
`mcp-server/README.md`, sección "Alcance actual y lo que falta", antes de exponerlo fuera de
`localhost`).

64 tools (11 apps). `actividad-agraria` y `seguridad-ciudadana` se registraron el 2026-08-27
(4 tools nuevos: `actividad_agraria_wage`, `actividad_agraria_crossref`,
`seguridad_ciudadana_denuncias`, `seguridad_ciudadana_crossref`).

## Cruces entre apps (todos verificados con datos reales)

- **radar-inversiones ↔ radar-ejecucion**, por `SEC_EJEC` (match exacto, sin fuzzy) —
  `GET /api/crossref` en `radar-inversiones/api`.
- **compras-publicas ↔ radar-ejecucion**, por nombre de entidad (matcher difuso,
  `confirmada`/`candidata`) — `GET /api/crossref` en `compras-publicas/api`, persistido en
  `entity_crosswalk` (recalculable vía `npm run crossref:build`).
- **infobras ↔ radar-inversiones**, por `CUI` (match exacto, sin fuzzy) —
  `GET /api/crossref` en `infobras/api`.
- **infobras ↔ radar-ejecucion**, por nombre de entidad (mismo matcher difuso que
  compras-publicas, copiado, `confirmada`/`candidata`) — `GET /api/crossref/ejecucion` en
  `infobras/api`, persistido en `entity_crosswalk` (recalculable vía `npm run crossref:build`,
  necesita `EJECUCION_DATABASE_URL` en `.env`). La migración que crea esta tabla
  (`003_entity_crosswalk.sql`) existía en el código desde antes pero nunca se había aplicado
  ni poblado — se corrió por primera vez el 2026-08-20 (74 confirmadas + 15 candidatas de 121
  entidades).
- **ceplan-estrategico ↔ radar-ejecucion**, por nivel de gobierno (`GN`/`GR`, único bucket
  exacto entre las dos fuentes) — `GET /api/crossref` en `ceplan-estrategico/api`.
- **identidad-fiscal ↔ compras-publicas**, por RUC exacto — `awards.supplier_id` ya trae el
  RUC embebido (`PE-RUC-<11 dígitos>`, 77.3% de cobertura en la muestra real) — `GET
  /api/crossref` en `identidad-fiscal/api`. Marca proveedores con estatus tributario
  irregular (BAJA/NO HABIDO en SUNAT) que ganaron contratos públicos.
- **identidad-fiscal ↔ radar-ejecucion**, por nombre de entidad — reutiliza tal cual el
  matcher difuso de `compras-publicas` (sin ninguna modificación, copiado a
  `identidad-fiscal/api/src/crossref/match.ts`) — `GET /api/crossref/entidades`. Resuelve el
  RUC de cada gobierno/municipalidad para chequear su propio estatus tributario.
- **proveedores-sancionados ↔ compras-publicas**, por RUC exacto (mismo patrón que
  identidad-fiscal) — `GET /api/crossref` en `proveedores-sancionados/api`. Señal más fuerte
  que el estatus tributario: una inhabilitación `VIGENTE` es una prohibición legal de
  contratar con el Estado, no solo una irregularidad administrativa.
- **actividad-agraria ↔ radar-ejecucion**, por `departamento` exacto (sin fuzzy) — `GET
  /api/crossref` en `actividad-agraria/api`. Cruza el jornal agrícola (MIDAGRI) contra la
  ejecución de la función AGROPECUARIA, distinguiendo ejecución con sede regional/local de
  gasto de Gobierno Nacional dirigido al departamento.
- **seguridad-ciudadana ↔ radar-ejecucion**, por `departamento` exacto (sin fuzzy, mismo patrón
  que actividad-agraria) — `GET /api/crossref` en `seguridad-ciudadana/api`. Cruza denuncias
  SIDPOL contra la ejecución de la función ORDEN PUBLICO Y SEGURIDAD — dos series independientes
  para lectura conjunta, no implica causalidad.
- **salud-institucional** no es un cruce par-a-par, es un agregador: combina ejecución
  (radar-ejecucion, propia), obras no paralizadas (infobras, vía su crosswalk), inversiones
  sin sobrecosto (radar-inversiones, SEC_EJEC exacto), compras no concentradas
  (compras-publicas, vía su crosswalk) y salud tributaria de proveedores (identidad-fiscal,
  RUC exacto) en un solo score por `entity_code`. Si una fuente no tiene dato para una
  entidad, ese componente se omite del promedio — nunca se imputa 0 ni 100 por ausencia.

## Cómo levantar todo de nuevo

Por cada app con base propia (`apps/<nombre>/api` — todas menos `salud-institucional`):

```bash
docker compose up -d          # levanta Postgres (los datos ya ingeridos persisten en el volumen)
cp .env.example .env          # si no existe ya
npm run migrate               # idempotente, solo aplica migraciones nuevas
npm run dev                   # API
```

`salud-institucional/api` no tiene `docker-compose.yml` ni `migrate` — solo `.env` con las
connection strings de las otras bases y `npm run dev`.

Y en `apps/<nombre>/web` — todas las apps tienen web excepto `ceplan-geo`, `actividad-agraria`
y `seguridad-ciudadana` (API-only por política, ver arriba):

```bash
cp .env.example .env
npm run dev                   # frontend
```

Los contenedores de Postgres quedan corriendo entre sesiones (no se detienen al cerrar);
los procesos `npm run dev` sí se detienen al final de cada sesión.

Los puertos de Postgres se publican en `127.0.0.1` (no `0.0.0.0`) y Adminer ya no se
levanta por defecto — solo en `radar-ejecucion` y `ceplan-estrategico`, vía
`docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d adminer`.

Cada API aplica `helmet`, CORS restringido al origin del frontend (`WEB_ORIGIN` en `.env`,
default `http://localhost:<puerto-web>`) y rate limiting (100 req/min) en `/api/*`.

Toolchain actualizado (2026-08-17): `vitest`/`vite`/`@vitejs/plugin-react` a sus últimas
majors (0 vulnerabilidades), y `next` 14 → 15.5.23 en las webs (React se queda en 18.3, Next
15 lo soporta). Las páginas con rutas dinámicas (`[id]`, `[ocid]`, etc.) y `searchParams`
ahora usan el patrón async de Next 15 (`params`/`searchParams` son `Promise`). Las páginas
que hacen fetch en vivo (todas las de `/cruce` y las agregadoras) llevan
`export const dynamic = "force-dynamic"` explícito — sin esto, `next build` intenta
pre-renderizarlas en build time y se puede colgar (confirmado en vivo con
`salud-institucional/web`: la página `/cruce` recalcula el score de 121 entidades contra
~2.3M contribuyentes, y el build se quedaba esperando esa respuesta indefinidamente).

**Riesgo de dependencias aceptado, con fecha de revisión (2026-08-20)**: `npm audit` marca 3
vulnerabilidades high en cada web (`postcss` — XSS al stringify CSS y lectura arbitraria de
`.map` vía `sourceMappingURL`; `sharp` — CVEs heredadas de libvips). El único fix disponible es
`npm audit fix --force`, que salta a Next 16 (breaking, requiere React 19) — un upgrade real en
las 8 webs existentes al día de hoy (`radar-ejecucion`, `compras-publicas`,
`radar-inversiones`, `infobras`, `ceplan-estrategico`, `identidad-fiscal`,
`salud-institucional`, `proveedores-sancionados`), no un parche menor.

Decisión: **no migrar por ahora**. Ninguna de estas apps procesa CSS de usuario ni sube
imágenes, así que ninguna de las dos superficies de ataque reales de estos CVEs aplica en un
entorno de desarrollo local. Dos condiciones que invalidan esta decisión y obligan a revisarla:
1. **Antes de desplegar cualquiera de estas webs públicamente** — ahí "sin superficie de
   ataque" deja de ser cierto.
2. **Si se agrega una función que procese CSS/imágenes de usuario** en cualquier app futura.

Política acordada el mismo día: **no se construyen más frontends web nuevos** para apps
futuras de este proyecto — solo API. Esto detiene el crecimiento del residual de `npm audit`
sin necesitar la migración; las 8 webs ya construidas se quedan como están, sin tocar.

## Documentación

- `docs/conectores.md` — ficha técnica por conector (qué hace, cómo, con qué frecuencia,
  fuente de datos), con link al data contract correspondiente para el detalle profundo.
- `docs/data-contracts/` — un archivo por fuente externa (MEF, OECE, Invierte.pe, INFOBRAS,
  ObservaPerú/CEPLAN, Padrón RUC de SUNAT, Tribunal de Contrataciones vía RNP/OECE), con lo
  confirmado en vivo: URLs reales, formato real, anomalías de datos, tasas de cobertura.
  También `salud-institucional-score.md`, que documenta la fórmula del score compuesto y sus
  limitaciones (pesos iguales sin calibrar, no distingue cruce exacto de difuso).
- `docs/adr/` — decisiones arquitectónicas con su razón, no solo el qué.
- `docs/Follow_the_Sol_Peru_Public_Spending_Graph.pdf` — el documento fuente original con el
  roadmap de apps.
- `docs/analisis-la-libertad-2026-08.md` — primer análisis de contenido (brechas y
  competitividad), con draft de post listo.
- `docs/analisis-la-libertad-desarrollo-economico-2026-08.md` — segundo análisis (inversión
  productiva territorial, riego costa vs. sierra).

## `ceplan-estrategico` — Sprint 1 (2026-08-17)

Ingesta real desde `https://observaperu.ceplan.gob.pe` (JSON estático, no requiere sesión —
ver data contract). El modelo per-entidad planeado originalmente no fue posible con datos
públicos: se ingieren indicadores agregados por nivel de gobierno (`GN`/`GR`/`MP`/`MD`/`Total`),
no por pliego. `GET /api/indicators` expone el catálogo completo; `GET /api/crossref` cruza
con `radar-ejecucion` (GN/GR únicamente, único bucket exacto entre las dos fuentes). Web:
página de indicadores (`/`, filtro por nivel de gobierno) y de cruce (`/cruce`). Detalle
completo, incluida la limitación de PIM=0 en la muestra de `radar-ejecucion` para 2026, en
`docs/data-contracts/ceplan-strategic-planning.md`.

### Documentación de planificación de CEPLAN
- Data contracts: `docs/data-contracts/ceplan-strategic-planning.md`, `docs/data-contracts/ceplan-geo.md`
- ADRs: `docs/adr/0003-ceplan-estrategico-app-standalone-y-connector-observaperu.md`, `docs/adr/0004-ceplan-geo-app-standalone-y-connector-geoserver.md`
- Matriz de cruces: `docs/adr/0005-matriz-de-cruces-ceplan-con-ecosistema-existente.md`
- Roadmap: `docs/roadmap-ceplan.md`

### Indicadores derivados — Fase 2 planificada (Sprints 8–10)

Ver [`docs/PRD_CEPLAN_ALSOL_Fase2_5Regiones_v1.md`](PRD_CEPLAN_ALSOL_Fase2_5Regiones_v1.md):

- **Strategic Execution Gap (SEG)**: nacional CEPLAN (CUMP03−CUMP02) + proxy departamental MEF/INFOBRAS
- **Execution Efficiency**: ratio avance físico / ejecución presupuestal
- **Plan–Budget Alignment**: mapeo heurístico dimensión CEPLAN → función MEF por departamento
- **Enriquecimiento territorial**: cruce `ceplan-estrategico` ↔ `ceplan-geo` por departamento (no per-entidad)

`salud-institucional` (2026-08-20) cubre parcialmente el espíritu de SEG/Execution Efficiency
con datos reales de 5 fuentes, aunque no usa CEPLAN como insumo — es un índice paralelo, no
una implementación de estos indicadores.

## `identidad-fiscal` (2026-08-20)

Ingiere el Padrón Reducido RUC de SUNAT (18.3M contribuyentes → filtrado a personas jurídicas
RUC-20, ~2.3M) — descarga directa sin login, se actualiza a diario. `GET /api/contribuyentes`
(búsqueda), `GET /api/crossref` (proveedores irregulares) y `GET /api/crossref/entidades`
(RUC de gobiernos/municipalidades). Ingesta real verificada: 2,339,313 filas aceptadas, 0
rechazadas. Hallazgo de ingeniería: la primera versión (una sola transacción para 2.3M filas)
era patológicamente lenta (40+ min); commits por lote lo bajó a ~4 minutos. Detalle completo
en `docs/data-contracts/sunat-padron-ruc.md`.

## `salud-institucional` (2026-08-20)

Sin base propia — agrega en vivo las otras 5 apps en un score compuesto 0-100 por entidad
(`GET /api/score`). Verificado: 121/121 entidades de La Libertad con al menos un componente
disponible. Hallazgo de ingeniería: el cruce de entidades sin acotar por región tardaba 89s
por request (comparaba contra los 2.3M contribuyentes completos); acotar por prefijo de
ubigeo del departamento lo bajó a ~2s. Detalle completo en
`docs/data-contracts/salud-institucional-score.md`.

## `proveedores-sancionados` (2026-08-20)

Ingiere inhabilitaciones y multas del Tribunal de Contrataciones vía el portal de RNP/OECE
(`rnp.gob.pe`) — descartado explícitamente el dataset homónimo de `datosabiertos.gob.pe` por
estar abandonado desde 2018. El export real se replica por HTTP directo (`GET` para cookie de
sesión + `POST` al endpoint real del botón "Exportar Excel") sin necesitar navegador ni
resolver el captcha visible en la página — esa función específica del sitio no lo valida ni
en cliente ni en servidor (confirmado con MD5 idéntico contra la descarga manual). Ingesta
real: 17,919 filas (11,208 inhabilitaciones + 6,681 multas tras dedup), 1 sola rechazada.
`GET /api/sanciones?ruc=` y `GET /api/crossref`. Detalle completo, incluido el caveat de que
"vigente hoy" no equivale a "vigente al momento de la adjudicación", en
`docs/data-contracts/proveedores-sancionados.md`.

## `seguridad-ciudadana` (2026-08-27)

Ingiere SIDPOL (MININTER, vía `datosabiertos.gob.pe`) — denuncias policiales ya agregadas por
distrito/mes/modalidad (Robo, Hurto, Extorsión, Estafa, Violencia contra la mujer e
integrantes, Otros, Secuestro), CSV nacional único enero 2018–julio 2026 (27.4 MB, no requiere
streaming por rangos como MEF). Portal detrás de un WAF que bloquea requests sin User-Agent de
navegador (mismo patrón que `actividad-agraria`). `GET /api/denuncias` (consulta con filtros
departamento/provincia/año/modalidad) y `GET /api/crossref` (cruce con gasto MEF en la función
ORDEN PUBLICO Y SEGURIDAD). Ingesta real verificada: 369,100 filas nacionales, 0 rechazadas;
21,902 filas para La Libertad (381,718 denuncias acumuladas 2018-2026). `UBIGEO_HECHO` pierde
el cero inicial en el origen para departamentos 01-09 (ej. `10202` en vez de `010202`) — se
reconstruye a 6 dígitos en la normalización; La Libertad (departamento 13) nunca tiene este
problema. Certificada `COMPLETA_VERIFICADA` en `territorial_coverage`.

## Fix de datos — PIM=0 en `radar-ejecucion` (2026-08-18)

`budget_execution.pim` estaba en 0 en el 100% de las filas ingeridas: el MEF no puebla
`MONTO_PIA`/`MONTO_PIM` en las filas de movimiento mensual del CSV (`MES_EJE` 1-7), solo en
filas separadas `MES_EJE=0` (que a su vez traen `MONTO_DEVENGADO` en 0). Una ingesta de una
sola ventana de bytes solo capturaba uno de los dos campos. Se implementó
`ingestMefFullYearForDepartamento` — descarga las 16 secciones (2 niveles de gobierno × 8
meses) necesarias para LA LIBERTAD, agrega todo en una sola pasada y escribe PIA/PIM/devengado
coherentes en las mismas filas. Resultado real verificado: Gobiernos Regionales 49.2% de
avance (S/2,242.1M devengado / S/4,558.8M PIM), Gobiernos Locales 39.9%
(S/1,092.5M / S/2,738.0M). Detalle completo en
`docs/data-contracts/mef-presupuesto-ejecucion.md`.

## Pendientes conocidos (no bloqueantes, para cuando se retome)

1. `ceplan-estrategico`: modelo per-entidad (PEI/POI/metas por pliego) si el Aplicativo
   CEPLAN V.01 vuelve a estar disponible — hoy solo hay datos agregados por nivel de
   gobierno (ver Sprint 1 arriba). `strategic_objectives`/`strategic_actions`/
   `poi_activities`/`physical_targets` siguen sin poblar.
2. ~~Implementación de `ceplan-geo`~~ — **hecho (API-only, 2026-08-26)**. Spike Fase 2: `cb_redhidricax` POSPONER (345k); `cb_redhidricaprinx` AUTOMATIZABLE; `cb_proyectos` no existe — usar `ip_pry*`.
3. El resto del PRD de INFOBRAS (sprints 1-6: MCP tools, resolución de identidad avanzada,
   dashboard consolidado) — quedó fuera de alcance de la rebanada construida.
4. Todas las ingestas de `radar-ejecucion`/`radar-inversiones`/`infobras`/`compras-publicas`
   son parciales por diseño (`isPartial`, muestras acotadas por `maxPages`/`maxBytes`/
   departamento) — ampliar cobertura (más departamentos, más páginas) es un siguiente paso
   natural si se necesita ver más allá de La Libertad. `identidad-fiscal`,
   `proveedores-sancionados` y `seguridad-ciudadana` sí ingieren el universo nacional completo
   (sin acotar por departamento en el origen) — para las tres, "cobertura por departamento" es
   un filtro post-ingesta, no una limitación de la fuente.
5. Migración a Next 16 + React 19 (resuelve el residual de `npm audit`) — diferida a
   propósito, ver "Riesgo de dependencias aceptado" arriba. Revisar antes de cualquier
   despliegue público.
6. **Candidato evaluado, no implementado — comercio exterior (BCRP)**: se exploró la API
   pública de BCRPData (`estadisticas.bcrp.gob.pe/estadisticas/series/api`) como posible
   novena fuente para sector producción/comercio exterior. Es el único conector candidato
   con API REST real documentada, sin sesión ni scraping. El desagregado por departamento
   (`RD38085BM`-`RD38111BM`) está congelado en Dic-2022/Dic-2023 (re-verificado en vivo, sin
   dato posterior). El agregado nacional (`PN38714BM`-`PN38723BM`, exportaciones/
   importaciones/balanza comercial) sí está al día a jun-2026 (validado en vivo) — es la vía
   recomendada si se construye, pero es un solo número por mes, sin desagregar por producto
   ni empresa, sin cruce `entity_code`. Detalle completo en
   `docs/data-contracts/bcrp-comercio-exterior.md`.
