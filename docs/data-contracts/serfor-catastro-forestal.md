# Data contract — SERFOR: Catastro Forestal (Modalidad de Acceso + Ordenamiento Forestal)

- Fuente oficial: SERFOR (Servicio Nacional Forestal y de Fauna Silvestre) — geoservicios ArcGIS.
- Tickets: ADS-01 (desbloqueo, ver `docs/PRD_Organismos_Adscritos_Consolidado_v1.md`) y ADS-02
  (ingesta, `docs/BACKLOG_Organismos_Adscritos_Consolidado_v1.md`).

## Hallazgo ADS-01: es ArcGIS Server, no GeoServer

El portal de contenido `geo.serfor.gob.pe/geoserfor` (Joomla) enlaza los servicios reales desde su
página `/geoserfor/index.php/servicio`. El intento inicial a `/geoserver/wfs` daba 404 porque el
path real sigue la convención **ArcGIS REST**, no GeoServer:

```bash
curl "https://geo.serfor.gob.pe/geoservicios/rest/services/Servicios_OGC/Modalidad_Acceso/MapServer?f=json"
# → HTTP 200, JSON real con las 7 capas del servicio
```

`/geoservicios/services/...` (sin `/rest/`) devuelve `400` — el path correcto exige `/rest/`.

## Servicios y capas usados por este conector

5 servicios reales confirmados en vivo (`Modalidad_Acceso`, `Ordenamiento_Forestal`,
`Zonificacion_Forestal`, `Inventario_Forestal`, `Unidad_Monitoreo_Satelital`); este conector usa
**solo los dos más relevantes para EUDR** — títulos habilitantes y clasificación de protección:

| Capa (`capa` en la API) | Servicio/Layer ID | Filas (2026-09-22) |
|---|---|---|
| `modalidad_permisos` | `Modalidad_Acceso`/0 | 182 |
| `modalidad_cesiones_en_uso` | `Modalidad_Acceso`/1 | 1,179 |
| `modalidad_autorizaciones_pfdm_avnb` | `Modalidad_Acceso`/2 | 265 |
| `modalidad_autorizacion_cambio_uso_agropecuario` | `Modalidad_Acceso`/3 | 2 |
| `modalidad_bosques_locales` | `Modalidad_Acceso`/4 | 23 |
| `modalidad_unidad_aprovechamiento` | `Modalidad_Acceso`/5 | 1,674 |
| `modalidad_concesiones_forestales` | `Modalidad_Acceso`/6 | **1,793** (la más relevante EUDR) |
| `ordenamiento_bosques_locales` | `Ordenamiento_Forestal`/0 | 23 |
| `ordenamiento_bosques_protectores` | `Ordenamiento_Forestal`/1 | 3 |
| `ordenamiento_bosques_produccion_permanente` | `Ordenamiento_Forestal`/2 | 247 |

**Total: 5,391 filas**, verificado en vivo idéntico contra la ingesta real a Postgres, 0 rechazadas.

### Fuera de alcance de este conector

- `Zonificacion_Forestal` (San Martín/Ucayali/Loreto, 1 capa) y `Inventario_Forestal` (Ecosistemas
  Frágiles/Hábitats Críticos, 2 capas) — no investigados en profundidad, candidatos a un ticket
  futuro.
- `Unidad_Monitoreo_Satelital` (Focos de Calor/Incendio Forestal, 2 capas) — dominio distinto
  (alertas casi en tiempo real, no catastro), deliberadamente fuera de alcance de ADS-02.

## Paginación

Todos los servicios soportan paginación estándar ArcGIS (`supportsPagination: true`,
`maxRecordCount: 10000` confirmado en `Modalidad_Acceso`) — a diferencia de INGEMMET (GEO-01), que
no la soporta. Las 10 capas usadas van de 2 a 1,793 filas, muy por debajo del límite — una sola
consulta sin filtro trae el dataset completo de cada capa, sin paginar por `OBJECTID`. El conector
verifica `exceededTransferLimit` en cada corrida (no lo asume una sola vez) y aborta la capa si es
`true`, en vez de confirmar un snapshot truncado.

## Hallazgo real — `NOMDEP`/`NOMPRO`/`NOMDIS` no son consistentes entre capas

Pese al nombre "NOM" (de "nombre"):

- **`NOMDEP` es siempre un código UBIGEO numérico como texto** en las 10 capas (ej. `"22"` =
  San Martín, `"13"` = La Libertad) — verificado en vivo con un ejemplo real de cada capa.
- **`NOMPRO`/`NOMDIS` son códigos UBIGEO en 9 de las 10 capas** (ej. `NOMPRO: "2206"`,
  `NOMDIS: "220602"`), pero **en `modalidad_autorizacion_cambio_uso_agropecuario` son nombres
  reales en texto** (ejemplo real observado: `NOMPRO: "Puerto Inca"`, `NOMDIS: "Honoria"`).

Esto es una inconsistencia real de la fuente entre capas del mismo dominio (SERFOR), no un error
de normalización de este conector — los tres campos se guardan tal cual vienen, como texto, sin
intentar decodificar ni unificar formato. Un consumidor que necesite el nombre real de
departamento/provincia/distrito para las 9 capas que traen código debe cruzarlo contra una tabla
UBIGEO aparte (fuera de alcance de este conector).

## Sin clave estable para upsert incremental (mismo criterio que SERNANP)

Ninguna de las 10 capas trae un campo que sea una clave de negocio verificada única (a diferencia
de INGEMMET/`CODIGOU` o legislativo-congreso/`per_par_id`+`pley_num`). `OBJECTID` es único dentro
de cada capa por consulta, pero es un ID interno de ArcGIS sin garantía de estabilidad entre
reconstrucciones del servicio. **Decisión (mismo criterio que GEO-02/SERNANP)**: cada ingesta es
un snapshot completo por capa — se borran todas las filas existentes de esa capa y se insertan las
nuevas, en la misma transacción, con `pg_advisory_xact_lock` por capa para serializar corridas
solapadas.

## Schema real (`apps/catastro-forestal/api/src/db/migrations/001_init.sql`)

```sql
raw_serfor_batches (id, source_url, capa, record_count, fetched_at)
catastro_forestal_titulos (
  id, capa, objectid, fuente, doc_reg, fec_reg, observ, zon_utm, origen,
  nom_dis, nom_pro, nom_dep, aut_for, fec_ini, fec_ter, situac, sup_sig, sup_apr,
  doc_leg, fec_leg, atributos_extra JSONB, source_batch_id, updated_at
)
catastro_forestal_titulos_rejected (id, source_batch_id, raw_row, reason, rejected_at)
```

Columnas comunes normalizadas de los campos que comparten la mayoría de las 10 capas
(`FUENTE`/`DOCREG`/`FECREG`/`OBSERV`/`ZONUTM`/`ORIGEN`/`NOMDIS`/`NOMPRO`/`NOMDEP`/`AUTFOR`/
`FECINI`/`FECTER`/`SITUAC`/`SUPSIG`/`SUPAPR`/`DOCLEG`/`FECLEG`); todo campo específico de cada capa
(ej. `TIPCON`/`CONTRA` de Concesiones Forestales, `NOMBOS`/`CATORD` de Ordenamiento) va a
`atributos_extra` sin perderse. Fechas ArcGIS (epoch ms) se convierten a `DATE`.

## Conector (`src/ingest/serfor-connector.ts`)

Un `fetch` por capa (10 en total) contra `<servicio>/MapServer/<layerId>/query`, transacción por
capa: `BEGIN` → advisory lock por capa → guarda batch crudo → `DELETE` de la capa completa →
`INSERT` de las filas normalizadas → `COMMIT`. Si una capa falla, las demás se intentan igual — los
errores se acumulan y se lanzan al final.

### Verificación en vivo (2026-09-22)

Ingesta real ejecutada contra Postgres: **5,391/5,391 filas insertadas, 0 rechazadas** (ver tabla
de capas arriba). Cobertura La Libertad (UBIGEO `13`): 1 fila en `modalidad_concesiones_forestales`
— resultado honesto y esperado, la actividad forestal de concesiones/bosques está concentrada en
la Amazonía (San Martín, Ucayali, Loreto, Madre de Dios), no en La Libertad.

## API (`src/routes/titulos.ts`)

- `GET /api/titulos` — filtros `capa` (exacto, enum de 10), `nomDep`/`nomPro`/`nomDis` (exacto,
  ver advertencia de inconsistencia arriba), paginado (`limit`/`offset`, default 200/máx. 1000).
- `GET /api/titulos/{capa}/{objectid}` — detalle por la clave compuesta real (capa+objectid, no
  `objectid` solo — no es único entre capas). Responde `404` si no existe.

Verificado en vivo contra la API real levantada localmente con datos reales ingeridos (`/health`,
`/readyz`, `/api/titulos?limit=1`, `/api/titulos?capa=modalidad_concesiones_forestales&nomDep=13`,
`/api/titulos/modalidad_concesiones_forestales/999999999` → `404`).

## MCP

Tools registradas en `mcp-server/src/catalog.ts`: `catastro_forestal_titulos`,
`catastro_forestal_titulo_detalle`. Verificado que `mcp-server/src/__tests__/routes-vs-catalog.test.ts`
pasa.

## Fuera de alcance de este conector

- `Zonificacion_Forestal`, `Inventario_Forestal`, `Unidad_Monitoreo_Satelital` (ver arriba).
- Decodificación de códigos UBIGEO a nombres — cruce futuro contra una tabla UBIGEO propia.
- Cruce geoespacial con `catastro-minero` o `areas-protegidas` (derechos mineros/ANP superpuestos
  con concesiones forestales) — candidato natural de Fase 2, no comprometido.
- Scheduler, UI, geometría (solo atributos, `returnGeometry: false`).
