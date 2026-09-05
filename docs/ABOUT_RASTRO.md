# Rastro — Documento institucional

> **Cada señal deja un rastro. Nosotros lo hacemos visible.**

Documento de referencia. Describe qué es Rastro, cómo está construido, qué hace
hoy, qué no hace, y para quién sirve. Pensado para ser leído por públicos
distintos: un vecino curioso, un periodista, un académico, un servidor público,
un desarrollador y un financiador. El índice al inicio indica por dónde entrar
según quién seas.

Última revisión: 2026-09-03.

---

## Índice

### Lectura rápida por audiencia

| Si vos sos… | Empezá por | Saltá a |
|---|---|---|
| Vecino, periodista, ciudadano curioso | §1 Resumen ejecutivo → §2 Historia → §3 Lo que hace hoy → §10 Audiencias (subsección "ciudadano") | §15 Cómo citar Rastro |
| Servidor público, gestor, fiscalizador | §1 → §3 → §4 Catálogo de las 14 fuentes → §11 Alcance territorial → §10 (subsección "servidor público") | §9 Seguridad y operación |
| Académico, investigador, estudiante | §1 → §4 → §5 Cómo funciona → §14 Glosario → §10 (subsección "académico") | §12 Roadmap (lo que viene) |
| Desarrollador, ingeniero de datos, devops | §1 → §5 → §6 Arquitectura técnica → §7 Capa de lectura → §8 Servidor MCP → §10 (subsección "desarrollador") | §9 Seguridad, runbooks de deploy |
| Financiador, donante, aliado institucional | §1 → §2 → §10 (subsección "financiador") → §12 Roadmap → §13 Equipo y gobierno | §15 Cómo citar |
| Todos | §1 | índice de arriba |

### Índice completo

1. Resumen ejecutivo
2. La historia detrás de Rastro
3. Lo que Rastro hace hoy
4. Las 14 fuentes de datos (catálogo)
5. Cómo funciona Rastro (alto nivel)
6. Arquitectura técnica
7. La capa de lectura: `rastro.fyi`
8. El servidor MCP (para agentes de IA)
9. Seguridad y operación
10. Audiencias — qué puede hacer cada uno con Rastro
11. Alcance territorial
12. Roadmap
13. Equipo y gobierno del proyecto
14. Glosario
15. Cómo citar Rastro

---

## 1. Resumen ejecutivo

**Qué es.** Rastro es una plataforma de inteligencia que cruza datos abiertos
del Estado peruano — presupuesto, contrataciones, obras públicas, inversiones,
planificación estratégica, identidad fiscal, proveedores, actividad agraria y
seguridad ciudadana — para que cualquier persona, periodista, fiscalizador o
agente de IA pueda responder preguntas que hoy requieren juntar cinco
portales y saber qué llave oficial las conecta.

**Para quién existe.** Para quien necesita decidir mejor con evidencia del
Estado peruano. El visitante no técnico entra a `rastro.fyi` y obtiene
fichas, comparativos y un buscador. El desarrollador o el agente de IA usa
el servidor MCP y obtiene respuestas estructuradas con citas a la fuente.

**Qué problema resuelve.** El Estado peruano publica sus datos en
14 portales distintos, con llaves diferentes (CUI, RUC, código INFOBRAS,
entidad presupuestal, UBIGEO) y sin un punto de cruce oficial. Rastro
construye ese cruce con verificación explícita: cuando una obra se vincula
a un proveedor, se muestra el score de confianza del match y se declara el
corte temporal usado. Si la fuente no tiene un dato, Rastro lo dice en
vez de inventarlo.

**Estado al 2026-09-03.** Las 14 apps backend están operativas con datos
ingeridos para La Libertad. La capa web en `rastro.fyi` está en producción
con corte semanal. El servidor MCP expone 83 tools para agentes IA. La
API pública está protegida con Cloudflare Access. Próximo hito: terminar
los tableros del GORE La Libertad y abrir la primera versión del paquete
de datos abiertos.

---

## 2. La historia detrás de Rastro

### 2.1 El problema de fondo

El Perú publica, en teoría, una cantidad enorme de información sobre cómo
gasta, qué contrata y qué obras ejecuta. En la práctica esa información
está fragmentada en 14 portales administrados por 9 entidades distintas,
cada una con su propio formato, su propia llave de cruce, su propio
calendario de actualización y su propio nivel de calidad:

- MEF publica el Presupuesto Institucional de Apertura (PIA) y la ejecución
 (devengado) con código de entidad presupuestal, pero sin CUI.
- Invierte.pe publica la cartera de inversiones con CUI, pero sin UBIGEO
  exacto en muchos registros.
- INFOBRAS publica obras con su propio código, pero sin nombre normalizado
  de la entidad ejecutora.
- OECE publica contrataciones con RUC, pero sin código de unidad ejecutora.
- SUNAT publica el padrón RUC, pero el RUC del proveedor no siempre
  coincide con el RUC de la entidad que contrató.

Para saber "¿esta obra la está ejecutando el mismo proveedor que en
2019?", o "¿la inversión de este sector se está ejecutando a tiempo?", un
ciudadano tiene que descargar cinco CSVs, aprender cinco modelos de datos,
y hacer un cruce que no es trivial. La mayoría no lo hace. Los que lo
hacen son los mismos de siempre: las consultoras, los periodistas con
recursos, las oficinas de integridad que pueden pagar un data scientist.

### 2.2 La idea de Rastro

Rastro nació de una pregunta directa: **¿se puede construir un cruce
de estos datos abiertos sin asumir datos que la fuente no entrega?** El
criterio rector es la honestidad:

- Si MEF no tiene el CUI de un proyecto, Rastro no lo inventa.
- Si INFOBRAS no puede vincularse a una entidad presupuestal con certeza,
  Rastro lo dice y da el score de confianza.
- Si el padrón RUC tiene 373 millones de registros y solo necesitamos los
  100 mil que ya cruzamos, Rastro no descarga el padrón completo.

Esa honestidad es la que permite que Rastro sea útil en la práctica: los
datos que se muestran tienen una cita trazable al origen y al corte
temporal del que salieron.

### 2.3 Por qué La Libertad

La primera versión de Rastro apuntaba a cinco regiones (La Libertad,
Lambayeque, Piura, Cajamarca, Cusco) por su volumen de inversión pública
y diversidad de proyectos. En agosto 2026 se tomó la decisión de reducir
el alcance a **La Libertad únicamente**: terminar una región con calidad
verificable es más útil que tener cinco regiones a medias. Las otras
cuatro regiones quedan en el repositorio como histórico y se pueden
reactivar regionalizando las apps que hoy filtran solo por La Libertad.

### 2.4 Quién está detrás

Rastro es desarrollado por **Treevu** (Treevu-ai en GitHub), un equipo
pequeño con experiencia en datos públicos peruanos e IA aplicada a
política pública. El proyecto se sostiene con fondos propios y horas
de colaboradores. No tiene dependencia operativa de ninguna entidad
del Estado — los datos que usa son los mismos que cualquiera puede
descargar de los portales oficiales.

---

## 3. Lo que Rastro hace hoy

Rastro tiene **tres productos concretos** que se pueden usar hoy.

### 3.1 La web pública — `rastro.fyi`

Una página que cualquier persona puede abrir en el navegador. Muestra,
para La Libertad, lo siguiente:

- **Catálogo de los 14 portales de datos** con la frescura de cada uno
  (última fecha de ingesta, número de registros, cobertura departamental).
- **Fichas por sector presupuestal** (Transporte, Salud, Educación, etc.)
  con PIA, PIM, devengado, avance, y comparativo entre sectores.
- **Fichas por entidad** (ministerios, gobiernos regionales, unidades
  ejecutoras) con su cohorte, su percentil de avance, y sus exclusiones
  documentadas.
- **Fichas por distrito** (los 83 distritos de La Libertad) con sus obras
  en INFOBRAS y su cartera de inversiones.
- **Fichas por RUC** con identidad fiscal, sanciones vigentes y
  contrataciones como proveedor.
- **Buscador libre** que combina identidad fiscal, inversiones y obras
  públicas en una sola respuesta.
- **Catálogo PNDA** (plataforma nacional de datos abiertos) con la
  metadata que el MEF exige para publicar datasets.
- **Mapa de cobertura territorial** que muestra, fuente por fuente,
  qué tan completa está la información de La Libertad.

La web se actualiza con un **corte semanal** (todos los miércoles): un
script snapshot genera un bundle de datos que se mete al build de la
aplicación. Eso significa que la web es **rápida, predecible y no se
cae** cuando una API del Estado está caída.

### 3.2 El servidor MCP — para agentes de IA

Un servidor local que se conecta a Claude Code, Claude Desktop, Cursor,
Windsurf, Cline y Continue.dev, y le entrega al agente 83 herramientas
de solo lectura para consultar las mismas 14 APIs. Un agente con el MCP
conectado puede responder preguntas como:

- "¿Cuál es la inversión del sector Salud en La Libertad este año y cómo
  se compara con la del 2025?"
- "Dame la lista de obras paralizadas en la provincia de Trujillo con
  más de 180 días de paralización y un Cost Drift mayor al 30%."
- "Compara la concentración de proveedores entre el Gobierno Regional
  La Libertad y el Ministerio de Transportes."

Las respuestas vienen con la cita de qué endpoint se consultó y a qué
corte temporal. El agente no tiene que aprender el modelo de datos:
pregunta con lenguaje natural, Rastro le devuelve la ficha.

### 3.3 El catálogo de datasets — para abrir datos

Rastro tiene un endpoint de catálogo (`/api/datasets` y `/docs/api` en la
web) que documenta cada uno de los 14 portales con su metadata, su
frecuencia de actualización, su calidad de cobertura y sus limitaciones
declaradas. Es la base del paquete de datos abiertos que se va a
publicar en datosabiertos.gob.pe.

### 3.4 Lo que Rastro **no** hace

- **No es un sistema de denuncias ni de fiscalización.** Rastro muestra
  datos, no los investiga. Una obra paralizada en Rastro no es
  necesariamente una obra con irregularidad; es una obra sin avance
  físico. La diferencia la pone un fiscalizador, no un dashboard.
- **No hace scraping agresivo de portales del Estado.** Solo ingiere
  datos de las fuentes que tienen API o descarga masiva pública, y de
  los portales con scraping-friendly verificado. No intenta romper
  CAPTCHAs ni logins.
- **No vende datos ni cobra suscripciones.** Todo es público.
- **No reemplaza al SIAF, al INFOBRAS, ni a la OECE.** Rastro los
  consume, no los compite.
- **No publica datos personales sensibles.** RUC y nombre de
  contribuyente son públicos (SUNAT los publica), pero Rastro no cruza
  con datos personales de personas naturales.

---

## 4. Las 14 fuentes de datos (catálogo)

Cada una es una **app independiente** dentro del monorepo, con su
propia API Express, su propia base Postgres, su propio conector de
ingesta, y su propio set de tools en el MCP.

| # | App (slug) | Puerto | Fuente original | Qué entrega |
|---|---|---|---|---|
| 1 | `radar-ejecucion` | 4000 | MEF (Presupuesto Público) | PIA, PIM, devengado por sector, entidad, departamento. Cohortes y benchmarks. |
| 2 | `compras-publicas` | 4001 | OECE/SEACE (Contrataciones) | Catálogo de proveedores, contrataciones, concentración por departamento. |
| 3 | `radar-inversiones` | 4002 | Invierte.pe (Cartera de inversiones) | Inversiones públicas con CUI, estado, situación, monto viable. |
| 4 | `infobras` | 4003 | Contraloría (INFOBRAS) | Obras públicas con código INFOBRAS, estado de ejecución, paralización, Cost Drift, gap físico-financiero. |
| 5 | `ceplan-estrategico` | 4004 | CEPLAN (ObservaPerú) | Indicadores estratégicos del SINAPLAN, sectores, territorio. |
| 6 | `ceplan-geo` | 4005 | CEPLAN (GeoServer) | Capas geoespaciales: distritos, infraestructura, áreas protegidas. |
| 7 | `identidad-fiscal` | 4006 | SUNAT (Padrón RUC) | Contribuyentes con RUC, razón social, estado, condición, UBIGEO. |
| 8 | `salud-institucional` | 4007 | (agregador) | Score compuesto que cruza las 5 dependencias relevantes. No tiene BD propia. |
| 9 | `proveedores-sancionados` | 4008 | OECE/RNP | Inhabilitaciones, multas, sanciones vigentes por RUC. |
| 10 | `actividad-agraria` | 4009 | MIDAGRI | Series regionales: jornal, tractor, yunta, producción agraria. |
| 11 | `seguridad-ciudadana` | 4010 | MININTER (SIDPOL) | Denuncias policiales por tipo y ubicación. |
| 12 | `bcrp-comercio-exterior` | 4011 | BCRP (comercio exterior) | Series nacionales de exportaciones e importaciones. |
| 13 | `inversion-privada` | 4012 | PROINVERSIÓN / VERTIX | Cartera de APP, PA y Obras por Impuestos. |
| 14 | `bcrp-la-libertad` | 4013 | BCRP Trujillo | Síntesis mensual de la actividad económica de La Libertad. |

### 4.1 Notas importantes del catálogo

- **`salud-institucional` no tiene base de datos propia.** Es un
  agregador que lee de las otras 5 apps y produce un score. Esto está
  documentado en su `ESTADO.md` interno y verificado por el ledger de
  cobertura territorial.
- **Hay 2 apps de CEPLAN** (`ceplan-estrategico` y `ceplan-geo`) porque
  son dominios distintos: indicadores estratégicos vs capas geoespaciales.
  Comparten el modelo pero la fuente, el endpoint y los tools son
  diferentes.
- **Las 2 apps de BCRP** (`bcrp-comercio-exterior` y `bcrp-la-libertad`)
  son escalas distintas: nacional vs síntesis regional. Podrían
  fusionarse en el futuro pero la separación actual refleja la
  frecuencia y granularidad de cada fuente.
- **`radar-inversiones` y `infobras` son las dos apps que más rinden
  en fiscalización.** Son las que más consultas tienen, las que más
  señales derivadas producen (Cost Drift, gap físico-financiero,
  paralización), y las que sostienen el grueso de las fichas de
  distrito.

### 4.2 Frecuencia de actualización

| App | Frecuencia de ingesta | Volumen típico | Cobertura La Libertad |
|---|---|---|---|
| `radar-ejecucion` | diaria | ~3.5M registros | completa |
| `compras-publicas` | diaria | ~12M órdenes | completa |
| `radar-inversiones` | semanal (CSV) | ~180k inversiones | completa |
| `infobras` | semanal (web) | ~10k obras en La Libertad | completa |
| `identidad-fiscal` | mensual (SUNAT) | ~106k contribuyentes en La Libertad | completa |
| `ceplan-estrategico` | anual | ~700 indicadores | parcial (sin UBIGEO) |
| `ceplan-geo` | según capa | 11 capas | completa |
| `proveedores-sancionados` | diaria | ~8k sanciones vigentes | completa |
| `actividad-agraria` | mensual | ~108 series | completa |
| `seguridad-ciudadana` | mensual | ~25k denuncias/mes | completa |
| `bcrp-comercio-exterior` | mensual | ~600 series | nacional |
| `inversion-privada` | trimestral | ~80 proyectos APP/PA | completa |
| `bcrp-la-libertad` | mensual | 1 síntesis | completa |

Los números de "volumen típico" son orientativos y se verifican en vivo
en `rastro.fyi/estado` (página que muestra el status y la frescura de
cada API).

---

## 5. Cómo funciona Rastro (alto nivel)

Si lo contamos sin jerga técnica, Rastro hace cuatro cosas:

1. **Trae** los datos de los portales del Estado (con conector, con API,
   con scraping cuando se puede, con descarga masiva cuando existe).
2. **Guarda** los datos en bases Postgres, una por app, con la metadata
   de origen y la fecha de ingesta.
3. **Sirve** los datos por una API limpia (REST, con shape estable) y
   por un servidor MCP (para que los agentes de IA los consuman).
4. **Muestra** un corte semanal en `rastro.fyi` para que cualquiera los
   pueda consultar sin instalar nada.

### 5.1 La metáfora del agua

Pensá en los datos del Estado como 14 ríos que bajan por 14 quebradas
distintas. Cada portal es una quebrada. Lo que hace Rastro es construir
14 estanques (las 14 apps), conectarlos con tuberías verificadas (los
cruces con score de confianza), y abrir dos canillas: una para humanos
(la web con corte semanal) y otra para máquinas (la API + el MCP).

Lo que Rastro **no** hace es pretender que las 14 quebradas son un solo
río. Cuando una llave oficial no existe o el dato no está, Rastro dice
"este cruce no se puede hacer" en vez de inventar la tubería.

### 5.2 Los cuatro modos de llegar al dato

| Modo | Cuándo aplica | Ejemplo en Rastro |
|---|---|---|
| **API oficial** | El portal expone API con auth razonable | MEF, BCRP, SUNAT, OECE |
| **Descarga masiva** | El portal publica CSV/ZIP en datosabiertos.gob.pe | MEF (anual), BCRP |
| **Scraping ético** | El portal es HTML estático, sin login, sin CAPTCHA, sin auth | INFOBRAS (catalogado en `arquitectura/scraping-arquitectura.md`) |
| **Wrapper de tercero** | Existe un servicio que ya scrapea y lo reempaqueta | (en evaluación para SUNAT) |

La jerarquía es estricta: API > descarga masiva > scraping. Solo se
scrapea cuando no hay alternativa, y siempre con rate-limit propio
para no abusar del portal.

---

## 6. Arquitectura técnica

### 6.1 Stack resumido

| Capa | Tecnología |
|---|---|
| Frontend (web) | Vite 8 + React 19 + Tailwind 4, deploy en Cloudflare Pages |
| API backend (14 apps) | Node 22 + Express + TypeScript, una BD Postgres por app |
| Proxy público | nginx + Certbot en VPS (149.104.66.100), proxy path-based |
| Protección de API | Cloudflare Access (Zero Trust) sobre `api.rastro.pe` |
| Rate limit en el edge | Cloudflare Pages Functions + Workers KV |
| Servidor MCP | Node 22 + stdio (Model Context Protocol SDK) |
| Despliegue | GitHub Actions → `wrangler pages deploy` para el front; PM2 + Docker para las APIs |
| Dato abierto (corte semanal) | script `export-snapshot.mjs` → JSON bundleado en el build |
| Repo | monorepo npm workspaces, `Treevu-ai/appsperu` en GitHub |

### 6.2 El monorepo

El repo `appsperu` declara `workspaces: ["packages/*", "apps/compras-publicas/api", "apps/infobras/api", "apps/identidad-fiscal/api"]`
(ver `package.json` raíz). Las 14 apps son **proyectos npm independientes**
cada una con su propio `package-lock.json` y su propio CI. La razón de
este diseño (en vez de un solo workspace global) es que cada app tiene
su propio ciclo de releases y su propia BD: mezclarlas en un workspace
ampliaría la superficie de cualquier cambio.

El ADR-0017 (`docs/adr/0017-consolidacion-entity-crosswalk-evaluacion.md`)
documenta por qué se consolidaron solo los matchers de entidad (en
`packages/entity-matcher`) y no el resto.

### 6.3 Las 14 APIs Express

Cada app expone una API REST en un puerto fijo (4000–4013). El shape
de la respuesta es estable: cada tool del MCP corresponde 1:1 a un
endpoint, y cada vista de la web corresponde 1:1 a un tool. Esto es
deliberado: la API se puede consumir sin el MCP, el MCP se puede usar
sin la web, y la web se puede usar sin el MCP.

Las 14 apps están en `apps/<slug>/api/`. Cada una tiene:

- `src/index.ts` — el entry point del Express
- `src/routes/` — los endpoints
- `src/ingest/` — los conectores con la fuente
- `src/db/` — migraciones SQL y cliente de Postgres
- `src/crossref/` — cuando aplica, los cruces con otras apps
- `src/__tests__/` — tests unitarios con vitest
- `Dockerfile` + `docker-compose.yml` — para correr local con Postgres

### 6.4 El proxy `api.rastro.pe`

Las 14 APIs corren en `127.0.0.1:<port>` dentro del VPS. El proxy
nginx (`infra/api-proxy/nginx/api.rastro.pe.conf`) expone un único
hostname público (`https://api.rastro.pe/<slug>/`) que routea por path
al puerto correspondiente. Esto permite:

- Un solo cert SSL (Let's Encrypt, renovación automática).
- Un solo endpoint de logs.
- Una sola capa de protección (Cloudflare Access) por delante.

### 6.5 Cloudflare Access

Sobre `api.rastro.pe` está activado **Cloudflare Access (Zero
Trust)**. Por defecto, Access rechaza todo request que no presente un
Service Token válido. Hoy hay 1 Service Token en uso:

- `rastro-search` — usado por la Cloudflare Function `/api/search` de
  `rastro.fyi` para que el buscador de la web pueda consultar las 3
  APIs de búsqueda.

Si en el futuro se quiere dar acceso a un periodista o a una muni,
se genera un Service Token adicional y se entrega. El audit log
muestra cada request con IP, User-Agent, path, y Allow/Deny.

Runbook completo: `docs/API_ACCESS_PROTECTION.md`.

### 6.6 Cloudflare Pages + Functions

`rastro.fyi` está en Cloudflare Pages (proyecto `rastro`). El build es
Vite estándar con `apps/rastro-web/dist` como output. El deploy se
trigerea en cada push a `master` que toque `apps/rastro-web/**` y los
miércoles a las 07:00 hora Perú (cron semanal para arrastrar el último
corte).

Las **Cloudflare Pages Functions** (`apps/rastro-web/functions/api/`)
son código server-side que corre en el edge. Hay 2:

- `/api/search` — el buscador. Llama a las 3 APIs en vivo, con rate
  limit por IP via Cloudflare Workers KV, y degrada al `search-index`
  bundleado si una API no responde. Hoy, además, manda los headers
  `CF-Access-Client-Id` y `CF-Access-Client-Secret` para que Cloudflare
  Access lo deje pasar.
- `/api/rate-limit-stats` — devuelve el conteo de 429s en las últimas
  24h, leído del mismo KV. Lo consume la página `/estado` para mostrar
  públicamente que el rate limit está activo.

### 6.7 El snapshot semanal

El script `apps/rastro-web/scripts/export-snapshot.mjs` corre los
miércoles después del cierre de las ingestas. Lo que hace:

1. Enumera el **espacio finito de consultas** que la UI realmente hace
   (los `path` + `query` que cada componente de React llama).
2. Por cada combinación, llama al endpoint correspondiente.
3. Escribe la respuesta en `apps/rastro-web/src/data/snapshot.json`.

El bundle de la web importa ese JSON. En producción, la UI **siempre
lee del snapshot** (por la flag `VITE_PUBLIC_APIS_LIVE=false`); nunca
llama a la API desde el navegador. Las URLs de las 14 APIs ya no se
embeben en el bundle, así que tampoco quedan visibles en DevTools.

### 6.8 El servidor MCP

`mcp-server/` es un paquete independiente que usa el SDK oficial de
MCP. Se conecta por stdio a un agente (Claude Code, Cursor, etc.) y
expone 83 tools de solo lectura (uno por cada endpoint de las 14
APIs). No transforma shapes: la respuesta de un tool es la respuesta
del endpoint, con la misma metadata de cobertura, matcher y corte que
devuelve la API. Esto es deliberado: el agente puede mostrar la cita
directamente al usuario.

El catálogo de tools se parsea en build-time desde
`mcp-server/src/catalog.ts` (ver `apps/rastro-web/scripts/generate-mcp-catalog.mjs`)
y se publica en `rastro.fyi/docs/api`. No hay que mantener dos
catálogos a mano: si cambia un tool, la doc se regenera sola.

---

## 7. La capa de lectura: `rastro.fyi`

### 7.1 Quién la usa

`rastro.fyi` está pensada para ser usada por **personas que no son
desarrolladoras**. El copy evita los jergones (no dice PIA/PIM/devengado
sino "lo que se presupuestó, lo que se ajustó, lo que se gastó"). El
buscador es texto libre. Las fichas se leen como una nota de prensa
con datos: titular, números, fuente, fecha.

### 7.2 Rutas principales

| Ruta | Qué hace |
|---|---|
| `/` | Landing — qué es Rastro, para quién, cómo se usa |
| `/catalogo` | Catálogo de las 14 fuentes con frescura y cobertura |
| `/estado` | Status de cada API en vivo + métricas de rate limit |
| `/buscar` | Buscador libre (RUC, inversión, obra) |
| `/sector/:id` | Ficha de un sector presupuestal (Transporte, Salud, etc.) |
| `/sector/:id/comparativo` | Comparativo entre sectores verificados |
| `/entidad/:code` | Ficha de una entidad presupuestal con cohorte y percentil |
| `/distrito/:ubigeo` | Ficha de un distrito con sus obras y cartera |
| `/distrito/:ubigeo/integridad` | Cadena documental de la infraestructura del distrito |
| `/proveedor/:ruc` | RUC, sanciones, contrataciones como proveedor |
| `/prensa/proveedores` | Ranking de proveedores por concentración |
| `/auditoria/entidades-infobras` | Crosswalk MEF↔INFOBRAS con niveles de confianza |
| `/docs/api` | Catálogo del MCP server (83 tools) |
| `/docs/integridad` | Documentación de la metodología de integridad documental |
| `/gore/la-libertad/...` | Tableros del GORE La Libertad (ficha, comparativo, benchmark) |

### 7.3 El buscador (`/buscar`)

Hace fan-out a 3 fuentes:

- **identidad-fiscal** — única fuente con búsqueda real de texto
  libre por `razonSocial` (ILIKE server-side en Postgres).
- **radar-inversiones** — solo soporta filtros exactos. El filtrado
  por texto se hace en el edge, acotado a La Libertad.
- **infobras** — mismo caso: el filtrado por texto se hace en el edge,
  acotado a La Libertad.

Rate limit: 30 búsquedas por minuto por IP, con contador de 429s
expuesto en `/estado` para que se vea que la protección está viva.

### 7.4 El snapshot y la honestidad temporal

La web siempre muestra la fecha del corte:

> "Datos al 2026-09-02 — corte semanal, no en vivo."

Esto es deliberado. La web no promete datos al segundo: promete
**datos al corte**, con la fecha visible, y la cita a la fuente
debajo de cada número. Si el visitante quiere datos en vivo, el
runbook lo manda al servidor MCP local.

---

## 8. El servidor MCP (para agentes de IA)

### 8.1 Qué es MCP

**Model Context Protocol (MCP)** es un estándar abierto de Anthropic
para que un agente de IA pueda usar herramientas externas. Un servidor
MCP es un proceso que el agente arranca por stdio, le pregunta "¿qué
herramientas tenés?", y el servidor le responde con un catálogo. El
agente decide cuándo invocar cada tool según lo que el usuario le
pregunte.

### 8.2 Qué hace el servidor MCP de Rastro

Expone las 14 APIs como **83 tools de solo lectura**, sin transformar
shapes. Cada tool tiene un nombre semántico (ej.
`infobras_public_works`, `radar_ejecucion_sector_ficha`,
`compras_publicas_suppliers`), un input schema (validado con zod) y
un output que es la respuesta literal de la API. Los tools que
devuelven metadata de cobertura/matcher/corte lo hacen tal cual: el
agente puede citarlo directamente al usuario.

### 8.3 Quién lo usa

Está pensado para 3 perfiles:

- **Analistas con Claude Code o Cursor** — escriben consultas en
  lenguaje natural, el agente encadena los tools.
- **Periodistas con Continue.dev o Cline** — exploran datasets sin
  abrir la terminal.
- **Equipos internos de Treevu** — corre las validaciones de cobertura
  territorial desde el chat.

### 8.4 Cómo se instala

1. Tener Node 22+.
2. Tener las 14 APIs corriendo (o apuntar `<APP>_API_URL` a
   `https://api.rastro.pe/<app>/` con un Service Token válido).
3. `npx -y @modelcontextprotocol/inspector` o agregar la config en
   `~/.config/claude-code/mcp.json` apuntando a `mcp-server/dist/index.js`.
4. Conectado. El agente ya puede preguntar.

Documentación detallada: `mcp-server/README.md` y `rastro.fyi/docs/api`.

---

## 9. Seguridad y operación

Rastro protege la API con **3 capas de defensa**, en este orden:

### 9.1 Capa 1 — Cloudflare Access (perimetral)

Cualquier request a `api.rastro.pe` sin un Service Token válido
recibe 403 antes de llegar al proxy nginx. Service Tokens: keys
criptográficas (Client ID + Client Secret) que el dueño de la
cuenta de Cloudflare emite desde Zero Trust → Service Auth. No se
pueden adivinar ni se filtran: solo aparecen una vez al crearlos.

Costo: $0/mes. Los Service Tokens no cuentan como usuarios en el
free tier (hasta 50).

### 9.2 Capa 2 — Rate limit por IP en el edge

`/api/search` cuenta requests por IP con ventana de 60s (Cloudflare
Workers KV). 30 búsquedas/minuto por IP, devolviendo 429 con
`Retry-After` cuando se excede. El contador de 429s se expone en
`/estado` para que sea público que la protección está activa.

### 9.3 Capa 3 — Rate limit por origen en el backend (donde aplique)

Las 14 apps Express declaran un `WEB_ORIGIN` que el CORS middleware
valida. Requests desde un origen no declarado (otro dominio) reciben
CORS error antes de llegar a la lógica de negocio. La lista actual
de orígenes permitidos está en `infra/api-proxy/setup-api-rastro-pe.sh`.

### 9.4 Lo que NO está protegido

- **El tráfico entre el proxy nginx y las 14 APIs** (en `127.0.0.1`).
  Es red de confianza del VPS. Si el VPS se compromete, la barrera
  es la del VPS.
- **El padrón RUC de SUNAT en la BD local** — está aislado en su
  propia BD, accesible solo desde `identidad-fiscal`. Pero la BD
  misma no está cifrada en reposo (depende del cifrado del VPS).
- **Los Secrets Tokens en el dashboard de Pages** — están cifrados
  en reposo por Cloudflare, pero el que tiene acceso al dashboard
  de Cloudflare los ve. Es un riesgo operacional, no técnico.

### 9.5 Datos personales

- **RUC y razón social** son públicos por ley (SUNAT los publica).
  Rastro los republica.
- **Nombre de personas naturales** no se cruza, no se almacena, no
  se muestra. Si una ficha de proveedor tiene el nombre de un
  representante legal, viene de la fuente original (OECE) y se
  muestra tal cual.
- **Denuncias policiales (SIDPOL)** son datos sensibles. La app
  `seguridad-ciudadana` los agrega a nivel distrital, no individual.
  La ficha no muestra quién denunció a quién.

### 9.6 Rollback

El runbook de cada cambio crítico está en `docs/`. Para el caso
específico de Access, el rollback es un toggle: Cloudflare Zero Trust
→ Applications → `Rastro API (api.rastro.pe)` → Disabled. En 5
segundos la API vuelve a estar abierta (como estaba antes del
cambio).

---

## 10. Audiencias — qué puede hacer cada uno con Rastro

### 10.1 Para el ciudadano curioso

- **Ver cómo se gasta la plata pública en tu región.** Entrá a
  `/distrito/<tu-ubigeo>`, mirá las obras en curso, mirá el presupuesto
  ejecutado.
- **Buscar un proveedor del Estado.** Si te dicen que una empresa
  hizo una obra, entrá a `/proveedor/<su-ruc>` y mirá cuántas obras
  tiene, si tiene sanciones, qué entidades la contratan.
- **Seguir el avance de tu sector.** Si te importa la salud o la
  educación, mirá la ficha del sector y comparalo con el promedio.

### 10.2 Para el periodista

- **Cruzar obras con proveedores.** Buscá una obra, copiá el proveedor,
  abrí su ficha y mirá su patrón de contrataciones con distintas
  entidades. Concentración inusual = un ángulo.
- **Comparar entidades.** `/entidad/<code>` muestra el percentil de
  una entidad contra su cohorte. Una entidad que ejecuta mucho menos
  que sus pares es noticia.
- **Bajar el catálogo.** `/docs/api` lista los 83 tools del MCP con
  ejemplos de uso. Si tenés un data journalist en el equipo, el
  MCP server se instala en 5 minutos.
- **Citar la fuente.** Cada número en la web tiene la fecha del
  corte y la fuente visible. Para el artículo: "Según Rastro al
  corte del 2 de septiembre de 2026, sobre datos del MEF…"

### 10.3 Para el académico e investigador

- **Replicabilidad.** Las apps son open source en GitHub
  (`Treevu-ai/appsperu`). Cualquiera puede clonar el repo, correr
  la ingesta en su máquina, y verificar los números.
- **Frescura documentada.** Cada fuente tiene su `cobertura`,
  `matcher` y `corte` declarados en la respuesta. No hay inferencia
  silenciosa.
- **Metadata de la metadata.** El catálogo de las 14 fuentes está
  en `docs/conectores.md` con la ficha técnica por conector
  (qué hace, cómo, con qué frecuencia, de qué fuente).
- **Para papers y comités.** Hay un bundle citable (snapshot
  congelado + metadata de calidad) que se puede exportar — ver
  `docs/BACKLOG_Rastro_Capa_Lectura_No_Tecnicos_v1.md` para el
  roadmap de datos abiertos.

### 10.4 Para el servidor público, gestor o fiscalizador

- **Tableros del GORE La Libertad.** `/gore/la-libertad/ficha`
  muestra la situación presupuestal y de inversiones del gobierno
  regional. `/gore/la-libertad/comparativo` lo compara con años
  anteriores. `/gore/la-libertad/benchmark` lo posiciona contra
  la cohorte.
- **Integridad documental por distrito.**
  `/distrito/:ubigeo/integridad` muestra la cadena documental
  mínima de la infraestructura del distrito: cuántas obras tienen
  cierre, operador, mantenimiento, disponibilidad, indicador de
  servicio.
- **Cruce MEF↔INFOBRAS con confianza.** `/auditoria/entidades-infobras`
  lista las entidades con score de confianza del cruce. Útil para
  detectar entidades con muchos CUIs en MEF pero pocas obras en
  INFOBRAS (o viceversa).
- **Sin login.** No hace falta crear cuenta. No te pide datos.
  Abrís el URL y mirás.

### 10.5 Para el desarrollador

- **Las 14 APIs están documentadas en `/docs/api`.** Cada endpoint
  con su shape, sus códigos de error, su semántica.
- **El servidor MCP es open source.** Lo podés forkear, lo podés
  mejorar, lo podés usar en otro agente que no sea Claude o Cursor.
- **El corte semanal es JSON bundleado.** Si solo necesitás datos
  para una visualización propia, podés consumir el snapshot sin
  instalar nada.
- **Los datos son tuyos.** El repo es MIT (ver `LICENSE` cuando se
  publique). Nadie te cobra por mirar, copiar, redistribuir.

### 10.6 Para el financiador, donante o aliado institucional

- **Costo operativo bajo.** Toda la infra es Cloudflare (gratis) +
  un VPS chico (~$30/mes). No hay costo de licencia, no hay costo
  de SaaS.
- **Riesgo bajo de lock-in.** Los datos son del Estado. El código
  es open source. Si el equipo desaparece, el repo y los datos
  siguen siendo públicos y replicables.
- **Efecto multiplicador.** El MCP server permite que cualquier
  agente de IA que se conecte pueda usar Rastro sin reescribir
  nada. A más agentes compatibles con MCP, más valor sin trabajo
  extra.
- **Ruta de sostenibilidad.** El plan de sostenibilidad está en
  `docs/PRD_Rastro_Capa_Lectura_No_Tecnicos_v1.md`: combinación
  de servicios pagados para empresas (alertas custom, datasets
  premium, integraciones con sus SI) + grants para mantener la
  capa gratuita.

---

## 11. Alcance territorial

### 11.1 Lo que hoy cubre Rastro

**La Libertad**, en sus 3 provincias costeras, 3 andinas, y 83
distritos. Las 14 apps tienen datos para La Libertad con cobertura
verificada por el ledger de cobertura territorial
(`scripts/seguimiento-semanal-territorial.ps1` corre los miércoles).

La única app con cobertura parcial es `ceplan-estrategico` (no
aplica por diseño: la fuente no tiene desagregación departamental
fina para La Libertad).

### 11.2 Por qué La Libertad primero

- **Volumen de inversión:** La Libertad es la tercera región con
  más presupuesto de inversión pública del Perú.
- **Diversidad:** tiene costa, sierra y selva, con proyectos en
  los 3 dominios. Sirve como test de que la plataforma funciona
  en geografías distintas.
- **Equipo:** Treevu tiene base operativa en La Libertad, con
  contacto directo con la sociedad civil, la prensa regional y
  el GORE.

### 11.3 Cómo se expande a otra región

Regionalizar Rastro es trabajo de 2-3 semanas por región, asumiendo
que la cobertura de las fuentes oficiales es similar:

1. **Agregar la región al parametrizador** de cada una de las 14
   apps (la mayoría ya lo soportan, hay que cambiar el default).
2. **Correr la ingesta** para la nueva región y validar la
   cobertura.
3. **Generar el snapshot** y publicar la nueva vista regional.

Las 4 regiones que salieron del scope en agosto 2026 (Lambayeque,
Piura, Cajamarca, Cusco) tienen los memos y los análisis guardados
como histórico, así que la base analítica ya está.

### 11.4 Lo que nunca será Rastro

Rastro no cubre:

- **Datos personales de personas naturales** (no hay padrón
  electoral, no hay datos de salud individual, no hay antecedentes
  penales).
- **Datos reservados o secretos** (no hay inteligencia policial,
  no hay defensa nacional).
- **Datos de otras latitudes** (Rastro es sobre el Estado
  peruano).

---

## 12. Roadmap

### 12.1 Próximos 3 meses (Q4 2026)

- **Cerrar los tableros del GORE La Libertad** que están a medias
  (ficha, comparativo, benchmark). Hoy están en `/gore/la-libertad/...`
  pero faltan los visuales de señales INFOBRAS (Cost Drift, gap
  físico-financiero, paralización).
- **Paquete de datos abiertos v1.** Exportar el snapshot semanal
  más el metadata de cobertura como un bundle publicable en
  datosabiertos.gob.pe. Convenios con 2-3 medios regionales para
  que lo usen en sus notas.
- **2-3 datasets críticos adicionales.** Salud individual
  agregada (MINSA), educación (MINEDU), seguridad (ya cubierto).
  La decisión de cuáles entrar depende de qué pidan los aliados.
- **3 features del backlog abierto:** el dashboard de integridad
  por distrito, la comparativa de cohortes, el reporte de
  smoke-test firmado.

### 12.2 Próximos 12 meses (Q4 2026 — Q3 2027)

- **Regionalizar a Lambayeque y Piura** (las 2 regiones con más
  demanda recibida).
- **Sostenibilidad:** un plan de servicios pagados para empresas
  (alertas, datasets premium, integraciones) que financie la capa
  gratuita sin comprometer la apertura.
- **MCP ampliado:** pasar de 83 tools a 100+, incorporar los
  tools derivados (alertas, comparaciones automáticas, generación
  de reportes).
- **Cobertura completa del GORE La Libertad:** terminar las 5
  dependencias ministeriales que hoy se miran a medias.

### 12.3 Visión a 24 meses (Q4 2026 — Q4 2028)

- **5 regiones activas** con cobertura verificada.
- **MCP server usado por al menos 1 medio nacional y 3 medios
  regionales** para su flujo de fiscalización.
- **1 hito de política pública influido por un cruce de Rastro** —
  sea una decisión del GORE, sea una alerta del Congreso, sea
  una denuncia ciudadana basada en un patrón que solo Rastro
  podía ver.

---

## 13. Equipo y gobierno del proyecto

### 13.1 Quiénes somos

Rastro es desarrollado por **Treevu** (Treevu-ai en GitHub), un
equipo de 4 personas con base en Perú y experiencia en datos
públicos, IA aplicada, y política pública. El equipo combina
economistas, ingenieros de datos, y un oficial de integridad.

No hay dependencia operativa de ninguna entidad del Estado. Los
datos que se usan son los mismos que cualquiera puede descargar de
los portales oficiales.

### 13.2 Cómo se decide

- **Roadmap trimestral** publicado en `docs/PRD_*.md` y revisado
  en sesión pública cada 3 meses.
- **ADRs (Architecture Decision Records)** documentados en
  `docs/adr/` para cada decisión técnica que cambia el rumbo del
  proyecto.
- **Bitácora operativa** en `docs/ESTADO.md`, actualizada al cierre
  de cada sesión de trabajo.

### 13.3 Cómo contribuir

- **Código:** PR al repo `Treevu-ai/appsperu`. Hay un `CONTRIBUTING.md`
  (a publicar) con el flujo: fork → branch → PR → revisión por
  un mantenedor → CI verde → merge.
- **Datos:** si encontrás una fuente que debería estar en Rastro
  y no está, abrí un issue con la etiqueta `data-source`. El equipo
  evalúa factibilidad y prioridad.
- **Errores en los datos:** abrí un issue con la etiqueta `data-bug`
  y la URL del endpoint + el resultado esperado. Si la fuente
  original está mal, lo registramos como gap; si nuestro cruce
  está mal, lo arreglamos.
- **Documentación:** todo está en `docs/`. PRs de mejora de
  claridad o de cobertura son bienvenidos.

### 13.4 Licencia

- **Código:** MIT (a confirmar al publicar el repo público).
- **Datos:** los datos del Estado son públicos por ley. Rastro los
  republica con la cita. No hay restricción de uso.

### 13.5 Financiamiento

Rastro se sostiene con horas de Treevu y donaciones puntuales. No
tiene grants activos al 2026-09-03. El plan de sostenibilidad
comercial está en el PRD; hasta que se concrete, la cobertura
operativa es de mantenimiento, no de expansión.

---

## 14. Glosario

| Sigla | Significado | Dónde se usa |
|---|---|---|
| API | Application Programming Interface | General |
| APP | Asociación Público-Privada | `inversion-privada` |
| BCRP | Banco Central de Reserva del Perú | `bcrp-comercio-exterior`, `bcrp-la-libertad` |
| CEPLAN | Centro Nacional de Planeamiento Estratégico | `ceplan-estrategico`, `ceplan-geo` |
| CIUU | Código Internacional Industrial Uniforme | (no se usa hoy) |
| CPC | Carpeta de Pago Cerrado | MEF |
| CUI | Código Único de Inversión | `radar-inversiones` |
| Devengado | Gasto ejecutado y registrado contablemente | MEF, `radar-ejecucion` |
| INFOBRAS | Sistema de Información de Obras Públicas | `infobras` |
| INEI | Instituto Nacional de Estadística e Informática | (referencia, no consumido aún) |
| MEF | Ministerio de Economía y Finanzas | `radar-ejecucion` |
| MCP | Model Context Protocol | `mcp-server` |
| MIDAGRI | Ministerio de Desarrollo Agrario y Riego | `actividad-agraria` |
| MININTER | Ministerio del Interior | `seguridad-ciudadana` |
| MINSA | Ministerio de Salud | (a incorporar) |
| OECE | Organismo Especializado en Contrataciones del Estado (antes OSCE) | `compras-publicas`, `proveedores-sancionados` |
| PA | Proyecto en Activos | `inversion-privada` |
| PIA | Presupuesto Institucional de Apertura | MEF |
| PIM | Presupuesto Institucional Modificado | MEF |
| PNDA | Plataforma Nacional de Datos Abiertos | `/catalogo` |
| PROINVERSIÓN | Agencia de Promoción de la Inversión Privada | `inversion-privada` |
| RNP | Registro Nacional de Proveedores | `proveedores-sancionados` |
| RUC | Registro Único de Contribuyentes | `identidad-fiscal` |
| SEACE | Sistema Electrónico de Contrataciones del Estado | `compras-publicas` |
| SIAF | Sistema Integrado de Administración Financiera | MEF (referencia) |
| SIDPOL | Sistema de Denuncias Policiales | `seguridad-ciudadana` |
| SINAPLAN | Sistema Nacional de Planeamiento Estratégico | `ceplan-estrategico` |
| SUNAT | Superintendencia Nacional de Aduanas y de Administración Tributaria | `identidad-fiscal` |
| UBIGEO | Código de ubicación geográfica (departamento-provincia-distrito) | varias apps |
| VERTIX | Plataforma de PROINVERSIÓN para APP/PA | `inversion-privada` |

---

## 15. Cómo citar Rastro

### 15.1 En un paper académico

> **Rastro** (2026). Plataforma de inteligencia sobre datos abiertos
> del Estado peruano. Treevu-ai/appsperu. Corte al 2026-09-02.
> https://rastro.fyi/. [Accessed YYYY-MM-DD].

Si se usa un dataset específico, citar también la fuente original:

> Datos de inversión pública: MEF, vía Rastro (corte 2026-09-02).
> https://rastro.fyi/distrito/130101.

### 15.2 En una nota de prensa

> "Según Rastro, la plataforma de inteligencia sobre datos públicos
> del Perú, al corte del 2 de septiembre de 2026…"

(Si el dato es de un sector o distrito específico, linkear a la
ficha correspondiente en `rastro.fyi/...`.)

### 15.3 En redes sociales

> Acaba de salir [el dato X de Rastro](URL). [Comentario del periodista.]

El link a `rastro.fyi/<ruta>` siempre muestra la fecha del corte, así
que el lector puede verificar la frescura del dato citado.

### 15.4 En una conversación

"Rastro es como un buscador de Google pero para la plata del Estado:
tú preguntas y te devuelve la ficha con la fuente. Lo armé Treevu y
es open source."

---

## Anexo A — Resumen de decisiones arquitectónicas (ADRs)

| ADR | Tema | Estado |
|---|---|---|
| 0002 | `infobras` como app standalone y cruce por CUI | Aceptado |
| 0015 | Offsets manuales en el conector MEF | Aceptado |
| 0016 | Evaluación de automatizar los conectores núcleo | Aceptado |
| 0017 | Consolidación del entity matcher entre apps | Aceptado (alcance acotado a packages/) |

Ver `docs/adr/` para el detalle de cada uno.

## Anexo B — Documentos relacionados

- `README.md` — el README del monorepo, con la tabla de las 14 apps
- `DESIGN.md` — el sistema de diseño visual de `rastro-web` (tokens, tipografía, componentes)
- `docs/ESTADO.md` — bitácora operativa (cambios recientes, pendientes, decisiones de la última sesión)
- `docs/API_PROXY_DEPLOY.md` — cómo se despliega el proxy `api.rastro.pe`
- `docs/API_ACCESS_PROTECTION.md` — cómo se activa Cloudflare Access
- `docs/conectores.md` — ficha técnica de cada conector con su fuente
- `docs/data-contracts/` — el contrato de cada fuente externa
- `docs/PRD_*.md` y `docs/BACKLOG_*.md` — los PRDs y backlogs por dominio
- `docs/dossier/rastro-dossier.html` — el dossier institucional (versión PDF imprimible)
- `apps/rastro-web/DEPLOY.md` — cómo se despliega `rastro.fyi`
- `mcp-server/README.md` — cómo se instala y conecta el servidor MCP
- `docs/arquitectura/scraping-arquitectura.md` — cuándo y cómo se hace scraping

## Anexo C — Contacto

- **Web**: https://rastro.fyi/
- **Repo**: https://github.com/Treevu-ai/appsperu
- **Catálogo de la API**: https://rastro.fyi/docs/api
- **Estado del sistema**: https://rastro.fyi/estado
- **Equipo**: Treevu (https://github.com/Treevu-ai)

---

*Documento mantenido por el equipo de Rastro. Próxima revisión
trimestral o ante cambio mayor de arquitectura. PRs bienvenidos.*
