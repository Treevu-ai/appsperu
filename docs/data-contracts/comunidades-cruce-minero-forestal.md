# Data contract — geo-intersections: Comunidades ∩ Minero/Forestal

- Tercera dimensión del cruce geoespacial que ya existía (`mining_rights ∩ forest_titles`,
  ver `docs/adr/...` si existe, o `intersection_results`) — ahora también
  `rural_communities ∩ mining_rights` y `rural_communities ∩ forest_titles`.
- Owner: `apps/geo-intersections/api` (mismo pool PostGIS).
- Verificado en vivo el 2026-10-06: cómputo real corrido contra Postgres local y contra Neon
  producción (`geo_intersections`), con los 4 endpoints + 4 tools MCP probados contra datos
  reales en ambos.

## Estado: IMPLEMENTADO Y VERIFICADO EN VIVO (POSTGRES LOCAL + NEON PRODUCCIÓN)

## Origen: exploración ad-hoc antes de construir nada

Antes de escribir una sola línea de código de este conector, se corrió la consulta
`ST_Intersects` directamente contra Neon (vía MCP de Neon) para confirmar que había una señal
real antes de invertir en construirlo. Resultado: **1,930 de 4,492 comunidades (43%) tocan al
menos un derecho minero titulado**. Filtrando a comunidades de tamaño plausible (≥10 km²) con
alta cobertura, aparecieron casos de **100% del territorio cubierto por 4-20 derechos mineros**,
concentrados en **Espinar, Cusco** — zona de conflicto minero históricamente documentada
(Antapaccay/Tintaya). El titular con más comunidades afectadas es **MINERA BARRICK PERU S.A.**
(108 comunidades, 196 concesiones "ALQO").

## Hallazgo real: `ST_Multi(ST_Intersection(...))` no alcanza — revienta con `GeometryCollection`

Primer intento de `compute-community-intersections.ts` falló a mitad de la corrida real contra
datos reales:

```
error: Geometry type (GeometryCollection) does not match column type (MultiPolygon)
```

`ST_Intersection` de dos polígonos puede devolver una `GeometryCollection` cuando el overlap real
(área) viene acompañado de un artefacto de dimensión menor (un borde que solo se toca en una
línea o un punto) — `ST_Multi()` no corrige esto, solo envuelve el tipo que ya tiene.
**Solución**: `ST_Multi(ST_CollectionExtract(ST_Intersection(a, b), 3))` — `ST_CollectionExtract`
extrae solo la parte poligonal (dimensión 3) antes de envolver en `Multi`. Se agregó además un
filtro `AND ST_Area(ST_Intersection(a, b)::geography) > 0` en el `JOIN` para no guardar pares que
solo se tocan en el borde (área cero, sin significado territorial real).

## Esquema

Mismo patrón que `intersection_results` (001) + `geometry_valid` (004), extendido:

- `rural_communities.geometry_valid` (nueva, migración 006) — repara las 25/4,492 geometrías
  inválidas una sola vez, mismo motivo que `mining_rights.geometry_valid`/`forest_titles.geometry_valid`.
- `community_mining_intersections` — comunidad (capa/objectid/nombre/depto/provincia/área) +
  derecho minero (codigou/concesión/titular/estado/sustancia/área) + geometría de la
  intersección (`GEOMETRY(MultiPolygon, 4326)`) + área + `community_overlap_pct` +
  `mining_overlap_pct`.
- `community_forest_intersections` — análoga con `forest_titles`.
- `raw_community_intersection_batches` — batches compartidos, discriminados por `tipo`
  (`'minero'`/`'forestal'`), una corrida de `npm run ingest:comunidad-cruce` hace los dos pases.
- `community_mining_coverage` / `community_forest_coverage` (migración 008) — **cobertura
  REAL**, una fila por comunidad (no por par). Ver sección siguiente.

## Cobertura REAL vs. suma de pares — hallazgo real de método (2026-10-07)

Sumar `community_overlap_pct` entre las filas de `community_mining_intersections` para una
misma comunidad **sobrestima**: dos derechos mineros/títulos distintos pueden solaparse *entre
sí* sobre el mismo terreno (ej. dos concesiones mineras superpuestas, una vigente y otra en
trámite sobre la misma área), y sumar sus overlaps individuales duplica esa porción común.
Confirmado en vivo: casos reales con suma de **131-175%** al calcularlo así — **MOLLOCCAHUA**
(Espinar, Cusco) parecía tener solo 24.7% cubierto solo por la concesión "ALQO 147" de Barrick
al mirar un único par, pero su cobertura real (las 9 concesiones que la tocan, unidas antes de
medir) es **79.86%**, no una suma ingenua de los 9 porcentajes individuales.

**Corrección**: `community_mining_coverage`/`community_forest_coverage` calculan
`ST_Area(ST_Intersection(comunidad, ST_Union(todos los derechos/títulos que la tocan)))` — el
`ST_Union` desduplica el solapamiento entre derechos antes de medir contra la comunidad.
`pct_cobertura` queda clampeado a `LEAST(..., 100)` como amortiguador defensivo ante un posible
desborde de centésimas por redondeo de punto flotante entre dos `ST_MakeValid` distintos — la
intersección real nunca debería superar el área de la propia comunidad.

Severidad real a nivel nacional (no la de la tabla de pares):

| Cobertura real | Comunidades |
|---|---|
| <10% | 540 |
| 10–50% | 724 |
| 50–90% | 364 |
| **≥90%** | **302** (15.6% de las 1,930 afectadas) |

**40 comunidades tienen doble exposición** (minero Y forestal a la vez).

## Conector (`src/ingest/compute-community-intersections.ts`)

1. Bounding-box pre-filter vía índice GIST sobre `geometry_valid` + `ST_Intersects` real —
   mismo patrón que `compute-intersections.ts` (minería ∩ bosque).
2. Solo considera derechos mineros **titulados** (`m.estado = 'T'`) — mismo criterio que la
   exploración inicial.
3. Dos pases independientes (comunidad∩minero, comunidad∩forestal), cada uno con su propio
   snapshot completo (`DELETE` + `INSERT`) en su propia transacción.
4. `batchId` se trata como `number` (a diferencia de `ocapas-connector.ts`, aquí
   `RETURNING id` se castea explícitamente con `Number(...)` al leerlo, sin pasarlo crudo).

## Verificación en vivo (2026-10-06) — Postgres local y Neon producción

Corrido dos veces (Postgres local vía Docker, y Neon producción `geo_intersections`) con
resultados **idénticos**:

| | Pares | Comunidades afectadas |
|---|---|---|
| Comunidad ∩ minero titulado | 14,650 | 1,930 (43% de 4,492) |
| Comunidad ∩ forestal | 859 | 320 (7%) |

Desglose forestal por capa (comunidades afectadas, no pares): `modalidad_permisos` 179,
`ordenamiento_bosques_produccion_permanente` 134, `modalidad_unidad_aprovechamiento` 94,
**`modalidad_concesiones_forestales` 87** (la categoría más sensible: concesiones de tala
comercial a terceros sobre territorio comunal/indígena — el escenario donde la consulta previa,
Convenio 169 OIT, es más relevante), `modalidad_autorizaciones_pfdm_avnb` 14,
`ordenamiento_bosques_protectores` 2.

Top titulares mineros por comunidades afectadas (verificado, nombres reales contra INGEMMET):
MINERA BARRICK PERU S.A. (108), FRESNILLO PERU S.A.C. (78), VALE EXPLORATION PERU S.A.C. (74),
GABRIEL EUGENIO JOSE DE ROMAÑA LETTS (65, persona natural), COMPAÑIA MINERA CHUNGAR S.A.C. (47),
TECK PERU S.A. (41), COMPAÑIA MINERA POMATAREA S.A.C. (40), YURA S.A. (40), HUDBAY PERU S.A.C.
(38), HOLCIM PERU AGREGADOS S.A. (37), RIO TINTO MINING AND EXPLORATION S.A.C. (36), COMPAÑIA DE
MINAS BUENAVENTURA S.A.A. (33), BHP WORLD EXPLORATION INC. SUCURSAL DEL PERU (33), MINERA UNA
S.A. (32), BLACK SWAN MINERALS S.A.C. (27).

Caso destacado verificado (cobertura real, no suma de pares): comunidad campesina
**MOLLOCCAHUA** (Espinar, Cusco, 40.5 km²) con **79.86%** de su territorio real cubierto por 9
concesiones (incluida "ALQO 147" de Barrick). Comunidad campesina **INDEPENDIENTE** (Carabamba,
Otuzco, La Libertad, 10.7 km²) con **100%** real bajo 7 derechos (Barrick y otros).

Los 4 endpoints + 2 de cobertura, y las 6 tools MCP, probados contra datos reales en ambas
bases (local y Neon), incluyendo casos 400/404 de validación.

## API (`src/routes/intersections.ts`, extiende el router existente de `/api/cruce`)

- `GET /api/cruce/comunidad/:capa/:objectid` — superposiciones (minero + forestal) de una
  comunidad específica, **incluyendo `cobertura_minero_real`/`cobertura_forestal_real`**
  (ST_Union, ver arriba). `capa` obligatoria en el path — mismo motivo que
  `/api/communities/:objectid` (`objectid` no es clave única por sí solo).
- `GET /api/cruce/comunidad-minero/report` — una fila por PAR. Filtros `capa`/`departamento`/
  `titular` (ILIKE)/`min_area_km2`/`min_community_overlap_pct`, paginado (máx. 1000).
- `GET /api/cruce/comunidad-forestal/report` — análogo con `forest_capa`.
- `GET /api/cruce/comunidad-minero/cobertura` — **una fila por COMUNIDAD**, cobertura real
  (`ST_Union`). Filtros `capa`/`departamento`/`provincia`/`distrito`/`min_pct`/`min_area_km2`.
- `GET /api/cruce/comunidad-forestal/cobertura` — análogo con títulos forestales.
- `GET /api/cruce/comunidad/stats` — resumen + doble exposición + buckets de severidad real +
  top titulares + desglose por capa forestal.

## MCP (`mcp-server/src/handlers/geo-intersections/community-crossref.ts`)

6 tools: `geo_intersections_comunidad_cruce`, `geo_intersections_comunidad_minero_reporte`,
`geo_intersections_comunidad_forestal_reporte`, `geo_intersections_comunidad_minero_cobertura`,
`geo_intersections_comunidad_forestal_cobertura`, `geo_intersections_comunidad_cruce_stats`.
SQL idéntico a las rutas Express — los handlers MCP consultan Neon directamente, no proxy HTTP.

## Limitaciones

- Solo derechos mineros **titulados** (`estado='T'`) — no incluye concesiones en trámite. Si se
  quisiera medir presión futura (no solo superposición consumada), habría que correr el mismo
  cómputo sin ese filtro como un reporte separado.
- No distingue si la superposición es anterior o posterior a la formalización de la comunidad
  (ambas fuentes no traen fecha de inscripción comunal confiable para esa comparación).
- No implica per se una irregularidad legal — superposición de derecho minero titulado y
  territorio comunal es un escenario contemplado por la normativa peruana (requiere servidumbre
  o acuerdo con la comunidad para la fase de explotación) pero el dato por sí solo no confirma
  si ese acuerdo existe o no. Para eso se necesitaría cruzar con expedientes de servidumbre o
  consulta previa (no implementado, fuente no identificada aún).
