# Data contract — MTPE: Empresas en el Sector Privado por distrito

> Ficha técnica: `docs/adr/0021-research-spike-mtpe-empleo-formalizacion.md` (spike, Hallazgo 1) y
> `docs/PRD_Actividad_Empresarial_Formal_v1.md` (ticket AE-01, implementado).

- Fuente oficial: Ministerio de Trabajo y Promoción del Empleo (MTPE) — dataset publicado en la
  Plataforma Nacional de Datos Abiertos, `https://www.datosabiertos.gob.pe`.
- Dataset (slug CKAN): `empresas-en-el-sector-privado-por-mes-según-distritos-ministerio-de-trabajo-y-promoción-del`.
- Owner del conector: app `actividad-empresarial` (`src/ingest/empresas-distrito-connector.ts`).

## Estado: CONFIRMADO — conector construido y probado (AE-01, 2026-09-05)

### Dataset gemelo descartado — no confundir

Existe otro dataset con contenido equivalente pero un slug distinto:
`empresas-en-el-sector-privado-por-meses-según-distritos` (nótese "mes**es**" en plural, sin
sufijo "MTPE"). Trae un recurso 2021 en CSV y otro 2021 en XLSX. **No se usa** — el dataset con
sufijo MTPE ya cubre 2022, un corte más reciente. Si en el futuro cualquiera de los dos slugs
publica un año posterior a 2022, ese es el momento de revisar cuál mantener como fuente primaria,
no antes.

### Único año disponible: 2022 — advertencia de vigencia

Confirmado revisando el dataset completo el 2026-09-05: el único recurso de datos es
`Dataset__Empr_Sect_Privado_mes_ 2022_MTPE.csv`. No existe un corte posterior publicado por MTPE
bajo este dataset. Cualquier consumidor de este dato debe tratarlo como una fotografía de 2022,
no del presente.

### El año viene del título del recurso, NUNCA de la columna `FECHA_CORTE`

Trampa confirmada en la fila real: `FECHA_CORTE` vale `20230807` — es la fecha en que MTPE
publicó este corte (agosto 2023), no el año que reportan las 12 columnas de mes (2022). El
conector extrae el año del nombre/título del recurso devuelto por `package_show`
(`extractYearFromResourceName` en `empresas-distrito-parse.ts`), y falla explícitamente si no
encuentra un año de 4 dígitos ahí — nunca asume un año por defecto ni lo deriva de `FECHA_CORTE`.

### Formato del archivo

- Delimitador `;`.
- Encoding **Latin-1** — confirmado con un caso real: el distrito "NEPEÑA" decodifica
  correctamente solo como Latin-1 (el byte `0xD1` falla como UTF-8). Mismo encoding que
  INFOMIDIS, distinto de RENIPRESS (UTF-8 con BOM).
- Columnas: `FECHA_CORTE`, `CODIGO_DE_UBIGEO` (6 dígitos, mismo formato que `investments`/
  `ipress`/`cobertura_social`), `DISTRITOS`, y 12 columnas de mes en mayúsculas —
  **`SETIEMBRE`, no `SEPTIEMBRE`** (confirmado en el header real).
- ~1,398 distritos (cobertura nacional).

### Gotcha: espacio final en los valores numéricos, no separador de miles

Confirmado en vivo: los valores traen un espacio en blanco al final (`"10076 "`, no `"10076"`).
Se verificó explícitamente que valores de 5 dígitos (Lima: `"16523 "`, `"16523"` correcto sin
separador interno) se leen intactos — es solo un espacio final, no una agrupación de miles con
espacio. El parser (`parseCount`) hace `trim()` antes de convertir.

### Normalización ancho → largo

El CSV trae una fila por distrito con 12 columnas de mes. Se normaliza a una fila por
`(ubigeo, anio, mes)` en `empresas_privadas_distrito` — mismo patrón que
`actividad-agraria/agricultural_wage` con el jornal agrícola de MIDAGRI.

### Recurso único confirmado hoy — sin ambigüedad de "más reciente"

A diferencia de RENIPRESS/INFOMIDIS (que requieren resolver cuál de varios recursos CSV es el
más reciente), este dataset trae un único recurso CSV de datos (más un diccionario y metadatos,
que no son CSV). El conector no necesita lógica de selección por fecha — pero si en el futuro
aparece un segundo recurso CSV, `pickEmpresasResource` lo detecta y **advierte explícitamente**
(no asume silenciosamente cuál usar) en vez de fallar o adivinar.

## Cautelas

- No se investigó en este ticket si MTPE publica esta misma serie en otro portal (ej. un sistema
  operacional propio del MTPE, fuera de la PNDA) con cortes más recientes — solo se confirmó el
  estado del catálogo de `datosabiertos.gob.pe`.
- El cruce de este dataset contra inversión pública (`GET /api/crossref`) es deliberadamente
  descriptivo, sin inferencia de causalidad — ver `docs/PRD_Actividad_Empresarial_Formal_v1.md`
  §7 para el razonamiento completo.
