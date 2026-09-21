# Data contract — Inhabilitaciones por mandato judicial vigentes [OECE]

> Ficha técnica del conector: [`docs/conectores.md#proveedores-sancionados`](../conectores.md#proveedores-sancionados)

Investigación en vivo: 2026-09-20.

## Por qué esta fuente y en qué se diferencia de `inhabilitaciones`/`multas`

`proveedores-sancionados` ya cubre sanciones **administrativas** del Tribunal de Contrataciones
del Estado (tablas `inhabilitaciones`/`multas`, migración 001). Este dataset es distinto en su
base legal: son inhabilitaciones dictadas por el **Poder Judicial** (orden judicial, no sanción
de contrataciones), comunicadas a OSCE/OECE únicamente para su registro en el RNP y así impedir
que la persona/empresa contrate con el Estado mientras la orden esté vigente.

## Fuente — acceso no estándar para el catálogo

A diferencia del resto de datasets de `datosabiertos.gob.pe`, este **no resuelve vía CKAN
`package_show`**:

- Página del dataset: `https://www.datosabiertos.gob.pe/dataset/inhabilitaciones-por-mandato-judicial-vigentes-organismo-especializado-para-las`
  (publicador OECE — el slug original de OSCE, `...-organismo-supervisor-de-las-contrataciones-0`,
  también existe pero redirige/duplica al mismo contenido). `package_search`/`package_show` de la
  API CKAN de este portal devuelven 404 para búsquedas de texto libre — hay que resolver el slug
  navegando `/search/data?query=...` (confirmado en vivo, mismo patrón de limitación ya
  documentado para el dataset de `poder-judicial`).
- El recurso "CSV" que declara la ficha CKAN **no es un archivo descargable directo** — es un
  enlace a una página de Confluence de OSCE:
  `https://osce-gob-pe.atlassian.net/wiki/spaces/PNDA/pages/106889261/Inhabilitaciones+por+mandato+judicial+vigentes`.
  Esa página es solo un índice/metadata; el CSV real vive como **adjunto** de esa página.
- Resolución del archivo real, sin autenticación, confirmada en vivo:
  1. `GET https://osce-gob-pe.atlassian.net/wiki/rest/api/content/106889261/child/attachment` —
     API REST pública de Confluence, lista los adjuntos de la página (9 archivos, no solo el
     CSV de inhabilitaciones judiciales — el mismo espacio también hospeda `sancionados.csv`,
     `Socios.csv`, `representantes.csv`, `organos.csv`, etc., que corresponden a otros datasets
     ya cubiertos por `sanciones-connector.ts` e `identidad-fiscal`/OECE ficha — no se tocan
     acá). Cada resultado trae `title` y `_links.download`.
  2. Se busca el adjunto por `title === "inhabilitaciones_judiciales.csv"` exacto — **nunca por
     posición en el array**, el orden no está garantizado.
  3. `GET {base}{_links.download}` → Confluence responde **302** hacia una URL firmada y
     temporal de `api.media.atlassian.com` (token JWT con expiración, confirmado en el propio
     token: claims `exp`/`nbf`). Esa URL final **no se puede hardcodear** en ningún lado — se
     resuelve de nuevo en cada corrida. `fetch()` de Node sigue el redirect solo (comportamiento
     default), el conector no necesita manejarlo a mano.
- **Encoding Latin-1** — confirmado en vivo byte a byte (`0xC1` crudo para "Á", no la secuencia
  UTF-8 `0xC3 0x81`): mismo defecto de fuente ya encontrado y corregido en `sanciones-connector.ts`
  (RNP, 2026-08-20). Nombres reales verificados: "REATEGUI VÁSQUEZ", "JOSÉ ANTONIO CORONADO
  HURTADO" — llegan corruptos (`REATEGUI V�SQUEZ`) si se decodifica como UTF-8.
- Metadata de la ficha CKAN dice última actualización "17 de junio de 2026", pero la propia
  página de Confluence muestra "01/09/2026" — la ficha del portal está desactualizada, la
  actualización mensual real sí está vigente (corte real de la corrida: 2026-09-01).

## Schema real confirmado — 7 columnas, separadas por `|`

```
FECHA_CORTE|RUC_DNI|NOMBRE_RAZONODENOMINACIONSOCIAL|ORGANO_JURISDICCIONAL|NUMERO_RESOLUCION|FECHA_INICIO|FECHA_FIN
```

- `FECHA_CORTE`/`FECHA_INICIO`/`FECHA_FIN` vienen como `YYYYMMDD` (ej. `20260901`) — distinto al
  resto del catálogo de esta app (`inhabilitaciones`/`multas` usan `DD/MM/YYYY`). Se valida como
  fecha calendario real con round-trip contra `Date.UTC` (rechaza `20240231`), mismo patrón que
  `parseFechaDDMMYYYY` de `cenares-parse.ts` (servicios-salud, CT-10/2026-09-19).
- `RUC_DNI` mezcla formatos reales, confirmado en las 15 filas del corte 2026-09-01:
  - RUC-10 (persona natural, 11 dígitos, prefijo `10`) — 12 de 15 filas.
  - RUC-20 (empresa, 11 dígitos, prefijo `20`) — 1 fila (`ROCA INGENIERIA DE LA CONSTRUCCION
    SAC`), pese a que la descripción del dataset dice "personas naturales".
  - 10 dígitos sin prefijo reconocible — 1 fila (`JOSÉ ANTONIO CORONADO HURTADO`,
    `1010900768`), anomalía real de la fuente, no un error de parseo. Se guarda tal cual.
- Se preserva el valor crudo de `RUC_DNI` sin forzar ningún formato; `dni` (columna generada en
  Postgres) solo se deriva cuando calza exactamente el patrón RUC-10 (`left(ruc_dni,2)='10' AND
  length(ruc_dni)=11`) — mismo criterio que `inhabilitaciones.dni` (migración 002). Para RUC-20 y
  el caso de 10 dígitos, `dni` queda `NULL`.

## Clave natural — verificada en vivo contra las 15 filas reales (2026-09-20)

`(ruc_dni, numero_resolucion, fecha_inicio)` — sin colisiones en la muestra real. No se puede
usar `(ruc_dni, numero_resolucion)` solo: en teoría la misma resolución podría reaplicarse con un
nuevo periodo, aunque no se observó ese caso en esta corrida.

## Verificado en vivo (2026-09-20, corte de la fuente 2026-09-01)

**14/15 filas aceptadas, 1 rechazada.** La fila rechazada (`CHOQUE QUISPE YIMMY RICHARD`, RUC
`10403004516`) trae `FECHA_INICIO=20271218` posterior a `FECHA_FIN=20231218` — invertidas en la
fuente real. No se intentó "corregir" intercambiando los valores (sería adivinar cuál de las dos
fechas es la correcta); se rechaza y se cuenta en `inhabilitaciones_judiciales_rejected`.

Segunda corrida contra la misma fuente, sin cambios: 14/15 otra vez, mismo `batchId` de fila por
fila actualizada (no duplicada) — confirma que el upsert por la clave natural es idempotente.

## Pendiente / fuera de alcance de este contrato

1. **Sin cruce implementado contra `inhabilitaciones`/`multas`** (Tribunal de Contrataciones, la
   otra fuente de esta misma app) — candidato natural para saber si un mismo RUC/DNI tiene
   inhabilitación administrativa y judicial simultáneas. No investigado en esta sesión.
2. **Universo pequeño (15 filas al corte 2026-09-01)** — no se investigó si existe un histórico
   más amplio en algún otro adjunto del mismo espacio de Confluence (el listado de attachments
   trae 9 archivos en total, 8 de ellos fuera del alcance de este contrato).
3. **Dependencia de una API no documentada como pública**: la API REST de Confluence usada acá es
   la interfaz estándar del producto (no un endpoint hecho a medida por OSCE), pero no hay
   garantía contractual de que el espacio `PNDA` siga siendo accesible sin autenticación ni de
   que el `pageId`/nombre del attachment no cambien — el conector falla con un error accionable
   (`No se encontró el attachment "..."`) si el archivo se renombra, en vez de asumir el
   primero de la lista.
