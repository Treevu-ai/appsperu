# Estado del proyecto — Follow the Sol

Última actualización: 2026-08-27.

Doce apps standalone con API propia; todas son API-only (sin frontend web). `salud-institucional` no tiene Postgres propio — es un agregador de solo lectura sobre las otras fuentes.

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

| App | Dominio | API | Postgres | Estado |
|---|---|---|---|---|
| `radar-ejecucion` | Presupuesto/ejecución (MEF) + benchmark territorial | 4000 | 5432 | Construida, probada, verificada |
| `compras-publicas` | Contrataciones (OECE/OCDS) + proveedores/concentración | 4001 | 5433 | Construida, probada, verificada |
| `radar-inversiones` | Inversiones (Invierte.pe) | 4002 | 5434 | Construida, probada, verificada |
| `infobras` | Obras públicas (Contraloría) | 4003 | 5435 | Construida, probada, verificada |
| `ceplan-estrategico` | Gestión estratégica del Estado (ObservaPerú, agregado por nivel de gobierno) | 4004 | 5436 | Construida, probada, verificada |
| `ceplan-geo` | GeoServer (capas territoriales/infraestructura + red hídrica/proyectos agro) | 4005 | 5437 (PostGIS) | Construida (API) |
| `identidad-fiscal` | Padrón RUC (SUNAT) + cruce con proveedores/entidades | 4006 | 5438 | Construida, probada, verificada |
| `salud-institucional` | Score compuesto por entidad (agrega las otras 5, sin base propia) | 4007 | — | Construida, probada, verificada |
| `proveedores-sancionados` | Inhabilitaciones/multas del Tribunal de Contrataciones (RNP/OECE) | 4008 | 5439 | Construida, probada, verificada |
| `actividad-agraria` | Series MIDAGRI regionales: jornal, alquiler tractor y yunta por departamento | 4009 | 5440 | Construida (API) |
| `seguridad-ciudadana` | Denuncias policiales SIDPOL (MININTER) por distrito/mes/modalidad | 4010 | 5441 | Construida (API) |
| `bcrp-comercio-exterior` | Comercio exterior agregado nacional (BCRP PN38714–PN38723) | 4011 | 5442 | Construida (API) |
| `inversion-privada` | Cartera APP/PA PROINVERSIÓN (VERTIX / investinperu.pe) | 4012 | 5443 | Construida (API) |

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

82 tools (13 apps). Ampliación 2026-08-28: cartera VERTIX APP/PA + OxI + crossref SNIP (`inversion-privada`); resultado agro SIEA, turismo MINCETUR, cadena infra obra, denominadores INEI, meta vs sede en crossref.

## Cruces entre apps (todos verificados con datos reales)

- **inversion-privada ↔ radar-inversiones**, por departamento + código SNIP en OxI (match
  exacto solo para proyectos OxI; APP/PA sin CUI) — `GET /api/crossref` en `inversion-privada/api`.
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

Los contenedores de Postgres quedan corriendo entre sesiones (no se detienen al cerrar);
los procesos `npm run dev` sí se detienen al final de cada sesión.

Los puertos de Postgres se publican en `127.0.0.1` (no `0.0.0.0`) y Adminer ya no se
levanta por defecto — solo en `radar-ejecucion` y `ceplan-estrategico`, vía
`docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d adminer`.

Cada API aplica `helmet`, CORS restringido vía `WEB_ORIGIN` en `.env` (opcional) y rate limiting (100 req/min) en `/api/*`.

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

1. ~~`ceplan-estrategico`: modelo per-entidad~~ — **bloqueado por fuente**: ObservaPerú solo trae agregados por nivel de gobierno; `GET /api/meta/aplicativo` y `npm run probe:aplicativo` verifican en vivo si Aplicativo CEPLAN V.01 vuelve a exponer PEI/POI per-pliego. Tablas `strategic_objectives`/`strategic_actions`/`poi_activities`/`physical_targets` siguen vacías por diseño.
2. ~~Implementación de `ceplan-geo`~~ — **hecho (API-only, 2026-08-26)**. Ingesta extendida 2026-08-27: `cb_redhidricaprinx` (`ingest:hydro-principal`) e `ip_prysecagr` (`ingest:projects-sectorial`). `cb_redhidricax` sigue POSPONER (345k).
3. El resto del PRD de INFOBRAS (sprints 1-6: MCP tools, resolución de identidad avanzada, dashboard consolidado) — quedó fuera de alcance de la rebanada construida.
4. ~~Ingestas parciales acotadas a La Libertad~~ — **mitigado (2026-08-27)**: defaults de `.env.example` y `DEFAULT_TERRITORIAL_SCOPE` apuntan solo a `LA LIBERTAD`; scripts `ingest:libertad` por app y orquestador `scripts/ingest-la-libertad-completo.sh` para cobertura verificada.
5. ~~Migración a Next 16 + React 19~~ — **N/A**: frontends web eliminados; el proyecto es API-only.
6. ~~BCRP comercio exterior~~ — **hecho (2026-08-27)**: app `bcrp-comercio-exterior` (API 4011) ingiere series nacionales `PN38714BM`–`PN38723BM`; sin desagregado departamental (`RD38*` sigue congelado en origen).
