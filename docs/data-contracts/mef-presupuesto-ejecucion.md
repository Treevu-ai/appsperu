# Data contract — MEF: Presupuesto y ejecución de gasto

> Ficha técnica del conector: [`docs/conectores.md#radar-ejecucion`](../conectores.md#radar-ejecucion)

- Fuente oficial: Portal de Datos Abiertos del MEF — https://datosabiertos.mef.gob.pe/dataset/presupuesto-y-ejecucion-de-gasto
- Owner del conector: equipo App 01 (Radar de ejecución)
- Confirmado en vivo el 2026-08-16 (navegación real del portal, no supuestos).

## Estado: CONFIRMADO

El portal **no expone la API CKAN estándar** (`/api/3/action/datastore_search`) — esa URL
devuelve el shell HTML de la SPA Angular, no JSON. El acceso real es por **descarga directa de
CSV**, un archivo por año/granularidad, servido desde un host de archivos estático separado.

### Método de acceso

Descarga HTTP GET directa (no requiere autenticación ni paginación):

```
https://fs.datosabiertos.mef.gob.pe/datastorefiles/{NOMBRE_ARCHIVO}.csv
```

### Archivos disponibles (21 recursos en el dataset)

| Años | Patrón de nombre |
|---|---|
| 2009–2024 | `{AÑO}-Gasto.csv` (ej. `2024-Gasto.csv`) |
| 2025–2026 | `{AÑO}-Gasto-Mensual.csv` y `{AÑO}-Gasto-Diario.csv` (ej. `2026-Gasto-Mensual.csv`) |
| — | `Gastos_Diccionario.csv` — diccionario de datos oficial (usado para este contrato) |

Cobertura histórica: 2009 al 2026 (Gobierno Nacional, Gobiernos Regionales y Gobiernos Locales),
según la descripción del dataset. Fuente subyacente: "Consulta Amigable".

### Columnas confirmadas (64 columnas, vía `Gastos_Diccionario.csv`)

Solo las relevantes para App 01 (el archivo real tiene además desagregación funcional/programática
completa — ver el diccionario descargado para las 64 columnas):

| Columna | Tipo | Descripción |
|---|---|---|
| `ANO_EJE` | Numérico | Año de ejecución del presupuesto |
| `MES_EJE` | Numérico | Mes de ejecución (solo en variantes mensual/diario) |
| `NIVEL_GOBIERNO` | Carácter | `E` / `R` / `M` = Nacional / Regional / Local |
| `NIVEL_GOBIERNO_NOMBRE` | Carácter | Nombre del nivel de gobierno |
| `SEC_EJEC` | Carácter | Código que identifica a una entidad |
| `EJECUTORA` | Carácter | Código de cadena institucional de la entidad |
| `EJECUTORA_NOMBRE` | Carácter | Nombre de la entidad |
| `DEPARTAMENTO_EJECUTORA` | Carácter | Código de departamento de la entidad |
| `DEPARTAMENTO_EJECUTORA_NOMBRE` | Carácter | Nombre de departamento |
| `PROVINCIA_EJECUTORA` / `_NOMBRE` | Carácter | Provincia de la entidad |
| `DISTRITO_EJECUTORA` / `_NOMBRE` | Carácter | Distrito de la entidad |
| `FUNCION` | Carácter | Código de función de gasto |
| `FUNCION_NOMBRE` | Carácter | Nombre de la función |
| `MONTO_PIA` | Numérico | Presupuesto Institucional de Apertura |
| `MONTO_PIM` | Numérico | Presupuesto Institucional Modificado |
| `MONTO_DEVENGADO` | Numérico | Monto ejecutado en fase Devengado |

Nota importante: **`SEC_EJEC` identifica a la entidad, no `PLIEGO`** (el pliego es la unidad
presupuestal superior; una entidad ejecutora vive dentro de un pliego). El mapeo original del
código (`field-mapping.ts`) usaba `PLIEGO` como clave de entidad — es incorrecto y fue corregido
a `SEC_EJEC`/`EJECUTORA`.

También hay que decidir en qué nivel se agrega: el CSV viene a nivel de fila de clasificador de
gasto (específica/subespecífica), no una fila por entidad-año. La normalización debe agregar
(`SUM`) `MONTO_PIA`/`MONTO_PIM`/`MONTO_DEVENGADO` agrupando por
`(SEC_EJEC, FUNCION, ANO_EJE)` antes de insertar en `budget_execution` — insertar filas crudas
directas produciría múltiples registros por entidad/año en vez de un consolidado.

### Hallazgo crítico sobre `MONTO_PIA`/`MONTO_PIM` (confirmado en vivo 2026-08-18)

**`MONTO_PIA`/`MONTO_PIM` vienen en 0 en las filas de movimiento mensual** (`MES_EJE` 1-7 — el
año fiscal 2026 solo lleva hasta julio al momento de escribir esto). Solo `MONTO_DEVENGADO` es
real en esas filas. El presupuesto de apertura/modificado vive en filas **separadas** con
`MES_EJE = "0"` — ahí `MONTO_PIA`/`MONTO_PIM` son reales pero `MONTO_DEVENGADO` siempre es 0.

Una ingesta parcial de una sola ventana de bytes (como hacía la versión original del conector,
descargando desde el byte 0) cae en un solo `MES_EJE`, así que solo trae uno de los dos campos
— nunca ambos para las mismas filas. Esto produjo `budget_execution.pim = 0` en el 100% de las
filas ingeridas inicialmente, aunque `devengado` fuera real.

**Estructura del archivo** (confirmada escaneando `2026-Gasto-Mensual.csv`, ~6.2 GB, completo):
agrupa primero por `NIVEL_GOBIERNO_NOMBRE` (Regional → Local → Nacional), luego dentro de cada
nivel por `MES_EJE` descendente (empieza en el mes corriente, baja hasta 0), y dentro de cada
mes, por `DEPARTAMENTO_EJECUTORA_NOMBRE` en orden alfabético. Por eso una ingesta correcta y
completa para un departamento requiere **descargar por separado cada combinación (nivel de
gobierno, mes)** — 16 secciones para LA LIBERTAD (2 niveles de gobierno con entidades ahí ×
8 meses incluyendo el 0) — y recién agregar (`SUM`) sobre el conjunto combinado antes de
escribir, no upsert incremental sección por sección (eso pisaría `devengado` con el de la
última sección ingerida en vez de sumarlo).

Implementado en `ingestMefFullYearForDepartamento` (`mef-connector.ts`), con los 16 offsets de
byte observados para LA LIBERTAD como constantes documentadas (`SECTION_OFFSETS_LA_LIBERTAD`)
— son posiciones observadas, no garantizadas por el MEF; la función falla fuerte si una sección
deja de tener filas del departamento pedido, en vez de dejar `pim`/`devengado` en 0 en
silencio.

### Formato del archivo

CSV con comillas dobles, separador coma, encabezado en la primera fila (confirmado en
`Gastos_Diccionario.csv`; asumir igual para los archivos de datos — **verificar delimitador real
la primera vez que se parsee un archivo de datos**, algunos exports de "Consulta Amigable" usan
`;` en vez de `,`).

## Clasificación económica del gasto (genérica) — confirmado en vivo 2026-08-21

Vía `ADR-0006`. El mismo `Gastos_Diccionario.csv` documenta una jerarquía completa de
clasificador económico de gasto, hoy sin usar por `radar-ejecucion` (solo se lee `FUNCION`):

| Columna | Descripción (tal como aparece en el diccionario) |
|---|---|
| `TIPO_TRANSACCION` | Número que identifica si es Gasto (2) o Ingreso (1) |
| `GENERICA` | Mayor nivel de agregación de los clasificadores de gasto |
| `GENERICA_NOMBRE` | Descripción de la Genérica |
| `SUBGENERICA` | Nivel intermedio de agregación (subgenérica nivel 1) |
| `SUBGENERICA_NOMBRE` | Descripción de la subgenérica |
| `SUBGENERICA_DET` | Nivel intermedio de agregación (subgenérica nivel 2) |
| `SUBGENERICA_DET_NOMBRE` | Descripción de la subgenérica detalle |
| `ESPECIFICA` | Código de específica nivel 1 — detalle del gasto |
| `ESPECIFICA_NOMBRE` | Descripción de la específica |
| `ESPECIFICA_DET` | Código de específica nivel 2 — detalle del gasto |
| `ESPECIFICA_DET_NOMBRE` | Descripción de la específica detalle |

No confirmado aún si existe `PROGRAMA_PRESUPUESTAL`/`FUENTE_FINANCIAMIENTO` — pendiente,
relevante para identificar gasto de "Reconstrucción con Cambios" sin depender de matching de
texto sobre `EJECUTORA_NOMBRE` (ver siguiente sección y ADR-0006).

Plan de ingesta: agregar solo `GENERICA`/`GENERICA_NOMBRE` (nivel más alto, ~7-8 categorías:
personal, bienes y servicios, inversión, etc.) a `budget_execution`, sin bajar a
específica/subespecífica — sin caso de uso concreto hoy para ese nivel de detalle. Detalle
completo de la decisión y el cambio de schema en `ADR-0006`.

## Gasto de Gobierno Nacional dirigido a La Libertad (`DEPARTAMENTO_META`) — confirmado en vivo 2026-08-21

Hallazgo, vía revisión del propio código de `mef-connector.ts` (no de la fuente): la ingesta
comprensiva de año completo (`ingestMefFullYearForDepartamento`, ver más arriba) **excluye
explícitamente Gobierno Nacional** — el comentario del código dice literalmente "no hay
entidades con sede en La Libertad en ese nivel". Como consecuencia, todo el gasto que
ministerios/programas nacionales con sede en Lima ejecutan **físicamente en La Libertad**
(vía `DEPARTAMENTO_META`, no `DEPARTAMENTO_EJECUTORA`) está ausente de `budget_execution` hoy —
incluido el gasto de reconstrucción post-Niño costero/Yaku que hoy ejecuta la ANIN (Autoridad
Nacional de Infraestructura).

Investigación adicional (2026-08-21) sobre si ANIN publica una fuente propia de datos: su
Portal de Transparencia Estándar (`transparencia.gob.pe`, `id_entidad=78976`) no tiene dataset
propio de proyectos — sus dos enlaces de "Proyectos" reexportan **Invierte.pe** e **INFOBRAS**,
ya ingeridos por `radar-inversiones` e `infobras` respectivamente. No hay API ni export nuevo
que agregar por ese lado — el gap real está en `radar-ejecucion`, no en una fuente externa
faltante.

El schema ya tiene lo necesario para esto: `budget_execution.meta_departamento` (migraciones
`002_meta_departamento.sql`/`003_fix_meta_departamento_uniqueness.sql`) y el conector base
`ingestMefBudgetExecution` ya sabe filtrar por `DEPARTAMENTO_META` en una sola ventana de
bytes. Falta la versión **comprensiva** (año completo, todas las secciones de Gobierno
Nacional) — ver `ADR-0006` para la decisión y los offsets pendientes de escanear.

## Licencia / uso

Datos abiertos publicados por el MEF bajo el portal de datos abiertos del Estado peruano.
No se encontró un archivo de licencia explícito durante la verificación — documentar si aparece
al implementar el conector.

## Cautelas de la fuente (según doc "Follow the Sol", sección 2)

> "API" no significa necesariamente acceso estable, completo o idóneo para producción. Registrar
> términos de uso, frecuencia, esquema, cobertura histórica, tasa de fallas y si el método es
> API, descarga o consulta web.

Aplica directamente aquí: **no hay API**, solo descarga de archivo completo. Esto significa que
cada ingesta descarga el año completo (potencialmente grande para 2026-Gasto-Diario.csv), no un
delta — el conector debe tratar cada descarga como snapshot completo del año, igual que hace
`territory-catalog.ts` con UBIGEO.
