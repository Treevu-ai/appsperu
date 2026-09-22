# Data contract — INDECI: Emergencias y daños a nivel nacional (SINPAD, 2003-2025)

- Fuente oficial: INDECI (Instituto Nacional de Defensa Civil) — dataset "Emergencias y daños a
  nivel nacional por departamento" en `datosabiertos.gob.pe`, derivado del SINPAD (Sistema de
  Información Nacional para la Respuesta y Rehabilitación).
- Ticket: ADS-05 (`docs/BACKLOG_Organismos_Adscritos_Consolidado_v1.md`).

## Fuente real

```
GET https://www.datosabiertos.gob.pe/sites/default/files/BD_2003-2025_EMERGENCIAS.csv
```

Confirmado en vivo 2026-09-22: CSV descargable directo, sin autenticación, **25.79 MB**,
**142,139 filas de microdatos a nivel de evento individual** (no agregado) — un registro por
emergencia/desastre reportado al SINPAD entre 2003 y 2025. Incluye diccionario de datos oficial
(`Diccionario de datos_9.xlsx`) que documenta cada campo.

## Hallazgo real — codificación Latin-1, no UTF-8

El archivo está codificado en **ISO-8859-1 (Latin-1)**, confirmado con `file` (`ISO-8859 text`).
Decodificarlo como UTF-8 corrompe todos los caracteres acentuados (`"AÑO"` se ve como `"A�O"`,
`"REGIÓN"` como `"REGI�N"`). El conector decodifica explícitamente con `latin1`.

## Hallazgo real — dos formatos de fecha, documentados por la propia fuente

El diccionario de datos declara explícitamente que `FECHA DE LA EMER` puede venir en dos
formatos: `DD/MM/AAAA` (mayoría) o `MM/DD/AA` (año de 2 dígitos). Verificado en vivo:

| Formato | Filas (2026-09-22) | % |
|---|---|---|
| `DD/MM/AAAA` (4 dígitos de año) | 125,738 | 88.5% |
| `MM/DD/AA` (2 dígitos de año) | 16,401 | 11.5% |

Los dos formatos son distinguibles sin ambigüedad por la longitud del año (4 vs. 2 dígitos), no
por un rango de mes/día heurístico. Las 16,401 filas en formato `MM/DD/AA` son **100%
consistentes** con la columna `AÑO` de la misma fila tras expandir el año a `20YY` (0
discrepancias sobre las 16,401 verificadas; todas del año 2025 en los datos actuales). El
conector parsea ambos formatos explícitamente; una fecha con formato correcto pero inexistente
(ej. `31/02/2020`) no rechaza la fila, solo deja `fechaEmergencia: null`.

## Hallazgo real — `CODIGO DE EMERGENCIA-SINPAD` NO es una clave única (contradice a la fuente)

El diccionario de datos oficial documenta este campo como "clave primaria transaccional". **Es
falso**: verificado en vivo, **7 códigos se repiten** entre eventos genuinamente distintos (fechas
y departamentos diferentes, no un error de parseo — ej. el código `97549` aparece una vez en
diciembre 2018 en Huancavelica y otra vez en enero 2019 en Lambayeque). El conector no usa este
campo como clave; se guarda como `sinpadId` informativo, y la clave real de cada fila es el `id`
autoincremental interno.

## Sin clave estable → snapshot completo (mismo criterio que SERNANP/SERFOR)

Al no existir ninguna clave de negocio verificada única, y al ser este un archivo histórico
completo republicado periódicamente (no una API incremental paginada), cada ingesta reemplaza el
snapshot completo: `DELETE` de todo lo anterior + `INSERT` de las filas nuevas, en una sola
transacción con `pg_advisory_xact_lock`.

## Schema real (`apps/emergencias-indeci/api/src/db/migrations/001_init.sql`)

El CSV real tiene **49 columnas fijas, idénticas en las 142,139 filas** (verificado: 100% de las
filas tienen exactamente 49 columnas, 0 excepciones). Las 21 de mayor valor (identificación,
ubicación, EDAN principal) se normalizan a columnas propias de `indeci_emergencias`; las 28
restantes (detalle de infraestructura educativa/salud/vial/agrícola, pérdida de ganado) van a
`detalle_edan JSONB` sin perderse — se conserva la clave de columna original de la fuente
(ej. `"PERDIDA VACUNO"`, `"CENTROS EDUCATIVOS DESTRUIDOS"`).

```sql
raw_indeci_batches (id, source_url, record_count, fetched_at)
indeci_emergencias (
  id, sinpad_id, fecha_emergencia, anio, mes, cod_distrito, departamento, provincia, distrito,
  peligro, tipo_peligro, region_natural, fallecidos, desaparecidos, lesionados, damnificados,
  afectados, viviendas_destruidas, viviendas_afectadas, peso_ayuda, costo_ayuda,
  detalle_edan JSONB, source_batch_id, updated_at
)
indeci_emergencias_rejected (id, source_batch_id, raw_row, reason, rejected_at)
```

`departamento`/`provincia`/`distrito` son **nombres reales en texto** (no códigos UBIGEO, a
diferencia de la mayoría de capas de `catastro-forestal`/SERFOR) — confirmado en el diccionario y
en los datos reales. `cod_distrito` sí es un código UBIGEO de 6 dígitos.

## Sin PII

Los datos son agregados de daños por evento (conteos de personas afectadas/fallecidas por
distrito), no registros nominales de personas — no hay nombres, DNI ni otro identificador
personal en ninguna de las 49 columnas. Sin evaluación de PII adicional requerida.

## Verificación en vivo (2026-09-22)

Ingesta real ejecutada contra Postgres: **142,139/142,139 filas insertadas, 0 rechazadas**.
Cobertura La Libertad: **2,853 filas** (ej. heladas en Julcán 2017: 760 damnificados, 45 viviendas
destruidas — verificado contra la fila real).

## API (`src/routes/emergencias.ts`)

- `GET /api/emergencias` — filtros `departamento`/`provincia`/`distrito`/`peligro` (exacto) y
  `anio`, paginado (`limit`/`offset`, default 200/máx. 1000). Conteo y página en una misma
  transacción `REPEATABLE READ` para no mezclar snapshots si una ingesta corre en paralelo.
- `GET /api/emergencias/{id}` — detalle por el `id` interno (no `sinpadId`, que no es único).
  Responde `404` si no existe.

Verificado en vivo contra la API real levantada localmente con datos reales ingeridos (`/health`,
`/readyz`, `/api/emergencias?limit=1`, `/api/emergencias?departamento=LA%20LIBERTAD&anio=2017`,
`/api/emergencias/999999999` → `404`).

## MCP

Tools registradas en `mcp-server/src/catalog.ts`: `emergencias_indeci`, `emergencias_indeci_detalle`.
Verificado que `mcp-server/src/__tests__/routes-vs-catalog.test.ts` pasa.

## Fuera de alcance de este conector

- Decodificación/normalización de `cod_distrito` a nombre estándar INEI — ya viene con nombre real
  en `departamento`/`provincia`/`distrito`, no hace falta cruzar UBIGEO para el caso de uso básico.
- Cruce con `bcrp-la-libertad`/`radar-ejecucion` (impacto económico de emergencias) — candidato de
  Fase 2, no comprometido.
- Scheduler, UI.
