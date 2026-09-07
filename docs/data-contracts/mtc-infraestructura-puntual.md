# Data contract — MTC (Infraestructura puntual: puertos, aeródromos, peajes)

> Ficha técnica del conector: [`docs/conectores.md#infraestructura-mtc`](../conectores.md#infraestructura-mtc).
> Investigación en vivo: 2026-09-06, como parte de una segunda pasada sobre MTC (la primera dio
> lugar a `red-vial-subnacional`). Se agrupan tres datasets del mismo publicador (MTC, vía
> Plataforma Nacional de Datos Abiertos) en una sola app porque los tres son catálogos de
> infraestructura puntual (un punto geográfico = una fila), de volumen pequeño (500-600 filas
> por corte), sin overlap con `red-vial-subnacional` (que mide intervenciones en vías, no
> terminales/aeródromos/peajes) — separarlos en 3 apps habría triplicado el overhead operativo
> (3 Postgres, 3 puertos, 3 entradas de CI) sin beneficio real, ya que comparten fuente,
> encoding, cadencia de publicación y nivel de detalle.

## Fuente confirmada

Los tres datasets viven en `www.datosabiertos.gob.pe`, grupo "Ministerio de Transportes y
Comunicaciones – MTC". **Importante**: los slugs de estos datasets cambian de versión en
versión (`...-2022-y-2023` → `...-2022-2024` → `...-2022-2025`) sin que la versión vieja
desaparezca del buscador — la única forma confiable de encontrar la URL real y vigente es
listar el grupo del publicador y tomar el href real de la página (`/group/ministerio-de-
transportes-y-comunicaciones?search_api_views_fulltext=<término>`), **no** reconstruir la URL a
mano a partir del título que devuelve un buscador externo (dio 404/shell genérico dos veces en
esta pasada antes de encontrar la URL real por este método).

### 1. Terminales Portuarios y Embarcaderos

- **Dataset vigente confirmado**: "Infraestructura Portuaria – Terminales Portuarios y
  Embarcaderos 2022 a 2025", MTC.
- **Descarga directa real**: `https://www.datosabiertos.gob.pe/sites/default/files/Infraestructura_portuaria_terminales_embarcaderos_2022-2025.csv`
- **Formato**: CSV delimitado por `;`, **encoding Latin-1** (mismo patrón que MTC/PVD), sin BOM.
- **507 filas** — snapshot anual acumulado: `FECHA_CORTE` toma 4 valores (`20221231`,
  `20231231`, `20241231`, `20251231`), una fila por terminal por año.
- **Clave natural confirmada con datos reales**: `(CODIGO_PUERTO, FECHA_CORTE)` — 507/507 filas
  únicas, sin colisiones. `CODIGO_PUERTO` (ej. `131SVY1`) es estable entre años aunque el `ID`
  correlativo de fila no lo es (cambia cada corte).
- **Columnas confirmadas**: `ID`, `ID_DEPARTAMENTO`, `ID_PROVINCIA`, `ID_DISTRITO`, `LOCALIDAD`,
  `NOMBRE_TERMINAL`, `LABEL_TERMINAL`, `AMBITO` (Marítimo/Fluvial/Lacustre), `TIPO_TERMINAL`,
  `CODIGO_PUERTO`, `ALCANCE`, `USO`, `TRAFICO`, `ACTIVIDAD`, `SUBACTIVIDAD`, `ESTADO`,
  `ESTADO_CONSERVACION`, `TITULARIDAD`, `ADMINISTRADOR`, `ES_CONCES`, `LATITUD`, `LONGITUD`,
  `FECHA_CORTE`.
- **Sin PII**: es infraestructura, no personas.
- **La Libertad confirmada**: 3 terminales únicos × 4 años = 9 filas — TP Multipropósito
  Salaverry (`131SVY1`, Trujillo), TP Multiboyas Salaverry (`131SVY2`, Trujillo), TP Chicama/
  Malabrigo (`131CHM1`, Ascope, gestionado por el Gobierno Regional de La Libertad).

### 2. Infraestructura Aeroportuaria (Aeródromos)

- **Dataset vigente confirmado**: "Infraestructura Aeroportuaria - Aeródromos 2022 a 2025", MTC.
- **Descarga directa real**: `https://www.datosabiertos.gob.pe/sites/default/files/Infraestructura_aeroportuaria_aerodromos_2022-2025.csv`
- **Formato**: CSV `;`, Latin-1, sin BOM.
- **595 filas**, mismo patrón de corte anual acumulado (`20221231`...`20251231`).
- **Clave natural confirmada**: `(CODIGO_AERODROMO, FECHA_CORTE)` — 595/595 únicas.
  `ID_AERODROMO` (columna `ID`) **no sirve como identificador**: en el corte 2025 la fuente
  publicó el valor literal `#¡REF!` (error de fórmula de Excel arrastrado al CSV publicado, no
  un artefacto de nuestro parseo) para todas las filas de ese año.
- **Columnas confirmadas**: `ID` (no usar, ver arriba), `ID_DEPARTAMENTO`, `ID_PROVINCIA`,
  `ID_DISTRITO`, `DEPARTAMENTO`, `PROVINCIA`, `DISTRITO`, `NOMBRE`, `LABEL`, `TIPO_AERODROMO`,
  `CODIGO_AERODROMO`, `CODIGO_OACI`, `ESCALA`, `ESTADO`, `ADMINISTRADOR`, `JERARQUIA`,
  `TITULARIDAD`, `LATITUD`, `LONGITUD`, `ES_CONCES`, `FECHA_CORTE`.
- **Sin PII**.
- **La Libertad confirmada**: 9 aeródromos únicos × 4 años = 36 filas — incluye el Aeropuerto
  Internacional Cap. FAP Carlos Martínez de Pinillos (Trujillo, `1311TRU`, concesionado a
  Aeropuertos del Perú S.A.) y 8 aeródromos rurales/mineros/municipales: Chagual y Pías (Pataz,
  mineras Poderosa y Consorcio Minero Horizonte), Chao (Virú, Camposol), Huamachuco (Sánchez
  Carrión, municipal), Pata de Gallo (Santiago de Chuco, Barrick Misquichilca), Tulpo (Santiago
  de Chuco, municipal), Urpay (Pataz, municipal), Pacasmayo (Escuela Peruana de Aviación Civil).

### 3. Unidades de Peaje de la Red Vial Nacional

- **Dataset vigente confirmado**: "Unidades de Peaje de la Red Vial Nacional 2024 – 2025",
  publicado 2025-10-09, última modificación 2026-06-08.
- **Descarga directa real**: `https://www.datosabiertos.gob.pe/sites/default/files/unidades_peaje_2024-2025.geojson`
- **Formato**: GeoJSON (FeatureCollection de puntos), UTF-8.
- **233 features**. `FECCORTE` toma 3 valores confirmados: `20241230`, `20250630`, `20251231`
  — **el corte más reciente de los tres datasets de esta pasada** (dic-2025, más fresco que
  `red-vial-subnacional` para el mismo ministerio, cuyo corte de vías es jun-2026 pero solo
  cubre intervenciones, no peajes).
- **Clave natural confirmada**: `(CODPEAJE, FECCORTE)` — 233/233 únicas. `IDPEAJE` (correlativo)
  no es estable entre cortes, igual que en los otros dos datasets.
- **Propiedades confirmadas**: `IDPEAJE`, `NOMBRE`, `LABEL`, `CODPEAJE`, `CODRUTA`, `INICIO`
  (km), `CODCLOG`, `DEPARTAMEN`, `PROVINCIA`, `DISTRITO`, `LOCALIDAD`, `IDDPTO`, `IDPROV`,
  `IDDIST`, `ES_CONCES`, `TITULAR`, `UBICACION`, `ESTADO`, `ADMINIST`, `FECCORTE`. Geometría
  `Point` con `[longitud, latitud]`.
- **Sin PII**.
- **La Libertad confirmada**: 5 unidades de peaje únicas × 3 cortes = 15 filas — Menocucho
  (Trujillo/Laredo, vía Sierra Norte), Virú (Panamericana Norte, AUNOR), Pacanguilla (Chepén,
  Panamericana Norte, COVISOL), Chicama (Ascope, Panamericana Norte, COVISOL), Ciudad de Dios
  (Pacasmayo/Guadalupe, vía Sierra Norte).

## Pendiente / trabajo futuro

- Ninguno de los tres trae serie histórica de tráfico/recaudación — son catálogos de
  infraestructura (ubicación, estado, titularidad), no de operación. Un dataset relacionado
  ("Flujo vehicular registrado en las unidades de peaje... 2014-2025") fue detectado en la
  búsqueda pero no verificado en esta pasada — candidato para una futura ampliación de
  `infraestructura-mtc` si se decide medir tráfico, no solo inventario.
- El error `#¡REF!` en `ID_AERODROMO` 2025 debería reportarse al equipo de datos abiertos de
  MTC (no es accionable desde este catálogo, solo documentado y evitado usando
  `CODIGO_AERODROMO`).
