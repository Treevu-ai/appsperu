# Data contract — PROINVERSIÓN: Cartera VERTIX (APP, PA y OxI)

> Ficha técnica: `docs/adr/0010-research-spike-proinversion-vertix-cartera-app-pa-oxi.md`
> (investigación) y `docs/adr/0011-inversion-privada-app-standalone-y-connector-vertix.md`
> (app `inversion-privada`, connector `vertix-connector.ts`).

- Fuente oficial: Agencia de Promoción de la Inversión Privada (PROINVERSIÓN) — plataforma
  **VERTIX**, expuesta públicamente vía `https://www.investinperu.pe/` (buscador de cartera,
  dashboard y GIS). Backend autenticado en `https://vertix.proinversion.gob.pe/`.
- Owner del conector: app `inversion-privada` (`apps/inversion-privada/api`).
- **Confirmado en vivo el 2026-08-28** con `curl` contra los endpoints PHP del tema WordPress.

## Estado: PARCIALMENTE CONFIRMADO — JSON de cartera APP/PA sí; OxI y GIS pendientes

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
| `url_geo` | *(vacío en muestra)* | GIS — sin confirmar uso |
| `CodigosSubProyectos` / `CodigosSubProyectosList` | vacíos | **Sin CUI en corte completo (340/340)** |

### OxI — export XLSX (confirmado contenedor, pendiente esquema)

```http
POST /wp-content/themes/hello-elementor-child/__api/service/oxi/investmentpromotionExport.php
```

- Respuesta JSON con `Data` = XLSX en base64 (~122 KB en prueba 2026-08-28).
- Archivo ZIP/XLSX válido con `xl/worksheets/sheet1.xml`.
- **Pendiente**: leer columnas, contar filas, confirmar solapamiento con APP/PA.

### Fuentes descartadas o no aptas para conector primario

| Fuente | Motivo |
|---|---|
| `vertix.proinversion.gob.pe` | Login obligatorio (`302` → `/Account/Login`) |
| `datosabiertos.gob.pe` | Sin publisher PROINVERSIÓN; inversiones públicas son MEF |
| Boletines / anuarios PDF | Agregados, no fila por fila |
| Brochure PDF 2025-2026 | Estático, no actualizable por API |

## Implicaciones para cruces con el ecosistema

| Entidad destino | Clave disponible | Viabilidad |
|---|---|---|
| `radar-inversiones` (Invierte.pe) | CUI | **No** — VERTIX no publica CUI en el corte actual |
| `infobras` | CUI | **No** — mismo motivo |
| `radar-ejecucion` (MEF) | `SEC_EJEC` / nombre entidad | Débil — solo `Titular` como texto libre |
| `ceplan-geo` | Geometría | Pendiente — explorar `gis-vertix` |
| Análisis sectorial / territorial | `Sector`, `DepartamentoList` en filtros | Sí — filtro por dept INEI confirmado |

## Riesgos de ingesta

1. **API no oficial** — proxy PHP de WordPress, no contrato público.
2. **Paginación por defecto engañosa** — sin `PageLimit` alto solo devuelve 6 filas.
3. **Sin incremental** — cada corrida es snapshot completo (patrón aceptable en el proyecto).
4. **Medios en dominio autenticado** — thumbnails apuntan a `vertix.proinversion.gob.pe`.
5. **OxI sin validar** — no asumir paridad de esquema con APP/PA.

## Pendientes antes de ADR de app standalone

1. Documentar columnas del XLSX OxI.
2. Probar `gis-vertix` para geometría o enlace territorial por proyecto.
3. Corrida de regresión periódica (`RecordsTotal`, hash del JSON) para detectar cambios de
   esquema.
4. Decidir si una sola app `proinversion-vertix` basta para APP+PA+OxI o si OxI merece
   contrato separado.
