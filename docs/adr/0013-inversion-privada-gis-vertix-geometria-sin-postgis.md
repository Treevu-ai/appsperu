# ADR-0013: `inversion-privada` — geometría GIS de VERTIX, sin PostGIS

- Estado: Aceptado — implementado en `apps/inversion-privada`.
- Fecha: 2026-08-28
- Ámbito: tercera fuente dentro de `inversion-privada` — geometría de proyectos de la cartera
  APP/PA (y algunos fuera de ese snapshot), sin requerir login, cerrando el límite "sin mapa
  descargable" documentado en `ADR-0011` y en el memo territorial.

## Contexto

`ADR-0010` y el data contract dejaron el GIS de VERTIX como "pendiente — explorar
`gis-vertix`", asumiendo (sin confirmar en vivo) que requería sesión, igual que
`vertix.proinversion.gob.pe` para el resto de la plataforma.

Investigación en vivo (2026-08-28): `https://www.investinperu.pe/gis-vertix/` embebe un
`<iframe>` a `https://vertix.proinversion.gob.pe/gis/dashboard/index`, que responde `200` sin
redirect a login (a diferencia de otras rutas de ese mismo dominio, que sí lo exigen). Ese
dashboard carga `DashboardPublico.js`, que define y consume:

```js
var URLRegistrosCapas = 'https://vertix.proinversion.gob.pe/GIS/Dashboard/ListaRegistrosCapas';
```

`GET` a esa URL, sin auth, devuelve un GeoJSON `FeatureCollection` real (473 features
verificadas, cada una con `geometry` — string JSON de `Point`/`LineString`/`Polygon` — y
`properties.IDPROYECTO`).

**Cruce verificado**: de 156 `IDPROYECTO` únicos en el feed GIS, 151 matchean exactamente un
`vertix_id` ya en `private_investment_projects` (la tabla que alimenta `vertixService.php`,
ver `ADR-0011`). Es la misma clave `Id`, no un cruce por nombre — 5 IDs del GIS no tienen
proyecto correspondiente en el snapshot APP/PA actual (no investigado a fondo; podrían ser
proyectos fuera de cartera vigente).

## Decisión

### Modelo canónico

- `raw_gis_batches` — checksum del FeatureCollection completo + `feature_count`.
- `vertix_project_geometries` — un registro por `codigo` (`properties.CODIGO`, ej. `"PUN-418"`
  — cada feature tiene su propio código, incluso si varias apuntan al mismo `IDPROYECTO`).
  `id_proyecto` **sin FK dura** hacia `private_investment_projects.vertix_id` — el feed GIS
  trae proyectos fuera del snapshot APP/PA actual, una FK forzaría rechazar filas válidas.
  Geometría en `geometry JSONB`, ya parseada desde el string crudo del feed.

**JSONB, no PostGIS.** El Postgres de `inversion-privada` es `postgres:16-alpine` plano
(`docker-compose.yml`), con datos ya cargados en su volumen. Migrar a `postgis/postgis` habría
significado recrear el contenedor/volumen — riesgo de infraestructura que este alcance no
justifica, porque no hay ningún requerimiento de query espacial (`ST_Within`, buffers,
intersecciones). Lo único que se pide es "dame la geometría de este proyecto" o "dame el
GeoJSON de este departamento" — ambos resueltos con un filtro simple sobre columnas normales
(`id_proyecto`, `departamentos_inei TEXT[]` con índice GIN) y devolviendo el `geometry` JSONB
tal cual. `ceplan-geo` sí usa PostGIS porque hace cruces espaciales reales contra distritos —
no es el caso acá; si en el futuro se necesitara eso, se puede reconsiderar.

`departamentos_inei` se parsea de `properties.IDDEPARTAMENTO`, que viene como código simple
(`"13"`), lista separada por comas para proyectos multi-región (`"13,06,14"`), o `null` para
proyectos de ámbito nacional (sin departamento asociado) — nunca se asume un único
departamento por feature.

### Connector

`gis-connector.ts`: `GET` simple (sin multipart, a diferencia de los otros dos conectores de
esta app) a `ListaRegistrosCapas`, sin auth. `npm run ingest:gis` — manual, snapshot completo.
Verificado: `featureCount: 473`, `rowsUpserted: 473`, `rejected: 0`.

### API

```
GET /api/gis/geojson?departamento=LA+LIBERTAD
GET /api/gis/projects/:vertixId
```

`GET /api/gis/geojson` devuelve un `FeatureCollection` real (no un envoltorio propio) — pensado
para usarse directo en un visor de mapas o descargarse como archivo. Verificado en vivo: La
Libertad trae 13 features; `GET /api/gis/projects/509` (Red vial Nº 5, el ejemplo del data
contract) devuelve su geometría correctamente.

## Alternativas consideradas

**Migrar a PostGIS ahora, "por si acaso"** — descartada por YAGNI: ningún consumidor actual
necesita `ST_*`. Si aparece esa necesidad, se puede migrar entonces sin haber cargado deuda
de infraestructura sin uso.

**FK dura de `id_proyecto` a `private_investment_projects.vertix_id`** — descartada: rompería
la ingesta de las 5 filas sin match conocido, sin ganancia real (el consumidor ya puede
verificar el match con un `LEFT JOIN` si lo necesita).

## Consecuencias

- Cierra el límite "sin mapa descargable" que documentaban ADR-0011, el data contract y el
  memo territorial — ahora hay un GeoJSON real, servido por esta app, sin depender del visor
  autenticado de PROINVERSIÓN.
- Habilita enriquecer `private_investment_projects` con geometría vía `vertix_id = IDPROYECTO`
  para cualquier consumidor futuro (no implementado en el detalle de `/api/projects/:vertixId`
  en este ADR — evaluado como mejora futura, no bloqueante).
- Endpoint no oficial — mismo riesgo que los otros dos conectores de esta app: puede cambiar
  sin aviso, requiere monitoreo de `feature_count`/checksum entre corridas.
- Sigue sin scheduler — ingesta manual.

## Referencias

- ADR previo: `docs/adr/0011-inversion-privada-app-standalone-y-connector-vertix.md`
- Spike original: `docs/adr/0010-research-spike-proinversion-vertix-cartera-app-pa-oxi.md`
- Data contract: `docs/data-contracts/proinversion-vertix-cartera-app-pa-oxi.md`
- Memo que originó este trabajo: `docs/MEMO_LA_LIBERTAD_INVERSION_PUBLICA_PRIVADA_2026-08-28.md`
