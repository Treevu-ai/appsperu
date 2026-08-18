# Data contract — INFOBRAS (Obras Públicas)

Investigación en vivo: 2026-08-16.

## Fuente confirmada

Portal actual (el enlace citado en el PDF original, `apps.contraloria.gob.pe/ciudadano/...`,
está muerto — redirige a una página de error ASP.NET, mismo patrón ya visto con MEF/Consulta
Amigable). El portal vigente es:

- Home: `https://infobras.contraloria.gob.pe/infobrasweb`
- Datos abiertos: `https://infobras.contraloria.gob.pe/InfobrasWeb/DataSets`

## Estrategia de acceso — Prioridad 1 confirmada (Datos Abiertos)

La sección "Datos Abiertos" existe, está vigente y expone descarga directa en XLS, sin login:

| Dataset | Descripción | Formato | Última actualización observada |
|---|---|---|---|
| **Obras Públicas** | Obras públicas reportadas por las entidades públicas en el sistema | XLS | 16-08-2026 01:00 a.m. |
| Asociaciones Público Privadas | APP reportadas por las entidades públicas | XLS | 16-08-2026 01:00 a.m. |

Ambos datasets muestran timestamp del día de la investigación → sugiere refresco diario
automatizado (a confirmar con una segunda observación en otra fecha).

El enlace de descarga (`Descargar`) es un `<a>` con href server-side que el navegador bloqueó
inspeccionar vía JS (contiene query string/cookie de sesión) — normal para este tipo de portal.
No se ha descargado el archivo todavía: se requiere permiso explícito del usuario antes de
descargar cualquier archivo (regla de gobernanza de la sesión).

## Descarga confirmada (2026-08-16, 22:04)

- **Endpoint real:** `GET https://infobras.contraloria.gob.pe/InfobrasWeb/Archivo/DownloadFile?filename=DataSet-Obras-Publicas%2016-08-2026&name=...&contentType=application/vnd.openxmlformats-officedocument.spreadsheetml.sheet&extension=.xlsx`
  (a pesar de que la UI dice "XLS", el archivo real es `.xlsx`).
- **Primer intento falló con HTTP 503** a mitad de transferencia (~45MB de un archivo de 57MB) —
  el servidor es inestable bajo archivos grandes. Segundo intento completó sin problema.
  **Implicación para el conector:** implementar retry con backoff; no asumir que un 503 es
  definitivo.
- **Tamaño final:** 57.4 MB (`.xlsx`, un solo sheet, sin `sharedStrings.xml` — todas las celdas
  son inline strings `t="str"`, incluso los números).
- **191,180 filas de datos** (191,184 filas totales − 3 filas de título − 1 fila de encabezado).
  Orden de magnitud consistente con las "128,794 obras registradas" que muestra el home (esa
  cifra probablemente cuenta obras únicas activas; este dataset incluye histórico/saldos).

## Schema real confirmado — 97 columnas

Confirmado por índice contra una fila real (Hospital Chancay, UE405) y una segunda fila de
La Libertad (Proyecto Especial Chavimochic). Columnas clave por bloque:

**Identificación**
- `codigo Entidad` (ej. `4338`, `0608`) — código de entidad ejecutora propio de INFOBRAS.
  **No coincide en formato con `SEC_EJEC` de MEF** (SEC_EJEC son códigos más largos) — el
  cruce con `radar-ejecucion`/`radar-inversiones` NO puede ser por este campo directo; probable
  que haya que cruzar por nombre de entidad (mismo patrón fuzzy-match ya usado en
  compras-publicas) o buscar un campo alterno.
- `Código INFOBRAS` — id propio de la obra dentro de INFOBRAS.
- **`Codigo unico de inversión` (CUI) — viene DIRECTO**, sin necesidad de inferencia. Esto
  **contradice la premisa del PRD** de que hace falta "resolución de CUI con niveles de
  confianza" — con el CUI directo, el cruce con `radar-inversiones` (que también tiene CUI vía
  `CODIGO_UNICO` en el archivo de Invierte.pe) puede ser un JOIN exacto, igual que el crossref
  SEC_EJEC ya construido en App02. Simplifica bastante el alcance del PRD.
- `Código SNIP` (legacy, presente igual).

**Ubicación**: `Departamento`/`Provincia`/`Distrito` como nombres (sin ubigeo, igual que el
resto de fuentes MEF ya integradas).

**Señales del PRD — todas están directamente en el dataset, no hay que calcularlas desde cero:**
- Cost Drift: `Monto Viable/Aprobado` vs `Costo Actualizado de la inversión`.
- Physical-Financial Gap: `Avance Físico Programado/Real Acumulado (%)` vs
  `Monto de valorización Programado/Ejecutado Acumulado` y `Porcentaje de ejecución financiera`.
- Paralización: `Existe Paralización` (Sí/No) + `Causal de paralización` + `Fecha de
  paralización` + `Número de dias paralizado` — **la entidad ya reporta esto explícitamente**,
  no es una señal inferida, es un campo declarado. Reduce el trabajo de cómputo pero también
  significa que su confiabilidad depende 100% de que la entidad lo haya registrado (honestidad
  radical: hay que exponer cuántas obras "En Ejecución" tienen este campo vacío/no declarado).

**Anomalía de formato — IMPORTANTE para el normalizador:**
Los campos monetarios usan **espacio en vez de punto/coma decimal**: `"1205287 56"` en vez de
`1205287.56` o `1,205,287.56`. Confirmado en `Costo de obra según Expediente técnico`,
`Costo de obra en soles según ET en soles`, `Monto del contrato en soles`. El parser debe
tratar el último grupo de 1-2 dígitos tras el espacio final como centavos, con guardas para
campos vacíos y para valores que no siguen el patrón (rechazar, no adivinar).

## Muestra real de La Libertad (2026-08-16, escaneo completo de las 191,180 filas)

- **10,141 obras** registradas con `Departamento = LA LIBERTAD`.
- **252 obras (2.5%) con `Existe Paralización = SI`** — señal con densidad baja pero real, no
  ruido; suficiente para ser útil sin ser abrumadora.
- **8,241 obras (81.3%) con `Avance Físico Real Acumulado (%)` y `Porcentaje de ejecución
  financiera` NO vacíos** — buena cobertura para el Gap físico-financiero; el 19% restante no
  reportó avance (probablemente obras muy nuevas, muy antiguas/cerradas, o con datos
  incompletos — a filtrar explícitamente, no imputar).
- **`codigo Entidad` de muestra real (La Libertad):** `2051, 4822, 0424, 2061, 0222, 2050,
  0251, 6352, 2077, 0419, 0423, 2052, 2057, 0608, 4812` — todos códigos cortos (4 dígitos).
  **Confirma que NO cruzan directo con `SEC_EJEC` de MEF** (que usa un espacio de códigos más
  largo). El cruce con `radar-ejecucion`/`radar-inversiones` deberá ser por nombre de entidad
  vía el mismo matcher difuso (`matchEntities`, con niveles "confirmada"/"candidata") ya
  construido y probado en `compras-publicas/src/crossref/match.ts` — no hay que reinventarlo,
  solo reutilizar el patrón. El CUI directo sigue siendo válido para cruzar con
  `radar-inversiones` (que también tiene CUI vía `CODIGO_UNICO`).

## Pendiente para cerrar Sprint 0 (Source Discovery)

1. ~~Descargar y confirmar schema~~ — HECHO.
2. ~~Verificar si `codigo Entidad` calza con SEC_EJEC~~ — HECHO, no calza; cruce por nombre.
3. ~~Confirmar tasa de campos vacíos en avance/paralización~~ — HECHO, cobertura suficiente
   (81% avance, 2.5% paralización activa).
4. Prioridad 3 (API interna del buscador) no investigada — no es necesaria, Prioridad 1 (datos
   abiertos) ya cubre el caso de uso completo.
5. Con esto, Sprint 0 queda cerrado. Entrar a `/plan` para el conector INFOBRAS (parser XLSX en
   streaming — el archivo es demasiado grande para cargarlo completo en memoria con una
   librería XLSX estándar; hay que parsear `sheet1.xml` como stream de eventos por regex/SAX,
   igual que este script de investigación, en vez de `xlsx`/`exceljs` que cargan todo a RAM).

## Implementación (App 04 — 2026-08-16)

Construida como app standalone `apps/infobras/{api,web}` (API puerto 4003, web puerto 3003,
Postgres puerto 5435), mismo patrón que las otras 3 apps.

**Bug real encontrado y corregido en el parseo**: el plan original proponía usar `exceljs`'s
`WorkbookReader` (streaming estándar) para parsear el XLSX sin cargarlo completo en memoria.
En la práctica devolvió **0 filas** contra el archivo real. Causa raíz: el XML interno de este
export de INFOBRAS usa el prefijo de namespace `x:` en cada etiqueta (`<x:row>`, `<x:c>`,
`<x:v>`) en vez del namespace por defecto sin prefijo que `exceljs` espera (`<row>`, `<c>`,
`<v>`) — un export no estándar. Se reemplazó por un parser streaming propio (regex sobre el
XML crudo extraído del zip vía `unzipper`, sin escribir el archivo descomprimido a disco),
el mismo enfoque ya validado en el script de investigación de Sprint 0. Cada `<x:c>` se emite
siempre en su posición aunque esté vacío (sin atributo `r=`), así que el mapeo por índice de
columna es seguro.

**Segundo bug real encontrado en la ingesta**: al menos un campo de porcentaje del dataset real
excede el rango `NUMERIC(5,2)` (`[-999.99, 999.99]`) — probable error de tipeo de alguna
entidad al reportar avance. Se amplió a `NUMERIC(8,2)` (migración `002_widen_pct_precision.sql`)
en vez de rechazar la fila completa por un solo campo fuera de rango razonable.

**Resultado de la ingesta real** (filtrada a La Libertad): 191,180 filas nacionales escaneadas,
**10,134 obras aceptadas + 7 rechazadas = 10,141** — coincide exactamente con el conteo de la
investigación de Sprint 0. De las aceptadas: 252 con `Existe Paralización = SI` (2.49%), 8,238
con avance físico/financiero reportado (81.3%) — ambas cifras confirman lo estimado en Sprint 0.

**Cruce con `radar-inversiones` — se hizo por CUI, no por nombre.** La hipótesis original de
este documento (cruzar por nombre de entidad con el matcher difuso de compras-publicas) quedó
descartada a favor de una opción más fuerte: INFOBRAS trae CUI directo y `radar-inversiones`
también (`investments.cui`, de Invierte.pe) — match exacto por ID, mismo patrón que el cruce
SEC_EJEC de App02, sin fuzzy matching. Implementado en `GET /api/crossref` de `infobras/api`.
Resultado real: de 8,574 CUIs con obras en La Libertad, 567 (6.6%) tienen match en
`radar-inversiones` — tasa baja pero esperada, porque esa app solo ingirió una muestra parcial
de Invierte.pe (1,612 inversiones), no el universo completo; un CUI sin match no implica que
la inversión no exista. El cruce por nombre con `radar-ejecucion` (MEF) queda pendiente, sin
iniciar.
