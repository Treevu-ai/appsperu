# Data contract — INFOMIDIS: Cobertura de programas sociales (MIDIS)

> Ficha técnica: `docs/adr/0018-research-spike-pnda-educacion-salud-social.md` (spike + addendum
> de verificación en vivo, 2026-09-05) y `docs/PRD_Servicios_Salud_Programas_Sociales_v1.md`
> (ticket PS-01, implementado).

- Fuente oficial: Ministerio de Desarrollo e Inclusión Social (MIDIS) — dataset publicado en la
  Plataforma Nacional de Datos Abiertos, `https://www.datosabiertos.gob.pe`.
- Dataset (slug CKAN): `cobertura-de-los-programas-sociales-adscritos-al-midis-ministerio-de-desarrollo-e-inclusión`.
- Owner del conector: app `programas-sociales` (`src/ingest/infomidis-connector.ts`).

## Estado: CONFIRMADO — conector construido y probado (PS-01, 2026-09-05)

### Por qué esta fuente reemplaza el plan original (JUNTOS + Pensión 65 por separado)

El PRD original (`docs/PRD_EXPANSION_PNDA.md`) y el ADR-0018 sin addendum asumían que Pensión 65
solo se publicaba a nivel de usuario individual — lo que forzaba una decisión de producto sobre
manejo de PII antes de poder usarlo. **INFOMIDIS ya publica un conteo agregado de usuarios de
Pensión 65 por distrito** (columna `PENSION 65 - Usuarios`), junto con JUNTOS, QALI WARMA,
FONCODES, CUNAMÁS, CONTIGO y PAIS/Tambos, todo en un único CSV mensual. Esa decisión de producto
ya no es necesaria: se usa el agregado oficial de MIDIS, no un cálculo propio.

### Resolución del recurso — por `created`, no por nombre de archivo

A diferencia de RENIPRESS, el nombre de archivo de este dataset **no sigue ningún patrón
consistente** — confirmado en vivo revisando los ~29 recursos del dataset:
`202408_INFOMIDIS.csv`, `OCTUBRE_2024.csv`, `MARZO2025_1.csv`, `202506.csv`, `NOVIEMBRE%202024.csv`
(espacio en la URL), entre otros. El catálogo además trae **duplicados exactos del mismo mes**
(dos recursos "ENERO 2025", dos "JULIO 2025") y al menos un recurso con `format: "data"` y **URL
vacía** ("ABRIL 2025"). Ninguna de estas inconsistencias es un error de esta implementación —
son del propio dataset.

Por eso el conector resuelve el recurso más reciente por el timestamp `created` que devuelve
`package_show` (formato Drupal `MM/DD/YYYY - HH:MM`, ej. `Vie, 05/15/2026 - 14:47`), no por el
nombre del archivo — ver `pickLatestInfomidisResource`/`parseCkanDrupalDate` en
`src/ingest/infomidis-parse.ts`. Se descartan recursos sin `url` o cuyo `format` no sea CSV
(normalizando `.csv` con punto inicial, confirmado en varios recursos de 2026).

**Caveat de rezago de publicación**: `created` refleja cuándo MIDIS subió el archivo al portal,
no el mes que reporta — confirmado un rezago de ~4 meses entre el mes reportado (abril 2026) y su
fecha de publicación (agosto 2026). El corte más reciente disponible no es necesariamente el mes
calendario más reciente.

### User-Agent obligatorio

Mismo WAF, mismo requisito que RENIPRESS (ver `renipress-susalud.md`) — confirmado en vivo.

### Formato del archivo

- Delimitador `;`.
- Encoding **Latin-1** (a diferencia de RENIPRESS, que es UTF-8 con BOM) — confirmado: sin este
  encoding, caracteres como `Acompañamiento`/`Niños`/`N°` se corrompen.
- Columnas confirmadas (18 en el corte de agosto 2024): `FECHA_CORTE` (formato `YYYYMMDD`, ej.
  `20241031`), `UBIGEO`, y una columna por programa: `CUNAMAS - Cuidado Diurno`,
  `CUNAMAS - Acompañamiento de Familias`, `JUNTOS - Hogares afiliados`,
  `JUNTOS - Hogares abonados`, `FONCODES - N° usuarios estimados`, `FONCODES - N° proy.
  Culminados`, `FONCODES - N° proy. en ejecucion`, `FONCODES - N° Hog. Haku Winay -proyectos en
  ejecucion`, `FONCODES - N° Hog. Haku Winay -proyectos culminados`, `PENSION 65 - Usuarios`,
  `QALI WARMA - N° de Niños y niñas atendidos`, `QALI WARMA - N° de IIEE`, `CONTIGO - Usuarios`,
  `PAIS - N° de Tambos prestando servicios`, `PAIS - N° de Atenciones realizadas a través de los
  Tambos`, `PAIS - N° de Beneficiarios atendidos a través de los Tambos`.

### Búsqueda de columnas por palabra clave, no por nombre exacto

El PRD documenta como riesgo explícito que el esquema de columnas puede variar levemente entre
cortes. El conector no indexa por nombre exacto de columna — normaliza cada encabezado (sin
tildes/ñ/°, mayúsculas, espacios colapsados) y busca por un conjunto de palabras clave
(`findColumnValue`/`findColumnValueAny` en `infomidis-parse.ts`). Si ninguna alternativa calza en
un corte, esa fila inserta `NULL` para ese campo y el nombre del campo se reporta en
`columnasFaltantes` del resumen de ingesta — no se aborta la ingesta completa por una columna
faltante.

**Confirmado en vivo (2026-09-05), no hipotético**: al correr la ingesta real por primera vez
contra el recurso `ABRIL_2026.csv`, el conector reportó `columnasFaltantes: ["qaliwarmaNinos",
"qaliwarmaIiee"]`. La causa real: MIDIS renombró el programa **"QALI WARMA" a "WASI MIKUNA"**
entre el corte de 2024-08 (donde se diseñaron los tokens originales) y el de 2026-04. Es el mismo
programa de alimentación escolar, no una fuente nueva. El conector ahora acepta ambos nombres
(`COLUMN_TOKENS.qaliwarmaNinos`/`qaliwarmaIiee` prueban `QALI WARMA` y `WASI MIKUNA` en ese
orden) — el nombre de campo en `cobertura_social` se mantiene (`qaliwarma_*`) por continuidad
histórica, no se renombra cada vez que el programa cambie de nombre. Cualquier futuro rename real
de un programa MIDIS debería resolverse igual: ampliar las alternativas, no perseguir el nombre
vigente en el esquema de la tabla.

### Gotcha crítico: coma como separador de miles, no decimal

Confirmado en vivo: valores como `"5,234"` significan 5,234 (cinco mil doscientos treinta y
cuatro), no 5.234. Un `Number()`/`parseFloat()` ingenuo sobre `"5,234"` da `5`. El parser
(`parseInfomidisNumber`) quita las comas antes de convertir.

### NULL vs. cero

Un campo vacío en el CSV (ej. `FONCODES - N° usuarios estimados` sin dato ese mes) se guarda
como `NULL`, nunca como `0` — un distrito sin dato de un programa ese corte no es lo mismo que
un distrito con cobertura cero de ese programa.

### Filas descartadas

Una fila sin `UBIGEO` o con `FECHA_CORTE` en un formato no reconocible (no `YYYYMMDD`) se
descarta y se cuenta en `filasSinUbigeo`/`filasSinFechaCorte` del resumen — no se inserta con una
clave sintética.

## Cautelas

- El conteo de distritos por corte confirmado en el spike (agosto 2024) fue 1,892 — cercano pero
  no idéntico al número de distritos del Perú según INEI; no se investigó la causa exacta de la
  diferencia (distritos nuevos, distritos sin reporte ese mes, u otra razón).
- Pese a que INFOMIDIS ya resuelve el riesgo de PII de Pensión 65, sigue siendo dato sensible de
  un programa dirigido a adultos mayores en pobreza — el agregado por distrito es apropiado para
  el caso de uso de este proyecto (cruce con inversión pública), pero no debe usarse como base
  para inferir o exponer información sobre personas específicas.
