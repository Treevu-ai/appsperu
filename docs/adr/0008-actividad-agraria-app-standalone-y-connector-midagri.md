# ADR-0008: `actividad-agraria` — App standalone y connector MIDAGRI (Valor de Jornal Agrícola por región)

- Estado: Propuesto — documentado antes de implementar, sin código escrito todavía.
- Fecha: 2026-08-21
- Ámbito: nueva app, primera fuente de **actividad económica real** del proyecto (hasta ahora
  todas las apps cubren gasto/inversión/contratación pública, no resultado económico
  territorial).

## Contexto

El proyecto cubre bien el ciclo de gasto público (presupuesto → inversión → obra → compra →
proveedor), pero no tiene ninguna señal de actividad económica real en La Libertad que permita
contrastar el gasto con resultado territorial. `ADR-0007` investigó PRODUCE/MINCETUR/MIDAGRI/PCM
como candidatos; MIDAGRI quedó confirmado con un recurso real, descargable y con la granularidad
regional necesaria — ver `docs/data-contracts/midagri-estadistica-agraria.md` para el detalle
completo de la investigación en vivo (columnas, filas de La Libertad, licencia, y los dos
descartes documentados: `MIDAGRI-02` VBP nacional y `MIDAGRI-02` Datero Agrario congelado desde
2020).

**Fuente a ingerir**: `MIDAGRI-03.03: Valor de Jornal Agrícola por región 2018-2026`
(`www.datosabiertos.gob.pe/dataset/midagri-03-reportes-de-insumos-y-servicios-agropecuarios-ministerio-de-desarrollo-agrario-y`,
recurso `Valor de Jornal.xlsx - C.102.csv`) — 210 registros, columnas `Región/Año/Ene..Dic`,
9 años de La Libertad confirmados sin huecos salvo abr-jul 2020.

## Decisión

### Arquitectura general

**Nombre**: `actividad-agraria` — nombre de dominio, no de fuente (mismo criterio que
`compras-publicas`/`radar-ejecucion`, no `mef-*`/`oece-*`), para poder sumar más datasets de
MIDAGRI (o de otras fuentes de actividad económica) sin necesitar renombrar la app.

**Stack** (igual que apps existentes): API Express + TypeScript + Postgres (Docker Compose).
**Sin frontend web** — la política vigente desde 2026-08-20 (ver `docs/ESTADO.md`) es no
construir más frontends nuevos, solo API.

**Puertos**: siguiente bloque libre según `docs/ESTADO.md` — API `4009`, Postgres `5440`. No se
reserva puerto de web (no aplica).

**Estructura de directorios** (mínima — un solo recurso, sin necesidad de las capas de
`ceplan-estrategico`):

```
apps/actividad-agraria/
└── api/
    ├── src/
    │   ├── db/
    │   │   ├── pool.ts              # con `import "dotenv/config";` como primera línea desde el día uno (ver ADR de dotenv en fix/dotenv-autoload-db-apps)
    │   │   ├── migrate.ts
    │   │   └── migrations/
    │   │       ├── 001_create_raw_midagri_batches.sql
    │   │       └── 002_create_agricultural_wage.sql
    │   ├── ingest/
    │   │   └── jornal-agricola-connector.ts
    │   ├── crossref/
    │   │   └── match.ts
    │   ├── routes/
    │   │   ├── index.ts
    │   │   ├── wage.ts
    │   │   └── crossref.ts
    │   └── index.ts
    ├── package.json
    ├── tsconfig.json
    ├── docker-compose.yml
    └── .env.example
```

### Modelo canónico

```sql
-- 001_create_raw_midagri_batches.sql (lake de evidencia, mismo patrón que raw_mef_batches)
CREATE TABLE IF NOT EXISTS raw_midagri_batches (
  id              BIGSERIAL PRIMARY KEY,
  resource_id     TEXT NOT NULL,
  fetched_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  checksum        TEXT NOT NULL,
  record_count    INTEGER NOT NULL,
  payload         JSONB NOT NULL
);

-- 002_create_agricultural_wage.sql
CREATE TABLE IF NOT EXISTS agricultural_wage (
  id                BIGSERIAL PRIMARY KEY,
  departamento      TEXT NOT NULL,      -- "Región" del CSV, ej. "La Libertad" — normalizado a MAYÚSCULAS para calzar con DEPARTAMENTO_EJECUTORA_NOMBRE de radar-ejecucion
  anio              INTEGER NOT NULL,
  mes               SMALLINT,           -- 1-12; NULL si la fila es un promedio anual (el CSV trae una fila "promedio" para 2026, ver hallazgo de datos)
  valor_soles       NUMERIC(10, 2),     -- NULL si el CSV trae "-" (hueco real, ver abr-jul 2020 en La Libertad)
  source_batch_id   BIGINT NOT NULL REFERENCES raw_midagri_batches(id),
  UNIQUE (departamento, anio, mes)
);

CREATE INDEX IF NOT EXISTS idx_agricultural_wage_lookup
  ON agricultural_wage (departamento, anio);
```

**Duda de la fila 2026 resuelta (2026-08-21, archivo real descargado y verificado)**: no es un
promedio ni un artefacto de la previsualización — 2026 es simplemente el año en curso, con solo
Enero/Febrero reportados y Marzo-Diciembre **vacíos** (string vacío, no `-`). El CSV usa dos
marcadores de ausencia distintos: `-` para "mes con dato reportado como no disponible" (ej.
La Libertad abr-jul 2020) vs. campo vacío para "mes que aún no ha ocurrido/reportado" (todo
2026 después de febrero). El connector debe distinguir ambos como `NULL` en `valor_soles`, sin
necesidad de una columna adicional — la distinción no cambia el schema, solo la lógica de
parseo (ambos casos son "no hay valor", el motivo no se persiste).

### Connector

`jornal-agricola-connector.ts`: descarga directa GET del CSV, **URL confirmada en vivo**:

```
https://www.datosabiertos.gob.pe/sites/default/files/Valor%20de%20Jornal.xlsx%20-%20C.102_0.csv
```

No es un endpoint CKAN estándar (`/api/3/action/datastore_search`) ni requiere el patrón Range
del MEF — es un archivo estático servido por Drupal (`/sites/default/files/<nombre>`), GET
simple, sin autenticación. **Cautela de red confirmada**: el portal está detrás de un WAF
(CloudWAF) que bloquea requests sin headers de navegador — un `fetch`/`curl` sin `User-Agent`
realista devuelve una página de bloqueo en chino en vez del CSV (confirmado en vivo, 2026-08-21).
El connector necesita fijar un `User-Agent` de navegador estándar en la request.

**Formato del archivo confirmado (descarga real, no solo previsualización)**:
- Separador `;`, no `,` (mismo tipo de sorpresa ya documentado para el CSV del MEF).
- BOM UTF-8 al inicio del archivo — el parser debe descartarlo o usar una librería que lo
  maneje sola (`csv-parse` con `bom: true`).
- Cada fila termina en `;` extra (columna vacía al final, artefacto del export de Excel) — se
  descarta al parsear, no es una columna real.
- Valores con 2 decimales fijos (`"35.00"`), parseable directo a `NUMERIC`.
- Dos marcadores de ausencia de valor: `-` (mes reportado sin dato) y campo vacío (mes futuro
  sin reportar todavía) — ambos se normalizan a `NULL` en `valor_soles`.

Parseo con `csv-parse` (mismo patrón que el resto del proyecto). Sin Range requests — el archivo
es de 16.36 KB, cabe completo en memoria sin ningún truco de streaming.

**Frecuencia**: manual (`npm run ingest:jornal`), igual que todo el proyecto — sin scheduler.

### API

```
GET /api/wage?departamento=LA+LIBERTAD&anio=2024
GET /api/crossref?departamento=LA+LIBERTAD&anio=2024
```

### Cruce con `radar-ejecucion`

Por `departamento` (texto exacto, mayúsculas) — mismo criterio que el cruce `ceplan-estrategico`
↔ `radar-ejecucion` (bucket exacto, sin matcher difuso), no por `entity_code` (esta fuente no
tiene entidad ejecutora, es un índice regional). Propósito: mostrar el costo de jornal agrícola
de la región junto a la ejecución presupuestal de la función `AGROPECUARIA` en esa misma región
— una primera aproximación a "cuánto cuesta operar en el campo" vs. "cuánto invierte el Estado
en agro ahí". Implementación: `GET /api/crossref` en `actividad-agraria/api`, llamando en vivo a
`radar-ejecucion` (mismo patrón sin tabla de crosswalk que usa `ceplan-estrategico`, porque el
match es exacto y no hace falta cachear un score de confianza).

## Alternativas consideradas

**Extender `radar-ejecucion` en vez de app nueva** — descartada. Esta fuente no es presupuesto
ni ejecución de gasto, es un índice de costo de mano de obra agrícola — dominio distinto,
mismo criterio que separó `infobras` de `radar-ejecucion` en ADR-0002 (obras físicas vs.
presupuesto).

**Ingerir también `MIDAGRI-03.04`/`MIDAGRI-03.05` (alquiler de tractor/yunta) en el mismo
sprint** — descartada por ahora. Mismo dataset padre y misma estructura esperada (columnas
`Región/Año/Ene..Dic`), pero no se previsualizaron en el spike — se agregan en un sprint
posterior una vez validado el patrón con el primer recurso, no de entrada.

**Esperar a confirmar la URL de descarga directa antes de escribir este ADR** — descartada. La
estructura y el dato ya están confirmados con el rigor habitual del proyecto (previsualización
en vivo, no snippets); la URL exacta es un detalle de implementación del connector, no una
decisión arquitectónica — se resuelve en la fase de connector, no bloquea el diseño.

## Consecuencias

### Positivas
- Primera fuente de actividad económica real del proyecto — habilita contrastar gasto público
  con costo/actividad económica territorial, algo que ninguna de las 8 apps existentes cubre.
- App mínima (un solo recurso, sin frontend) — bajo costo de mantenimiento comparado con
  `ceplan-estrategico` o `infobras`.
- Reutiliza el fix de `dotenv` ya aplicado al resto del proyecto desde el día uno — no repite el
  problema de `DATABASE_URL no está definida` que tuvieron las otras 6 apps.

### Negativas
- El cruce con `radar-ejecucion` por `departamento` es débil comparado con cruces por ID exacto
  (`SEC_EJEC`, `CUI`, RUC) del resto del proyecto — es una aproximación territorial, no
  institucional, y debe documentarse como tal en el data contract (mismo caveat que ya tiene el
  cruce CEPLAN↔radar-ejecucion por nivel de gobierno).
- Dataset pequeño (210 filas totales, 9 para La Libertad) — bajo volumen, alto valor narrativo,
  pero no un dataset "grande" como el resto del proyecto (MEF, SUNAT, INFOBRAS).

## Fases de implementación

1. Scaffold de la app (`docker-compose.yml`, `package.json` con `dotenv` desde el inicio,
   `tsconfig.json`, `.env.example` con puerto 4009/Postgres 5440).
2. Migraciones (`raw_midagri_batches`, `agricultural_wage`).
3. Connector `jornal-agricola-connector.ts` — confirmar URL de descarga real, parsear, resolver
   la duda de la fila "promedio 2026" antes de normalizar.
4. Endpoints `GET /api/wage` y `GET /api/crossref`.
5. Verificación end-to-end con datos reales de La Libertad (mismo patrón de las 8 apps
   existentes: dato real, no fixture).

## Referencias

- Investigación completa: `docs/adr/0007-research-spike-midagri-mincetur-actividad-economica.md`
- Data contract: `docs/data-contracts/midagri-estadistica-agraria.md`
- Patrón de app standalone de un solo recurso: ADR-0002 (`infobras`)
- Patrón de cruce por bucket exacto (no ID): ADR-0003 (`ceplan-estrategico`)
- Fix de `dotenv` aplicado a las 6 apps existentes: rama `fix/dotenv-autoload-db-apps` (PR #12)
