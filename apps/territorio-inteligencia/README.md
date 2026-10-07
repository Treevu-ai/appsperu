# territorio-inteligencia

App Express que cruza catastro (minero y forestal) con sanciones, proyectos
de inversión pública (OxI) y alertas de deforestación MINAM para responder
cuatro preguntas: qué titulares mineros tienen riesgo sancionador (por nombre,
no por RUC), si la superficie de un departamento está concentrada en pocas
manos, si un proyecto de Obras por Impuestos se superpone por distrito a un
derecho minero, y cuántas alertas de deforestación caen dentro de un título
forestal.

**Reescrita 2026-10-07.** Hasta esa fecha, los 4 servicios consultaban tablas
que no existían en ninguna base del repo (`minam_deforestacion`,
`inteligencia_minero`, `proyectos`) o pedían columnas inventadas
(`titular_ruc`, `superficie`) sobre esquemas reales que no las tienen. El
conector de MINAM generaba datos con `Math.random()`. Nada de esto corría
fuera de los `.cjs` de exploración que fabricaban las tablas localmente.

## Arquitectura de pools

Esta app tiene su propia base (`territorio_inteligencia`, solo para las
alertas MINAM que sí ingiere) más 5 pools de solo lectura hacia otras apps
— el mismo patrón que usa `proveedores-sancionados`
(`CATASTRO_MINERO_DATABASE_URL`, `CATASTRO_FORESTAL_DATABASE_URL`,
`SANCIONES_DATABASE_URL`, `GEO_INTERSECTIONS_DATABASE_URL`,
`INVERSION_PRIVADA_DATABASE_URL`, ver `.env.example`). Los cruces entre
fuentes se resuelven en código de aplicación (nunca con `JOIN` SQL directo
entre bases distintas — Postgres no lo soporta sin `dblink`/`postgres_fdw`,
que este repo no usa).

## Limitaciones reales de los datos (no son bugs, son la fuente)

- **Ni catastro minero ni forestal tienen RUC.** `catastro_minero_derechos.
  titular` es un nombre, no un identificador. El cruce contra sanciones
  (`titulares-riesgo`) usa `@appsperu/entity-matcher` (match difuso por
  nombre, confianza `confirmada`/`candidata`) — nunca trates una coincidencia
  `candidata` como una violación confirmada, es una coincidencia de nombre a
  revisar.
- **El catastro forestal no tiene titular en absoluto.** SERFOR no publica
  dueño de concesión/cesión forestal. `titulares-riesgo` por eso solo cubre
  `tipoCatastro: "minero"`; `captura-territorio` para forestal agrupa por
  `capa` (modalidad) + `SECTOR` cuando la fuente lo trae (a menudo vacío), no
  por titular.
- **`nom_dep`/`nom_pro`/`nom_dis` en catastro-forestal y en
  `geo-intersections.forest_titles` son códigos UBIGEO, no nombres** — pese
  a lo que sugiere el nombre de columna (verificado en vivo 2026-10-07:
  `nom_dep = "13"`, no `"LA LIBERTAD"`). `src/lib/ubigeo.ts` traduce.
- **MINAM reporta alertas puntuales (lat/lon), no polígonos de área
  deforestada.** `riesgo-eudr` no inventa hectáreas: cuenta cuántas alertas
  caen dentro del polígono real de un título forestal (geometría de
  `geo-intersections.forest_titles`, intersección punto-en-polígono real con
  `@turf/boolean-point-in-polygon`), y clasifica ALTO/MEDIO/BAJO por ese
  conteo — una heurística propia del conector, no una clasificación oficial
  de MINAM ni de la UE.
- **`inconsistencia-presupuesto`** cruza `inversion-privada.
  oxi_investment_promotions` (Obras por Impuestos, con distrito/provincia
  reales) contra `catastro_minero_derechos` por coincidencia exacta de
  distrito+provincia — es una señal de coexistencia territorial, no una
  superposición geométrica (ninguna de las dos fuentes tiene polígono).

## Conector de ingesta

`src/ingest/minam-connector.ts` pagina el servicio ArcGIS REST real de
GeoServidor MINAM (`Tem_AlertasTempranasDeforestacion`, confirmado en vivo:
183,767 puntos nacionales) y los guarda en la base propia de esta app.
`ON CONFLICT (object_id) DO NOTHING` lo hace seguro de re-ejecutar.

## Estado en el catálogo MCP

Ya está en `APP_KEYS` (`mcp-server/src/apps.ts`) y en el catálogo (`mcp-server/
src/catalog.ts`), con las 4 rutas con tests propios (`captura-territorio.
test.ts`, `titulares-riesgo.test.ts`, `inconsistencia-presupuesto.test.ts`,
`riesgo-eudr.test.ts`) y el ingest de MINAM corrido contra Neon en producción
(`npm run migrate && npm run ingest:minam`, 183,767 filas).
