# Data contract — PRODUCE (Directorio Nacional de Cooperativas)

> Ficha técnica del conector: [`docs/conectores.md#identidad-fiscal`](../conectores.md#identidad-fiscal)

Investigación en vivo: 2026-09-18.

## Fuente confirmada

- **Endpoint AJAX real (sin autenticación, sin API key):**
  `https://directoriocoop.produce.gob.pe/ajax/busqueda_ajax.php`
- Página de referencia (formulario que lo consume): `https://directoriocoop.produce.gob.pe/directorio-cooperativa.php`,
  enlazada desde `produce.gob.pe/index.php/cooperativas/directorio-nacional-de-cooperativas`.
- Backend DataTables 1.9 server-side (`sEcho`/`iTotalRecords`/`iTotalDisplayRecords`/`aaData`).
- No es un dataset descargable — es un servicio de búsqueda paginado; el conector reconstruye el
  universo paginando con `iDisplayStart`/`iDisplayLength`.

## Endpoint descartado — `directorio-cooperativas-2017.php`

El mismo sitio expone un segundo endpoint (`ajax/directorio-cooperativas-2017.php`) con más
registros totales (1,245 vs. 837) y mejor desglose geográfico (distrito/provincia/departamento en
columnas separadas, en vez de un string libre), pero **ignora el parámetro `actividad`** —
confirmado en vivo: `actividad=1` devuelve `"iTotalDisplayRecords":null, "aaData":[]`. Sin ese
filtro server-side no hay forma confiable de acotar al sector agropecuario sin traer el universo
completo y filtrar por texto (menos preciso). Se decidió **no ingerir este endpoint** — decisión
explícita del usuario del proyecto, no una limitación técnica descubierta después de construir.

## Parámetros del endpoint usado

| Parámetro | Significado | Valor usado |
|---|---|---|
| `region` | Filtro por departamento (nombre en mayúsculas, ej. `LIMA`) | `0` (sin filtro) |
| `actividad` | Sector económico (CIIU agregado) | `1` = AGRICULTURA, GANADERÍA, SILVICULTURA Y PESCA (default del conector) |
| `tipo` | Tipo de cooperativa | `0` (sin filtro) |
| `modalidad` | Modalidad | `0` (sin filtro) |
| `sSearch` | Búsqueda libre (no usada por el conector — se prefiere traer el universo completo de `actividad=1` y filtrar localmente, más confiable que depender de que el nombre contenga el cultivo) | — |
| `iDisplayStart` / `iDisplayLength` | Paginación DataTables | streaming interno, páginas de 500 |

Con `actividad=1`: **139 cooperativas** (confirmado en vivo, 2026-09-18). Universo completo del
endpoint (`actividad=0`): 837.

## Schema real confirmado — 9 columnas en `aaData`

Las columnas **no** están documentadas en el propio endpoint AJAX (responde solo arrays
posicionales). Se confirmaron capturando la respuesta HTML de `busqueda.php` (el POST que la
página dispara antes de cargar la tabla), que sí trae un `<thead>` con las etiquetas reales:

```
RUC | RAZON SOCIAL | REPRESENTANTE | DIRECCION | UBIGEO | SOCIOS | TELEFONO | CORREO | (MAPA/+INFO)
```

- **Columna 4, "UBIGEO"**: la etiqueta de la fuente es engañosa — el valor real es un string libre
  `"DEPARTAMENTO-PROVINCIA-DISTRITO"` (ej. `"LIMA-LIMA-COMAS"`), **no** un código ubigeo INEI de 6
  dígitos como el que usa `contribuyentes.ubigeo` (del padrón SUNAT) o `territories.ubigeo`. Se
  guarda como `ubicacion_texto`, sin renombrarlo a algo que implique que es un código real.
- **Columna 5, "SOCIOS"**: número de socios/miembros de la cooperativa — dato que no estaba
  documentado en ningún lugar visible de la UI (la columna es invisible en la tabla renderizada al
  usuario; solo se confirmó vía el `<thead>` crudo de `busqueda.php`). Único campo de "tamaño" de
  la cooperativa disponible en esta fuente.
- **Columna 2, "REPRESENTANTE"**: texto libre `", GERENTE: APELLIDOS, Nombres, PRESIDENTE:
  APELLIDOS, Nombres"` — se limpia la coma inicial pero no se parte en campos individuales (no hay
  separador fiable entre nombre y cargo sin arriesgar un corte incorrecto).
- **Columna 8** (índice 8, no listada en el `<thead>` de 7 columnas visibles): enlace HTML de
  acción (`popup_print(RUC)`) — se descarta, no aporta dato.
- `TELEFONO`/`CORREO`: vienen vacíos como espacio en blanco (`" "`) en algunos registros, no como
  `"-"` — el normalizador trata ambos como `NULL`.

## Anomalía real encontrada — mojibake en `REPRESENTANTE`, ya corrompido en el origen

Confirmado en vivo (2026-09-18) con la Cooperativa Agraria Cacaotera ACOPAGRO (RUC
`20404057805`): el campo `representante` trae el apellido "NÚÑEZ" con **hasta 3 generaciones de
corrupción UTF-8↔Latin1 encadenada** (`NUÃÆÃÂÃÂ Ã¢Â¬Â¢...EZ`), probablemente por reprocesos
previos del propio sistema de PRODUCE. Es un caso aislado — de una muestra de 8 registros
aleatorios con tildes/ñ, 7 decodificaron perfecto y solo 1 (`MUÑOZ` → `MUÃOZ`, corrupción de
una sola generación) mostró el problema.

**Diagnóstico descartado**: no es un problema de decodificación en el conector. El header HTTP
declara `charset=ISO-8859-1`, pero el payload JSON en sí son bytes ASCII-safe (PHP `json_encode`
escapa todo no-ASCII como `\uXXXX`) — decodificar como Latin-1 o UTF-8 da exactamente el mismo
resultado (verificado probando ambos). `razon_social`, `direccion` y `ubicacion_texto` decodifican
correctamente en los mismos registros donde `representante` viene corrupto — la corrupción está
en el dato guardado en la base de PRODUCE, no en el transporte.

**Decisión**: no se intenta "reparar" el mojibake — no hay forma de distinguir de forma genérica
cuántas generaciones de corrupción tiene un valor dado sin arriesgar corromper registros que ya
están limpios. Se guarda `representante` tal cual llega. Cualquier vista pública que use este
campo debe tratarlo como potencialmente ilegible para un subconjunto pequeño de registros.

## Cruce validado — RUC contra `contribuyentes` (SUNAT), misma base

A diferencia del padrón SUNAT (que vive en la misma app `identidad-fiscal`), este cruce **no
necesita un segundo pool de conexión** — `cooperativas` y `contribuyentes` están en la misma base,
el `JOIN` es directo por `ruc`. Verificado en vivo tras ingestar las 139 cooperativas de
`actividad=1`: **139/139 (100%) cruzan** contra `contribuyentes` — el padrón SUNAT ya ingerido
(RUC-20) cubre el universo completo de cooperativas agropecuarias del directorio de PRODUCE en
este entorno.

## Pendiente / fuera de alcance de este conector

1. No se ingiere `directorio-cooperativas-2017.php` — decisión explícita, ver arriba.
2. No se filtra por cultivo (café/cacao/banano/mango) en la ingesta — se trae el universo completo
   de `actividad=1` y el filtro por cultivo se hace en `GET /api/cooperativas?cultivo=...` (ILIKE
   sobre `razon_social`), porque PRODUCE no expone una columna de tipo de cultivo por cooperativa
   y clasificar cada fila por keyword-matching en la ingesta sería inventar una categoría que la
   fuente no da.
3. No se investigó el botón "+INFO" (`popup_print(RUC)`) — la función JS que debería abrirlo no
   está resuelta en el HTML servido (posible vestigio roto), así que no se confirmó si existe una
   vista de detalle con más campos por cooperativa.
