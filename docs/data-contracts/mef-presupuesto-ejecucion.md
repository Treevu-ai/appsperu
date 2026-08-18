# Data contract — MEF: Presupuesto y ejecución de gasto

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
