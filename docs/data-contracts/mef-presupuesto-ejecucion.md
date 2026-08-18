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
