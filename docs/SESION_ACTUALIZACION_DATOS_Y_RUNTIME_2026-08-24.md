# Sesión — actualización de datos, runtime y verificación integral

Fecha de ejecución: 2026-08-24 (America/Lima).

## Propósito

Recuperar y verificar los servicios locales de ALSOL para un análisis integrado de
La Libertad, actualizar los cortes locales de INFOBRAS e Invierte.pe y corregir el
fallo que impedía renovar el export de INFOBRAS.

Este documento registra cambios técnicos y resultados de operación. No convierte
indicadores, costos actualizados, señales de contratación ni vacíos de evidencia en
conclusiones legales.

## Cambio de código: descarga diaria de INFOBRAS

Archivo modificado:

- `apps/infobras/api/src/ingest/infobras-connector.ts`

### Problema encontrado

El conector usaba una URL fija sin la fecha que INFOBRAS incorpora cada día en el
nombre del archivo. El endpoint antiguo respondía HTTP 200 con el JSON
`{"error":"No existe el archivo"}`. Al tratar esa respuesta como XLSX, la falla
posterior aparecía como un error de archivo truncado (`FILE_ENDED`), ocultando la
causa real.

### Corrección aplicada

1. Consulta la página pública `https://infobras.contraloria.gob.pe/InfobrasWeb/DataSets`.
2. Extrae el enlace vigente de `DataSet-Obras-Publicas <fecha>`.
3. Normaliza entidades HTML del enlace (`&amp;`).
4. Descarga el archivo publicado para esa fecha.
5. Rechaza respuestas JSON o HTML antes de intentar abrirlas como XLSX.

La descarga sigue siendo por streaming a archivo temporal y conserva los reintentos
con backoff preexistentes.

### Verificación del cambio

- `npm test` en `apps/infobras/api`: **41/41 pruebas aprobadas**.
- `npx tsc -p tsconfig.json` en `apps/infobras/api`: **correcto**.
- Dos cargas completas de INFOBRAS materializadas el 2026-08-24; cada una registró
  191,180 filas nacionales en el lote crudo.

## Actualización de INFOBRAS

Estado consultado luego de la actualización:

| Métrica | Resultado |
|---|---:|
| Lote INFOBRAS más reciente | 2026-08-24 22:51:31 UTC |
| Filas nacionales del lote | 191,180 |
| Obras de La Libertad | 10,134 |
| Obras de La Libertad con CUI | 10,134 |

Se recalculó el crosswalk INFOBRAS ↔ radar-ejecución para La Libertad:

| Resultado | Cantidad |
|---|---:|
| Entidades de ejecución consideradas | 129 |
| Entidades INFOBRAS consideradas | 164 |
| Coincidencias confirmadas | 75 |
| Coincidencias candidatas | 17 |
| Entidades INFOBRAS sin match | 72 |

Las coincidencias candidatas son insumos de revisión humana. No deben tratarse como
identidades exactas.

## Actualización de Invierte.pe

Fuente utilizada:

- `https://fs.datosabiertos.mef.gob.pe/datastorefiles/DETALLE_INVERSIONES.csv`

Metadatos verificados por `HEAD`:

| Campo | Valor |
|---|---|
| Tamaño | 246,344,022 bytes |
| Última modificación de fuente | 2026-08-23 18:31:51 GMT |
| Rango HTTP | `bytes` aceptado |
| Tipo | `text/csv` |

Se recorrieron cinco rangos consecutivos, desde el byte `0` hasta el byte
`246,344,021`, filtrando por `DEPARTAMENTO = LA LIBERTAD`:

| Rango inicial | Bytes solicitados | Filas aceptadas de La Libertad |
|---:|---:|---:|
| 0 | 52,428,800 | 1,675 |
| 52,428,800 | 52,428,800 | 1,725 |
| 104,857,600 | 52,428,800 | 1,731 |
| 157,286,400 | 52,428,800 | 1,689 |
| 209,715,200 | 36,628,822 | 1,151 |

Resultado final almacenado:

| Métrica | Resultado |
|---|---:|
| Inversiones/CUI únicos de La Libertad | 7,978 |
| Lotes locales usados | 1–6 |
| Filas rechazadas en los cinco rangos nuevos | 0 |

Cada ejecución individual conserva `isPartial: true`, porque consume un rango HTTP.
En esta corrida, sin embargo, los cinco rangos fueron contiguos y cubrieron el tamaño
completo anunciado por el servidor. Esta condición describe la cobertura de bytes de
esa descarga; no certifica por sí sola que la fuente externa represente todo el
universo administrativo posible.

## Runtime local y puertos

Se levantaron los contenedores Postgres de las apps con base propia y se iniciaron las
APIs en segundo plano. Todos los endpoints `/health` respondieron `200 OK`.

| Servicio | API | Base | Estado verificado |
|---|---:|---:|---|
| radar-ejecucion | 4000 | 5432 | OK |
| compras-publicas | 4001 | 5433 | OK |
| radar-inversiones | 4002 | 5434 | OK |
| infobras | 4003 | 5435 | OK |
| ceplan-estrategico | 4004 | 5436 | OK |
| identidad-fiscal | 4006 | 5438 | OK |
| salud-institucional | 4007 | — | OK |
| proveedores-sancionados | 4008 | 5439 | OK |
| actividad-agraria | 4009 | 5440 | OK |

El puerto `4005` permanece reservado para `ceplan-geo`, que sigue planificado y no
iniciado.

### Incidencia de runtime corregida

Los puertos 4001 y 4002 estaban ocupados por dos procesos de `compras-publicas`.
Como consecuencia, 4002 respondía salud pero servía rutas de compras, no de
`radar-inversiones`. Se identificaron los procesos por su línea de comandos, se
detuvieron solamente esas instancias de ALSOL y se iniciaron nuevamente:

- `compras-publicas` en 4001;
- `radar-inversiones` en 4002.

Luego de la corrección, ambos `/readyz` respondieron `200` con base disponible y se
validaron las rutas `/api/analytics/territorial` (4001) y `/api/investments`
(4002). No se modificaron puertos permanentes ni configuración de red.

## Límites que siguen vigentes

- La ejecución presupuestal MEF usa cortes parcialmente materializados; no equiparar
  devengado con pago, avance físico, operación o impacto.
- Los cruces por CUI y `SEC_EJEC` son exactos cuando la clave existe; los cruces por
  nombre de entidad son confirmados o candidatos y deben conservar ese estado.
- INFOBRAS representa información declarada por entidades. Avance físico o ausencia de
  un documento no prueban, respectivamente, funcionamiento o incumplimiento.
- Las contrataciones menores y las señales describen el universo materializado y son
  filtros para revisión, no determinaciones de irregularidad.
- La falta de un vínculo o registro entre bases no equivale a ausencia de la inversión,
  obra, proveedor o servicio en el mundo real.

## Estado de versionado

Al cierre de esta sesión, el cambio de código de INFOBRAS y este documento quedan
**sin commit ni push**. No se añadieron al alcance los archivos no rastreados existentes
en el directorio de trabajo.
