# Data contract — PROINVERSIÓN: Cartera VERTIX (APP, PA y OxI)

> Ficha técnica: `docs/adr/0010-research-spike-proinversion-vertix-cartera-app-pa-oxi.md`
> (investigación) y `docs/adr/0011-inversion-privada-app-standalone-y-connector-vertix.md`
> (app `inversion-privada`, connector `vertix-connector.ts`).

- Fuente oficial: Agencia de Promoción de la Inversión Privada (PROINVERSIÓN) — plataforma
  **VERTIX**, expuesta públicamente vía `https://www.investinperu.pe/` (buscador de cartera,
  dashboard y GIS). La mayoría del backend en `https://vertix.proinversion.gob.pe/` exige
  sesión, **excepto** el dashboard GIS público y el endpoint que este consume (ver sección
  GIS abajo) — confirmado en vivo, no asumir que todo ese dominio requiere login.
- Owner del conector: app `inversion-privada` (`apps/inversion-privada/api`).
- **Confirmado en vivo el 2026-08-28** con `curl` contra los endpoints PHP del tema WordPress
  (APP/PA, OxI) y contra el backend MVC del dashboard GIS.

## Estado: CONFIRMADO — cartera APP/PA, OxI y GIS, los tres implementados

### Hallazgo decisivo: cartera APP/PA vía `vertixService.php`

**Endpoint** (no documentado oficialmente; inferido del front de
`investinperu.pe/inversiones-cartera-vertix/`):

```http
POST /wp-content/themes/hello-elementor-child/__api/service/app/vertixService.php
Content-Type: multipart/form-data
```

**Request mínimo para universo completo** (verificado):

| Campo | Valor de prueba |
|---|---|
| `Lan` | `es` |
| `Page` | `1` |
| `PageLimit` | `500` |
| `NombreProyecto` | *(vacío)* |
| `TipoProyectoList` | *(vacío = todos)* |
| `SectorList`, `EstadoList`, `DepartamentoList`, `TipologiaList`, `AnioList`, `EntidadList`, `GreenBrownList`, `SituacionActualList`, `TipoIniciativaList`, `ModalidadList` | *(vacíos)* |

**Respuesta** (`application/json`):

| Campo top-level | Significado |
|---|---|
| `Code` | `1` = éxito (enum `CodeEN` en `hl_constants.js`) |
| `RecordsTotal` | Total de proyectos que cumplen filtros |
| `Data` | Array de proyectos (paginado por `Page` / `PageLimit`) |

**Corte verificado 2026-08-28**:

| Métrica | Valor |
|---|---|
| `RecordsTotal` nacional | 340 |
| Filas en `Data` con `PageLimit=500` | 340 |
| APP (`TipoProyecto`) | 226 |
| PA | 114 |
| La Libertad (`DepartamentoList=13`) | 22 |

**IDs de tipo de proyecto** (checkboxes del buscador):

| ID | Modalidad |
|---|---|
| `25299` | APP |
| `25300` | PA |

**Departamentos**: `DepartamentoList` usa código INEI de dos dígitos (`01`…`25`), no el nombre
literal. Ejemplo: `13` = La Libertad.

### Campos por proyecto (muestra APP real, `Id=509`)

| Campo | Ejemplo | Notas |
|---|---|---|
| `Id` | `509` | Clave interna PROINVERSIÓN |
| `Slug` | `509-red-vial-nº-5-tramo-ancon-huacho-pativilca` | |
| `TipoProyecto` | `APP` | También `PA` |
| `IdTipoProyecto` | `25299` | |
| `Nombre` | `Red vial Nº 5: Tramo Ancón-Huacho-Pativilca` | |
| `Sector` | `Transporte` | |
| `Cartera` | `Vial` | Tipología dentro del sector |
| `Fase` / `IdFase` | `Ejecución Contractual` / `104` | |
| `Estado` | `En Ejecución Contractual` | |
| `Titular` | `MINISTERIO DE TRANSPORTES Y COMUNICACIONES` | Entidad concedente |
| `MontoInversionSIGV` | `61.4` | Numérico; millones USD en el corte probado |
| `MontoInversionSIGV_Texto` | `US$ 61.40 millones` | |
| `MontoProyecto` | `US$ 61.40` | |
| `Modalidad` | `Autofinanciada` | |
| `ModalidadContractual` | `Contrato de Concesión` | |
| `GreenBrownfield` | `Greenfield` | |
| `BuenaProPrevista` | `24/05/2002` | Fecha texto |
| `AnhoConcesion` | `25` | Años |
| `url_thumb` | `https://vertix.proinversion.gob.pe/RepositorioAPS0/...` | Imagen; dominio autenticado para docs |
| `url_geo` | *(vacío en muestra)* | Campo del JSON de `vertixService.php`, sin uso confirmado — la geometría real se obtiene de un endpoint GIS distinto, ver sección GIS abajo |
| `CodigosSubProyectos` / `CodigosSubProyectosList` | vacíos | **Sin CUI en corte completo (340/340)** |

### OxI — export XLSX (esquema confirmado, ingerido por `inversion-privada`)

```http
POST /wp-content/themes/hello-elementor-child/__api/service/oxi/investmentpromotionExport.php
Content-Type: multipart/form-data
```

**Request mínimo**: campo `Lan=es`. Sin autenticación.

**Respuesta** (`application/json`): `Code` (1 = éxito), `Data` = XLSX válido en base64 (~122 KB
en el corte 2026-08-28), sin filas de `List`/`Map` estructuradas (quedan `null`, no se usan).

**Estructura del XLSX** — a diferencia del XLSX de INFOBRAS, este **sí usa shared strings**
(`xl/sharedStrings.xml`) para casi todo el texto, y no usa prefijo de namespace (`<row>`, `<c>`,
`<v>` en vez de `<x:row>`...). El archivo es pequeño (~760 filas) y se procesa completo en
memoria, sin streaming.

- Fila de metadata: celda `B8` = `"Nº Registros: 761"` (así se lee el total, no hay campo
  `RecordsTotal` estructurado como en `vertixService.php`).
- Cabecera real en la fila `r="10"`, columnas B→Q:

| Col | Campo | Ejemplo (`Id` interno `5893`) |
|---|---|---|
| B | N° | `5893` |
| C | FASE OXI | `Priorizado` |
| D | TIPO DE INVERSIÓN | `Proyecto de inversión` |
| E | ÚLTIMO NIVEL DE ESTUDIO | `Ficha técnica` |
| F | NIVEL DE GOBIERNO | `Gobierno Local Provincial` |
| G | DEPARTAMENTO | `LA LIBERTAD` |
| H | PROVINCIA | `TRUJILLO` |
| I | DISTRITO | `TRUJILLO` |
| J | ENTIDAD | `MUNICIPALIDAD PROVINCIAL DE TRUJILLO` |
| K | LINK WEB | `Enlace` (texto literal, no URL — el hyperlink real está en `sheet1.xml.rels`, no explotado) |
| L | CODIGO SNIP / INVIERTE.PE / CÓDIGO IDEA | `2698796` |
| M | NOMBRE DEL PROYECTO | `MEJORAMIENTO DEL SERVICIO DE MOVILIDAD URBANA...` |
| N | FUNCIÓN | `TRANSPORTE` |
| O | TIPOLOGIA | `Vías Urbanas` |
| P | MONTO DE INVERSIÓN REFERENCIAL | `S/6,784,469.84` (soles, texto formateado) |
| Q | RANGO MONTO INVERSIÓN | `3-10 mill` |

**Corte verificado 2026-08-28**: 761 registros nacional, **55 en La Libertad**
(`DEPARTAMENTO = "LA LIBERTAD"`, texto literal en la fila — no hay código INEI como en
`vertixService.php`). Columna L es numérica en 705/761 filas nacional; el nombre de columna
mezcla tres sistemas de código, así que **no toda fila con L numérico es necesariamente un
`codigo_snip` de Invierte.pe** — solo se confirma con el match exacto contra
`radar-inversiones.investments.codigo_snip` (ver `docs/adr/0012-...md`).

**Cruce confirmado en vivo (La Libertad, 2026-08-28)**: de 55 proyectos OxI, 52 traen código en
L; **45 matchean exactamente** un `codigo_snip` de `radar-inversiones` (nombres de proyecto
casi idénticos entre ambas fuentes, lo que corrobora que el match no es casualidad numérica).
Implementado en `apps/inversion-privada/api/src/routes/crossref.ts`
(`GET /api/crossref/oxi`).

**Solapamiento con APP/PA**: universos distintos por diseño — OxI usa financiamiento vía
impuestos con reembolso a la empresa privada, APP/PA son concesiones/activos. No se han
encontrado proyectos duplicados por nombre en la muestra de La Libertad, pero no se ha hecho
una verificación exhaustiva.

### GIS — dashboard público, sin login (esquema confirmado, ingerido por `inversion-privada`)

```http
GET https://vertix.proinversion.gob.pe/GIS/Dashboard/ListaRegistrosCapas
```

**Descubrimiento**: `https://www.investinperu.pe/gis-vertix/` embebe un `<iframe>` a
`https://vertix.proinversion.gob.pe/gis/dashboard/index`. Ese dashboard responde `200` **sin**
redirect a login (a diferencia de otras rutas del mismo dominio) y carga
`/Content/libreriajs/mod/GIS/DashboardPublico.js`, que define y consume la URL de arriba vía
`$.getJSON`. Confirmado con `curl` normal (User-Agent de navegador, sin cookies ni sesión).

**Respuesta**: GeoJSON `FeatureCollection`. Cada `feature.geometry` viene como **string JSON**
(hay que `JSON.parse` antes de usarlo), no como objeto GeoJSON directo.

| Propiedad | Ejemplo (`CODIGO="PUN-192"`) | Notas |
|---|---|---|
| `IDPROYECTO` | `509` | **Misma clave `Id` de `vertixService.php`** — cruce exacto, no por nombre |
| `NOMBREPROYECTO` | `Red vial Nº 5: Tramo Ancón-Huacho-Pativilca` | |
| `SECTOR` | `Transporte` | |
| `FASE` | `Ejecución Contractual` | |
| `TIPOPROYECTO` | `APP` | También `PA` |
| `IDDEPARTAMENTO` | `null` | Código INEI simple (`"13"`), lista separada por comas para proyectos multi-región (`"13,06,14"`), o `null` para ámbito nacional — **nunca asumir un solo departamento por feature** |
| `CODIGO` | `PUN-192` | Clave primaria por feature — un mismo `IDPROYECTO` puede tener varias features (punto + línea, o varios puntos) |
| `TIPOCOORDENADANOMBRE` | `Punto` | También `Línea`, `Polígono` |

**Corte verificado 2026-08-28**: 473 features nacional. De 156 `IDPROYECTO` únicos, **151
matchean exactamente** un `vertix_id` ya en `private_investment_projects` — cruce fuerte, no
por nombre. La Libertad: 13 features (filtrando por `"13"` en `IDDEPARTAMENTO`, incluyendo los
casos multi-región).

**Los 5 sin match, investigados (2026-08-28)**: Proyecto de Agua Tumbes, Teleférico
Huascarán, Nueva Villa Panamericana y Mercado Minorista de Piura están en fase
`"Formulación"`; Adenda TGP está en fase `"Transacción"`. **No es un problema de datos** — el
feed GIS incluye un pipeline más amplio (proyectos en preparación, antes de entrar
formalmente a la cartera pública) que `vertixService.php` no expone. El buscador de cartera
(`private_investment_projects`) solo muestra proyectos ya en cartera activa; el GIS interno de
PROINVERSIÓN parece alimentarse de un universo previo a ese filtro.

**Cierra el límite "sin mapa descargable"** que quedaba en ADR-0011 y en el memo territorial:
`GET /api/gis/geojson?departamento=` de `inversion-privada` sirve un `FeatureCollection` real,
sin requerir la sesión que sí exige el resto de `vertix.proinversion.gob.pe`. Ver
`docs/adr/0013-inversion-privada-gis-vertix-geometria-sin-postgis.md` para la decisión de
guardar la geometría en JSONB (no PostGIS) y el resto del detalle de implementación.

### Fuentes descartadas o no aptas para conector primario

| Fuente | Motivo |
|---|---|
| `vertix.proinversion.gob.pe/Account/*` y el backoffice general | Login obligatorio (`302` → `/Account/Login`) — **no aplica al dashboard GIS público**, ver sección GIS arriba |
| `datosabiertos.gob.pe` | Sin publisher PROINVERSIÓN; inversiones públicas son MEF |
| Boletines / anuarios PDF | Agregados, no fila por fila |
| Brochure PDF 2025-2026 | Estático, no actualizable por API |

## Implicaciones para cruces con el ecosistema

**Cartera APP/PA** (`vertixService.php`, sin CUI ni SNIP):

| Entidad destino | Clave disponible | Viabilidad |
|---|---|---|
| `radar-inversiones` (Invierte.pe) | CUI | **No** — VERTIX no publica CUI en el corte actual |
| `infobras` | CUI | **No** — mismo motivo |
| `radar-ejecucion` (MEF) | `SEC_EJEC` / nombre entidad | Débil — solo `Titular` como texto libre |
| Geometría (GIS VERTIX) | `IDPROYECTO` = `vertix_id` | **Sí** — 151/156 confirmado, ver sección GIS y `GET /api/gis/projects/:vertixId` |
| Análisis sectorial / territorial | `Sector`, `DepartamentoList` en filtros | Sí — filtro por dept INEI confirmado |

**OxI** (`investmentpromotionExport.php`, sí trae un código de referencia):

| Entidad destino | Clave disponible | Viabilidad |
|---|---|---|
| `radar-inversiones` (Invierte.pe) | `codigo_referencia` (col. L) vs. `codigo_snip` | **Sí, parcial** — match exacto confirmado: 45/55 proyectos de La Libertad (52 con código, 45 matchean). Implementado en `GET /api/crossref/oxi`. |
| `infobras` | CUI | **No** — OxI no publica CUI, solo el código mixto de la columna L |

## Riesgos de ingesta

1. **API no oficial** — proxy PHP de WordPress, no contrato público.
2. **Paginación por defecto engañosa** — sin `PageLimit` alto solo devuelve 6 filas
   (`vertixService.php`).
3. **Sin incremental** — cada corrida es snapshot completo (patrón aceptable en el proyecto).
4. **Medios en dominio autenticado** — thumbnails apuntan a `vertix.proinversion.gob.pe`.
5. **Columna L de OxI mezcla tres sistemas de código** (SNIP / Invierte.pe / IDEA) — un valor
   numérico en L no garantiza que sea un `codigo_snip`; solo el match exacto contra
   `radar-inversiones` lo confirma fila por fila.

## Estado de los pendientes originales (spike ADR-0010)

1. ~~Documentar columnas del XLSX OxI.~~ Hecho — ver esquema arriba y `ADR-0012`.
2. ~~Probar `gis-vertix` para geometría o enlace territorial por proyecto.~~ Hecho — ver
   sección GIS arriba y `ADR-0013`. El enlace territorial resultó ser `IDPROYECTO = vertix_id`,
   no una geometría por departamento.
3. Corrida de regresión periódica (`RecordsTotal`/`feature_count`, hash del JSON) para
   detectar cambios de esquema — **sigue pendiente**, los tres conectores
   (`vertix-connector.ts`, `oxi-connector.ts`, `gis-connector.ts`) son manuales, sin
   scheduler.
4. Decidido: OxI vive en la misma app `inversion-privada`, en tabla propia
   (`oxi_investment_promotions`, separada de `private_investment_projects`) — universos
   distintos (financiamiento vía impuestos vs. concesión/activo) aunque compartan plataforma
   VERTIX. Ver `ADR-0012`.
