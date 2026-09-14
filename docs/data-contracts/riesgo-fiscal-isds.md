# Data contract — MEF: pasivos contingentes explícitos (Marco Macroeconómico Multianual)

> Ficha técnica: `docs/adr/0023-riesgo-fiscal-isds-semilla-manual.md`.
> Owner del conector: app `riesgo-fiscal-isds` (`apps/riesgo-fiscal-isds/api`).

- Fuente oficial: Ministerio de Economía y Finanzas del Perú (MEF), Marco Macroeconómico
  Multianual (MMM), sección de pasivos contingentes explícitos del Sector Público No
  Financiero (SPNF). `mef.gob.pe/es/marco-macroeconomico/marco-macroeconomico-multianualmmm`.
- **Sin confirmación por lectura directa del PDF** — a diferencia de `bcrp-la-libertad`, no se
  logró un spike técnico exitoso de extracción de texto (ver sección Acceso). Cada cifra
  cargada se verificó contra cobertura periodística especializada que cita el número exacto y
  su fuente dentro del MMM, con fecha de verificación registrada por fila.

## Estado: PARCIALMENTE CONFIRMADO — acceso al PDF no resuelto, datos cargados por fuente secundaria citable

### Acceso — PDFs sin capa de texto extraíble

Se intentó `WebFetch` sobre tres ediciones (`MMM_2024_2027.pdf`, `IAPM_2025-2028.pdf`, y la URL
general del MMM vigente) el 2026-09-13. Los tres devolvieron contenido no interpretable
("corrupted PDF data, JPEG image streams") en vez de texto — a diferencia de `bcrp-la-libertad`,
donde el mismo tipo de intento con `pdf-parse` sí extrajo texto tabulado limpio. No se probó
`pdf-parse` directamente sobre estos archivos (solo `WebFetch`, que usa un pipeline distinto) —
**queda pendiente un spike real con `pdf-parse` antes de descartar la extracción automatizada
por completo**; ver "Riesgos" más abajo.

**Conclusión operativa actual**: sin un spike que confirme o descarte la extracción por
`pdf-parse`, no se construyó ningún conector. Los datos se cargaron por verificación cruzada
contra prensa especializada que cita las cifras exactas del documento.

### Contenido — estructura confirmada indirectamente

El MMM reporta, bajo la etiqueta "pasivos contingentes explícitos", tres categorías (más un
total) como % del PBI:

| Categoría | Qué cubre |
|---|---|
| Judicial/administrativo | Procesos judiciales, administrativos y arbitrajes nacionales |
| ISDS | Controversias internacionales en materia de inversión (CIADI/ICSID) |
| APP | Contingencias explícitas de Asociaciones Público-Privadas |
| Total | Suma de las tres anteriores — exposición máxima del SPNF |

### Corte verificado por edición

- **MMM 2025-2028** (publicado 23-ago-2024): 6.6% (judicial/administrativo) + 2.9% (ISDS) +
  1.4% (APP) = 10.9% PBI total. Desglose completo, única edición con las 4 categorías
  confirmadas. Fuente: cobertura de búsqueda web verificada 2026-09-13, citando directamente el
  MMM.
- **MMM 2026-2029** (publicado 27-ago-2025): fuentes secundarias contradictorias — un artículo
  cita "3.01% PBI en valor presente" (sin desglose ISDS/APP) y otro "9.28% PBI de exposición
  máxima ~US$30 mil millones" (también sin desglose). No se registró ningún `pct_pbi` para esta
  edición; se prefirió `NULL` + `estado: no_localizado` antes que adivinar cuál cifra corresponde
  a qué categoría.
- **MMM 2027-2030** (aprobado ago-2026): 2.15% PBI ISDS, 1.58% PBI APP — cifra ancla ya citada
  en el proyecto externo `clasificado` (`informe_isds_peru.tex`, `modulo_riesgo_institucional.md`).
  Categoría judicial/administrativo y total no localizados para esta edición.

### Serie histórica secundaria (tabla aparte, no mezclar)

Luis Miguel Castilla (ex-MEF, director ejecutivo de Videnza) citó en PERUMIN 37 (sept-2025) una
serie de "controversias internacionales" como % PBI para 2014 (0.8%), 2021 (3.2%, US$7,200M, 27
casos) y 2024 (2.3%, US$6,700M, 24 casos). Es una declaración pública con acceso privilegiado a
la data del MEF, pero **no es una cita directa del documento MMM** ni necesariamente la misma
categoría exacta que "ISDS" en `mmm_pasivos_contingentes` — se guarda en
`mmm_serie_historica_secundaria`, tabla separada, y la API la devuelve con `fuente: "secundaria"`
explícito.

## Implicaciones para cruces con el ecosistema

| Entidad destino | Clave disponible | Viabilidad |
|---|---|---|
| `radar-ejecucion` (MEF) | Ninguna clave exacta — el MMM es un documento de proyección fiscal agregada, no tiene `SEC_EJEC` ni entidad ejecutora por fila | No — solo lectura conjunta descriptiva |
| Proyecto `clasificado` (fuera del monorepo) | Ninguna clave técnica — cita conceptual de la misma cifra (2.15% PBI, MMM 2027-2030) en `informe_isds_peru.tex` y `modulo_riesgo_institucional.md` | Sí, como referencia cruzada documental, no como join de datos |

## Riesgos de ingesta

1. **Sin spike confirmado de `pdf-parse` sobre los PDFs reales del MEF** — el fallo de
   `WebFetch` no descarta necesariamente que `pdf-parse` (usado con éxito en `bcrp-la-libertad`)
   logre extraer texto. Antes de asumir que estos PDFs son 100% escaneados, correr
   `pdf-parse` directamente sobre un PDF del MMM descargado a mano es el siguiente paso lógico
   si se quiere automatizar en el futuro.
2. **Datos verificados contra fuente secundaria, no contra el documento primario leído
   directamente** — cada cifra tiene su URL de cobertura periodística citada, pero ninguna se
   confirmó leyendo el PDF oficial línea por línea (a diferencia de `bcrp-la-libertad`, donde sí
   se leyó y verificó una cifra narrativa del propio reporte). Riesgo de que la prensa haya
   redondeado o mal transcrito algún decimal.
3. **Cobertura desigual entre ediciones** — solo 1 de 3 ediciones tiene el desglose completo de
   las 4 categorías; las otras 2 tienen campos `NULL` explícitos en vez de valores inventados.
4. **Actualización depende de que alguien la haga a mano** — sin conector, sin scheduler, sin
   forma de saber automáticamente cuándo sale una edición nueva del MMM (normalmente
   fines de agosto, más alguna revisión a mitad de año).
