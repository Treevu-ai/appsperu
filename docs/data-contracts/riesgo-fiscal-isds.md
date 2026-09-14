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

## Estado: CONFIRMADO — serie 2020-2023 verificada, edición vigente pendiente de descarga manual

### Acceso — extracción de texto funciona, descarga automatizada de la edición vigente no

Dos PDFs ya descargados (`MMM_2024_2027.pdf`, `IAPM_2025-2028.pdf`) se leyeron con `pdf-parse`
sin ningún problema: texto completo y limpio, 262 y 144 páginas respectivamente. Un intento
anterior con `WebFetch` había fallado sobre los mismos archivos — **eso era una limitación de esa
herramienta específica, no del PDF** (`WebFetch` usa un modelo pequeño para convertir a markdown,
no apto para binarios de este tamaño/complejidad).

La edición vigente al momento de escribir esto (MMM 2027-2030, aprobada ago-2026) sí está
bloqueada para descarga automatizada — se probaron 4 rutas, las 4 fallaron:

| Intento | Resultado |
|---|---|
| `mef.gob.pe/contenidos/pol_econ/marco_macro/MMM_2027_2030.pdf` | 404 (nombre de archivo real distinto) |
| `mef.gob.pe/contenidos/pol_econ/marco_macro/MMM_2026_2029.pdf` | 404 |
| `bcrp.gob.pe/docs/Publicaciones/Programa-Economico/mmm-2027-2030.pdf` (mirror) | Bloqueado por WAF Incapsula — mismo bloqueo que `bcrp-la-libertad`, ver ADR-0014 |
| `gob.pe/institucion/mef/informes-publicaciones/8533022` (página de publicaciones) | HTTP 418 — bloqueo anti-bot deliberado |

**Conclusión**: alguien con navegador real debe descargar el PDF de la edición vigente y correr
`npm run ingest:pdf -- <ruta> <edicion>`. Una vez con el archivo en disco, la extracción y el
parseo son completamente automáticos y ya están probados contra dos documentos reales.

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

Serie 2020-2023 cargada por el conector real desde `IAPM_2025_2028` (16 filas: 4 categorías × 4
años). Cross-validado contra `MMM_2024_2027` para el año 2022: ambos documentos reportan
exactamente 9.92% (total) / 6.19% (judicial) / 2.15% (ISDS) / 1.58% (APP) — coincidencia exacta,
buena señal de que el dato es estable entre ediciones que se solapan.

| Año de cierre | Total | Judicial/administrativo | ISDS (CIADI) | APP |
|---|---|---|---|---|
| 2020 | 12.70% | 8.68% | 2.01% | 2.02% |
| 2021 | 12.01% | 7.08% | 3.16% | 1.78% |
| 2022 | 9.92% | 6.19% | 2.15% | 1.58% |
| 2023 | 10.92% | 6.59% | 2.91% | 1.42% |

## Implicaciones para cruces con el ecosistema

| Entidad destino | Clave disponible | Viabilidad |
|---|---|---|
| `radar-ejecucion` (MEF) | Ninguna clave exacta — el MMM/IAPM es un documento de proyección fiscal agregada, no tiene `SEC_EJEC` ni entidad ejecutora por fila | No — solo lectura conjunta descriptiva |
| Proyecto `clasificado` (fuera del monorepo) | Ninguna clave técnica — cita conceptual de la misma serie en `informe_isds_peru.tex` y `modulo_riesgo_institucional.md` (corregidos junto con esta app, misma fecha) | Sí, como referencia cruzada documental, no como join de datos |

## Riesgos de ingesta

1. **Descarga de la edición vigente sigue siendo manual** — el MMM se publica ~fines de agosto
   cada año; si nadie descarga el PDF y corre el conector, la serie queda un año atrás.
2. **Solo un formato de tabla soportado** — si una futura edición cambia el layout del recuadro
   (como ya ocurre entre `MMM_2024_2027` y `IAPM_2025_2028` dentro del mismo período), el
   conector fallará explícitamente (`Error`, 0 filas insertadas) en vez de leer mal los datos.
   Extender el normalizer para el segundo formato es trabajo futuro, no bloqueante.
3. **Datos verificados contra 2 documentos, ambos de 2023-2025** — la serie no cubre 2024 ni 2025
   todavía; requiere descargar y correr el conector contra el IAPM/MMM más reciente disponible.
4. **Metodología del `2. Controversias internacionales... - CIADI` no confirmada como idéntica
   entre ediciones** — el MMM 2024-2027 explica la metodología de cálculo (tiempo esperado ×
   monto de exposición × severidad histórica de casos CIADI) pero no hay garantía de que el
   método no se revise entre ediciones sin aviso explícito en el texto.
