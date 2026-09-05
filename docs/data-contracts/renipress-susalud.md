# Data contract — RENIPRESS: Registro Nacional de IPRESS (SUSALUD)

> Ficha técnica: `docs/adr/0018-research-spike-pnda-educacion-salud-social.md` (spike + addendum
> de verificación en vivo, 2026-09-05) y `docs/PRD_Servicios_Salud_Programas_Sociales_v1.md`
> (ticket SS-01, implementado).

- Fuente oficial: Superintendencia Nacional de Salud (SUSALUD) — dataset publicado en la
  Plataforma Nacional de Datos Abiertos, `https://www.datosabiertos.gob.pe`.
- Dataset (slug CKAN): `registro-nacional-de-entidades-prestadoras-de-servicios-de-salud-renipress`.
- Owner del conector: app `servicios-salud` (`src/ingest/renipress-connector.ts`).

## Estado: CONFIRMADO — conector construido y probado (SS-01, 2026-09-05)

### Por qué esta fuente y no `minsa-ipress`

El PRD original (`docs/PRD_EXPANSION_PNDA.md`) asumía el dataset `minsa-ipress` como fuente de
IPRESS. Verificado en vivo: ese dataset trae un único recurso de **2017**, desactualizado — 20,819
registros. El dataset correcto y activamente mantenido es este (`registro-nacional-de-entidades-...-renipress`),
con recursos CSV mensuales confirmados hasta agosto 2026 (36,004 registros, 26,901 con
`ESTADO = ACTIVO`, verificado en vivo el 2026-09-05).

### Resolución del recurso — no hardcodear el nombre de archivo

El nombre del archivo cambia cada corte (`RENIPRESS_{dd-mm-aaaa}.csv`, ej.
`RENIPRESS_31-08-2026.csv`) y el dataset no garantiza que el catálogo devuelva sus recursos
ordenados por fecha. El conector resuelve el recurso más reciente en tiempo de ejecución vía
`package_show` (`GET /api/3/action/package_show?id=<slug>`), extrae la fecha del nombre de cada
recurso CSV con una expresión regular, y elige el más reciente — ver
`src/ingest/renipress-parse.ts` (`pickLatestRenipressResource`, `extractDateFromRenipressUrl`).

### User-Agent obligatorio

El WAF (CloudWAF) de `datosabiertos.gob.pe` devuelve **HTTP 418** ante el user-agent por defecto
de `fetch`/`curl` — confirmado en vivo durante el spike. Tanto la llamada a `package_show` como
la descarga del CSV usan un header `User-Agent` de navegador real. Sin este header, la falla no
es un error de red obvio, es un 418 silencioso.

### Formato del archivo

- Delimitador `;`.
- Encoding **UTF-8 con BOM** (a diferencia de INFOMIDIS/MIDIS, que es Latin-1 — ver
  `infomidis-cobertura-social.md`).
- 31 columnas confirmadas en el header real:

```
INSTITUCION;COD_IPRESS;NOMBRE;CLASIFICACION;TIPO_ESTABLECIMIENTO;DEPARTAMENTO;PROVINCIA;
DISTRITO;UBIGEO;DIRECCION;CO_DISA;COD_RED;COD_MICRORRED;DISA;RED;MICRORED;COD_UE;
UNIDAD_EJECUTORA;CATEGORIA;TELEFONO;HORARIO;INICIO_ACTIVIDAD;ESTADO;NORTE;ESTE;
IMAGEN_1;FE_ACT_IMAGEN_1;IMAGEN_2;FE_ACT_IMAGEN_2;IMAGEN_3;FE_ACT_IMAGEN_3
```

Columnas ingeridas en `ipress` (el resto se descarta — no aportan al caso de uso de este
proyecto): `institucion`, `cod_ipress` (clave), `nombre`, `clasificacion`,
`tipo_establecimiento`, `departamento`, `provincia`, `distrito`, `ubigeo`, `direccion`,
`categoria`, `estado`, `norte`, `este`.

### `estado`: se guarda tal cual, sin normalizar a booleano

El valor confirmado más frecuente es `ACTIVO` (26,901 de 36,004 filas en el corte de agosto
2026), pero el conector no asume que esos son los únicos dos valores posibles (activo/no
activo) — guarda el texto real del CSV. Cualquier lectura que necesite un booleano debe
filtrar explícitamente por el valor de texto esperado, no asumir un enum cerrado no verificado.

### `NORTE`/`ESTE`: coordenadas decimales, no UTM

Pese al nombre, los valores confirmados (ej. `-11.8671856` / `-69.13774377`) son coordenadas
decimales (latitud/longitud), no coordenadas UTM como el nombre podría sugerir.

### Filas sin `COD_IPRESS` o sin `UBIGEO`

`COD_IPRESS` es la clave primaria de `ipress` — una fila sin este campo se descarta y se cuenta
en `filasSinCodIpress` del resumen de ingesta, no se inserta con una clave sintética. Una fila
sin `UBIGEO` sí se inserta (el establecimiento existe), pero se cuenta en `filasSinUbigeo` — el
cruce por distrito (SS-02) no podrá usarla.

## Cautelas

- El conteo total de establecimientos (36,004 en agosto 2026) es mayor al que citaba el ADR-0018
  original (23,656, tomado de un snippet de búsqueda) — el conteo real confirmado por descarga
  directa es la fuente de verdad, no la cifra citada en la investigación preliminar.
- No confirmado en este ticket: si `CATEGORIA` (`I-1`, `I-2`, etc.) tiene un catálogo cerrado de
  valores documentado en algún diccionario de datos oficial — se guarda tal cual viene.
