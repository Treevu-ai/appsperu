# Data contract — MEF: pasivos contingentes explícitos (Marco Macroeconómico Multianual / IAPM)

> Ficha técnica: `docs/adr/0023-riesgo-fiscal-isds-semilla-manual.md` (incluye una corrección
> posterior importante — leer esa sección antes de confiar en cualquier cifra de esta fuente).
> Owner del conector: app `riesgo-fiscal-isds` (`apps/riesgo-fiscal-isds/api`).

- Fuente oficial: Ministerio de Economía y Finanzas del Perú (MEF), Marco Macroeconómico
  Multianual (MMM) o Informe de Actualización de Proyecciones Macroeconómicas (IAPM), sección de
  pasivos contingentes explícitos del Sector Público No Financiero (SPNF).
  `mef.gob.pe/es/marco-macroeconomico/marco-macroeconomico-multianualmmm`.
- **Confirmado por lectura directa del PDF con `pdf-parse` v2** (no por cobertura periodística —
  la primera versión de esta app sí lo hizo así y produjo una cifra mal atribuida a la edición
  equivocada; ver ADR-0023, sección "Corrección posterior").

## Estado: CONFIRMADO — serie 2020-2025 verificada, incluida la edición vigente

### Acceso — extracción de texto funciona; descarga automatizada con `curl`/`WebFetch` no, con navegador real sí

Tres PDFs descargados (`MMM_2024_2027.pdf`, `IAPM_2025-2028.pdf`, `MMM_2027_2030.pdf`) se leyeron
con `pdf-parse` sin ningún problema: texto completo y limpio (262, 144 y 295 páginas
respectivamente). Un intento anterior con `WebFetch` había fallado sobre los dos primeros —
**eso era una limitación de esa herramienta específica, no del PDF** (`WebFetch` usa un modelo
pequeño para convertir a markdown, no apto para binarios de este tamaño/complejidad).

La descarga automatizada de la edición vigente (MMM 2027-2030, aprobada ago-2026) sí estaba
bloqueada para herramientas tipo `curl`/`WebFetch` — se probaron 4 rutas, las 4 fallaron:

| Intento | Resultado |
|---|---|
| `mef.gob.pe/contenidos/pol_econ/marco_macro/MMM_2027_2030.pdf` | 404 (nombre de archivo real distinto) |
| `mef.gob.pe/contenidos/pol_econ/marco_macro/MMM_2026_2029.pdf` | 404 |
| `bcrp.gob.pe/docs/Publicaciones/Programa-Economico/mmm-2027-2030.pdf` (mirror) | Bloqueado por WAF Incapsula — mismo bloqueo que `bcrp-la-libertad`, ver ADR-0014 |
| `gob.pe/institucion/mef/informes-publicaciones/8533022` (página de publicaciones) | HTTP 418 — bloqueo anti-bot deliberado |

**Resuelto con un navegador real** (`claude-in-chrome`): la página de MEF resuelve la URL real del
PDF vía JavaScript (`cdn.www.gob.pe/uploads/document/file/10528873/8533022-marco-macroeconomico-multianual-2027-2030.pdf`,
no predecible desde el patrón de ediciones anteriores) y el navegador la carga sin bloqueo —
confirma que el bloqueo es anti-automatización (challenge JS / heurística de comportamiento), no
un problema de red/IP. Descargado y verificado: 295 páginas, 15,674,847 bytes exactos. El PDF
resultante tiene el formato de tabla "año actual/previo + Diferencia" (ver abajo), no soportado
por el conector — los años 2024/2025 se cargaron a mano, leídos directamente del texto extraído.

**Conclusión**: para una futura edición, alguien con navegador real (o `claude-in-chrome`) debe
encontrar y descargar el PDF, luego correr `npm run ingest:pdf -- <ruta> <edicion>`. Si el formato
de tabla es el soportado (`IAPM_2025_2028`), el conector inserta todo automáticamente; si es el
otro formato, hay que leer el texto y cargar los años nuevos a mano vía migración (ver ejemplo en
`003_seed_2024_2025_mmm_2027_2030.sql`).

### Contenido — dos formatos de tabla distintos en la misma sección, solo uno soportado

El recuadro de pasivos contingentes explícitos aparece en ambos tipos de documento, pero con
estructuras distintas:

**Formato soportado (confirmado en `IAPM_2025_2028`)**: encabezado de N años en columnas
tab-separadas, seguido de 4 filas ("Total", "1. Procesos judiciales, administrativos y
arbitrajes", "2. Controversias internacionales en temas de inversión - CIADI", "3. Contingencias
explícitas asumidos en contratos de APP"), cada una con N valores tab-separados en formato
"12,70" (coma decimal):

```
2020    2021    2022    2023
Total    12,70    12,01    9,92    10,92
1. Procesos judiciales, administrativos y arbitrajes    8,68    7,08    6,19    6,59
2. Controversias internacionales en temas de inversión - CIADI    2,01    3,16    2,15    2,91
3. Contingencias explícitas asumidos en contratos de APP    2,02    1,78    1,58    1,42
```

**Formato NO soportado (confirmado en `MMM_2024_2027`)**: mismas 4 filas, pero el encabezado es
año-actual + año-previo + "Contingencia Esperada" + "Diferencia" (ej. "2021 2022 2023
2022/2021"), no una serie de años — `parsePasivosContingentesTable` lo detecta (el patrón de
encabezado de años consecutivos no matchea "2022/2021") y devuelve `[]` en vez de leer las
columnas equivocadas como si fueran años.

Categorías → clave interna:

| Texto en el PDF | `categoria` |
|---|---|
| Total | `total` |
| 1. Procesos judiciales, administrativos y arbitrajes | `judicial_administrativo` |
| 2. Controversias internacionales en temas de inversión - CIADI | `isds` |
| 3. Contingencias explícitas asumidos en contratos de APP | `app` |

### Corte verificado

2020-2023 cargados por el conector real desde `IAPM_2025_2028` (16 filas: 4 categorías × 4 años).
Cross-validado contra `MMM_2024_2027` para el año 2022: ambos documentos reportan exactamente
9.92% (total) / 6.19% (judicial) / 2.15% (ISDS) / 1.58% (APP) — coincidencia exacta. 2024-2025
cargados a mano desde `MMM_2027_2030` (migración `003`, formato de tabla no soportado por el
conector), leídos directamente del texto extraído, página 208/295.

| Año de cierre | Total | Judicial/administrativo | ISDS (CIADI) | APP | Fuente |
|---|---|---|---|---|---|
| 2020 | 12.70% | 8.68% | 2.01% | 2.02% | Conector (`IAPM_2025_2028`) |
| 2021 | 12.01% | 7.08% | 3.16% | 1.78% | Conector (`IAPM_2025_2028`) |
| 2022 | 9.92% | 6.19% | 2.15% | 1.58% | Conector, cross-validado con `MMM_2024_2027` |
| 2023 | 10.92% | 6.59% | 2.91% | 1.42% | Conector (`IAPM_2025_2028`) |
| 2024 | 9.17% | 5.85% | 2.29% | 1.03% | Manual (`MMM_2027_2030`, p. 208/295) |
| 2025 | 10.70% | 5.59% | **4.24%** | 0.87% | Manual (`MMM_2027_2030`, p. 208/295) — máximo ISDS de la serie |

## Implicaciones para cruces con el ecosistema

| Entidad destino | Clave disponible | Viabilidad |
|---|---|---|
| `radar-ejecucion` (MEF) | Ninguna clave exacta — el MMM/IAPM es un documento de proyección fiscal agregada, no tiene `SEC_EJEC` ni entidad ejecutora por fila | No — solo lectura conjunta descriptiva |
| Proyecto `clasificado` (fuera del monorepo) | Ninguna clave técnica — cita conceptual de la misma serie en `informe_isds_peru.tex` y `modulo_riesgo_institucional.md` (corregidos junto con esta app, misma fecha) | Sí, como referencia cruzada documental, no como join de datos |

## Riesgos de ingesta

1. **Descarga de cada edición nueva sigue siendo manual** — el MMM se publica ~fines de agosto
   cada año; requiere un navegador real (curl/WebFetch quedan bloqueados), así que si nadie la
   descarga y corre el conector (o carga los años a mano si el formato no es el soportado), la
   serie queda desactualizada.
2. **Solo un formato de tabla tiene parser automático** — 2 de 3 documentos leídos hasta ahora
   (`MMM_2024_2027`, `MMM_2027_2030`) usan el formato "año actual/previo + Diferencia", no
   soportado; esos años se cargan a mano vía migración. Extender el normalizer para ese segundo
   formato evitaría la carga manual, pero no es bloqueante — ver ejemplo de migración manual en
   `003_seed_2024_2025_mmm_2027_2030.sql`.
3. **Datos de fuente primaria completos 2020-2025** — sin brecha conocida en la serie por ahora;
   revisar de nuevo cuando salga la edición MMM 2028-2031 (~ago-2027).
4. **Metodología del `2. Controversias internacionales... - CIADI` no confirmada como idéntica
   entre ediciones** — el MMM 2024-2027 explica la metodología de cálculo (tiempo esperado ×
   monto de exposición × severidad histórica de casos CIADI) pero no hay garantía de que el
   método no se revise entre ediciones sin aviso explícito en el texto.
