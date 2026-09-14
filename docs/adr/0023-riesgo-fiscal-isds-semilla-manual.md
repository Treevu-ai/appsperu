# ADR-0023: `riesgo-fiscal-isds` — pasivos contingentes MEF-MMM, semilla manual en vez de conector

- Estado: Aceptado — implementado en `apps/riesgo-fiscal-isds`.
- Fecha: 2026-09-13
- Ámbito: nueva app, 28ª del monorepo.

## Contexto

Un proyecto externo (`clasificado`, fuera de este monorepo) identificó que el Marco
Macroeconómico Multianual (MMM) del MEF cuantifica oficialmente el riesgo fiscal de los
arbitrajes de inversión: 2.15% del PBI en pasivos contingentes explícitos por controversias
internacionales de inversión (ISDS), frente a 1.58% del PBI por contingencias de Asociaciones
Público-Privadas (APP) en la edición 2027-2030 — el mayor pasivo contingente individual
reconocido por el Estado peruano. Se decidió migrar ese dato a Rastro como una app propia en
vez de dejarlo solo en un documento externo.

Dos hallazgos determinaron el diseño:

1. **Los PDFs del MMM no devolvieron texto extraíble vía `WebFetch`** (probado sobre 3
   ediciones el 2026-09-13; resultado: "corrupted PDF data, JPEG image streams"). No se llegó a
   probar `pdf-parse` directamente — el precedente del proyecto (`bcrp-la-libertad`,
   ADR-0014) usó `pdf-parse` con éxito sobre un PDF de perfil similar (reporte gubernamental,
   tablas), así que no está descartado que funcione acá también. Ver
   `docs/data-contracts/riesgo-fiscal-isds.md`, sección Riesgos.
2. **El MMM se publica solo 1-2 veces al año.** A diferencia de casi todas las demás fuentes del
   catálogo (mensuales, trimestrales, o snapshots reingeridos bajo demanda), construir un
   conector de descarga + parser + normalizer para un dato que cambia 1-2 veces al año es
   sobre-ingeniería si el costo de cargar cada edición a mano es bajo.

## Decisión

### Semilla manual revisada, sin conector de descarga

Segunda fuente del proyecto (junto a `bcrp-la-libertad`) sin ingesta 100% automatizada, pero
con un perfil distinto: `bcrp-la-libertad` sí tiene un script (`ingest:pdf`) que un humano
ejecuta pasándole un archivo ya descargado; `riesgo-fiscal-isds` no tiene ningún script — los
datos se cargan directamente como `INSERT` en una migración SQL versionada
(`002_seed_ediciones_verificadas.sql`), verificados por búsqueda de cobertura periodística que
cita la cifra exacta del MMM, no por lectura directa del PDF.

Actualizar con una edición nueva del MMM es: verificar la cifra contra una fuente citable,
escribir una migración `00N_seed_edicion_<periodo>.sql`, correr `npm run migrate`. No hay
`npm run ingest:*` que ejecutar.

### `pct_pbi` nullable — nunca se completa un valor faltante

`mmm_pasivos_contingentes.pct_pbi` acepta `NULL`. La edición 2026-2029 tiene fuentes
secundarias contradictorias (3.01% vs. 9.28% PBI, sin desglose claro) — se cargó con las 4
categorías en `NULL` y `mmm_ediciones.estado = 'no_localizado'`, en vez de elegir una de las dos
cifras o promediarlas. Mismo criterio que `bcrp-la-libertad` con sus 3 anexos no ingeridos
(ADR-0014): preferir un campo vacío y visible a un número adivinado que alguien podría citar sin
saber que es incierto.

### Serie histórica secundaria en tabla aparte

La serie 2014/2021/2024 citada por Luis Miguel Castilla (ex-MEF, PERUMIN 37) usa una etiqueta
("controversias internacionales") que no se confirmó como idéntica a la categoría "ISDS" del
MMM, y proviene de una declaración pública, no del documento mismo. Se guarda en
`mmm_serie_historica_secundaria`, tabla separada de `mmm_pasivos_contingentes`, y la API la
devuelve con `fuente: "secundaria"` explícito — para que nadie la grafique junto a la serie
oficial sin esa aclaración.

### App nueva, puerto 4027, sin entrar al workspace raíz de npm

Igual que `bcrp-la-libertad`, esta app no necesita ningún paquete compartido
(`@appsperu/entity-matcher`, `shared-queries`, etc. — no hace entity matching ni comparte
queries con otra app), así que no se agregó a la lista `workspaces` de `package.json` raíz (ver
ADR-0019, criterio de cuándo una app entra a esa lista). Corre de forma completamente
independiente con su propio `node_modules`.

## Alternativas consideradas

**Construir ya el conector `pdf-parse` + normalizer, como `bcrp-la-libertad`** — descartada por
ahora: requeriría primero un spike técnico real (`pdf-parse` sobre un PDF del MMM descargado a
mano) que no se hizo en esta iteración, y el beneficio es bajo dado que el dato cambia 1-2 veces
al año. Queda documentada como opción futura si se quiere evitar la verificación manual por
prensa.

**Extender `radar-ejecucion`** (que ya ingiere datos del MEF) en vez de crear una app nueva —
descartada: `radar-ejecucion` ingiere ejecución presupuestal (AIRHSP, Consulta Amigable), un
dominio y una cadencia de actualización completamente distintos al MMM. Mismo criterio que
`bcrp-la-libertad` vs. `bcrp-comercio-exterior` en ADR-0014: comparten la fuente institucional,
no el dominio de datos.

## Consecuencias

- Primera fuente del catálogo cargada 100% por migración SQL en vez de por un conector, aunque
  sea manual — precedente distinto al de `bcrp-la-libertad` (que sí tiene un script ejecutable).
  Si en el futuro se confirma que `pdf-parse` funciona sobre estos PDFs, migrar a un conector
  real es sencillo: las tablas ya existen, solo cambiaría el mecanismo de carga.
- Cobertura desigual entre ediciones (1 de 3 con desglose completo) queda visible en la API
  (`estado`, `pct_pbi: null`) en vez de oculta — cualquier consumidor del MCP tool ve
  explícitamente qué está confirmado y qué no.
- No hay scheduler — coherente con el resto del proyecto, y en este caso también con la
  frecuencia real de la fuente (no tendría sentido revisar más de 1-2 veces al año).

## Corrección posterior (misma fecha, tras un spike real con `pdf-parse`)

Todo lo anterior en este ADR quedó **parcialmente invalidado** por un spike técnico hecho
inmediatamente después de la primera implementación, al continuar el trabajo el mismo día. Se
deja el contexto y la decisión originales arriba sin editar (son el registro de qué se pensaba y
por qué), y se documenta acá qué resultó ser incorrecto y qué se corrigió.

### Hallazgo 1: `pdf-parse` sí extrae texto limpio — la premisa del punto 1 del Contexto era falsa

Se corrió `pdf-parse` directamente (no `WebFetch`) sobre los dos PDFs del MEF ya descargados
(`MMM_2024_2027.pdf`, `IAPM_2025-2028.pdf`): ambos dieron texto limpio y completo (869k y 491k
caracteres, 262 y 144 páginas). El fallo original de `WebFetch` era una limitación de esa
herramienta específica (su pipeline de extracción con un modelo pequeño, no diseñado para PDFs
de ese tamaño), no una propiedad del PDF. **Conclusión corregida: estos PDFs no son un caso como
`bcrp-la-libertad` (bloqueo de WAF) — el único bloqueo real es la descarga automatizada de la
edición vigente** (ver Hallazgo 3).

### Hallazgo 2: la cifra ancla (2.15% ISDS / 1.58% APP) estaba mal atribuida a la edición 2027-2030

El Contexto original atribuye 2.15%/1.58% a "la edición 2027-2030", basado en un artículo de
prensa (Gestión.pe) encontrado por búsqueda web. La lectura directa del PDF de `MMM_2024_2027`
(aprobado 27-ago-2023) muestra que esas cifras exactas corresponden al **cierre de 2022**:

```
2021    2022
Total   12,01   9,92
1. Procesos judiciales, administrativos y arbitrajes   7,08   6,19
2. Controversias internacionales en temas de inversión - CIADI   3,16   2,15
3. Contingencias explícitas asumidos en contratos de APP   1,78   1,58
```

Es decir: el dato es real y viene de fuente primaria del MEF, pero la sesión de investigación
anterior (basada en búsqueda web, sin leer el PDF) le puso la fecha equivocada. Este error ya se
había propagado a `informe_isds_peru.tex` y `modulo_riesgo_institucional.md` del proyecto externo
`clasificado`, y a la primera versión de las migraciones de esta app — todo eso se corrigió en el
mismo commit que corrige este ADR.

**Lección operativa**: una cifra encontrada por búsqueda web y atribuida a una edición específica
de un documento periódico (MMM, MMR, cualquier serie con múltiples ediciones) debe verificarse
contra el documento mismo antes de fijarla a una fecha — la cobertura de prensa a veces no aclara
o generaliza a qué año de cierre se refiere una cifra, y un resumen de búsqueda puede
mal-atribuirla a la edición más reciente por defecto.

### Hallazgo 3: la descarga automatizada de la edición vigente (MMM 2027-2030) sí está bloqueada

Se intentaron 4 rutas para conseguir el PDF del MMM 2027-2030 sin intervención humana:
`mef.gob.pe/contenidos/.../MMM_2027_2030.pdf` (404 — el nombre real del archivo no sigue el
patrón de ediciones anteriores), el mismo patrón para `MMM_2026_2029.pdf` (404), el mirror en
`bcrp.gob.pe/docs/Publicaciones/Programa-Economico/mmm-2027-2030.pdf` (bloqueado por el mismo
WAF Incapsula de `bcrp-la-libertad`, ver ADR-0014), y la página de publicaciones en gob.pe
(HTTP 418, bloqueo anti-bot deliberado). **Esta parte del diagnóstico original sí era correcta**:
la descarga sigue siendo manual. Lo que cambió es que, una vez con el archivo en disco, la
extracción de texto y el parseo de la tabla SÍ son automatizables.

### Decisión revisada: esquema por año de cierre + conector real `pdf-parse`

- El esquema original (`mmm_ediciones` como clave de `mmm_pasivos_contingentes`, modelando el
  dato como "una tabla por edición del MMM") estaba mal diseñado: el dato real es una **serie
  continua por año de cierre** que cada documento nuevo extiende o revisa. Se rediseñó
  `mmm_pasivos_contingentes` con `anio_cierre` como parte de la clave (`UNIQUE (anio_cierre,
  categoria)`) y `edicion_fuente` como referencia a qué documento reportó ese número.
- Como ninguna otra sesión/desarrollador llegó a depender de las migraciones originales (solo se
  habían corrido contra un contenedor Postgres de prueba local, nunca desplegadas), se corrigió
  el contenido de `001_init.sql` y `002_seed_ediciones_verificadas.sql` directamente en vez de
  agregar migraciones `003`/`004` sobre un diseño que se sabía incorrecto desde el día uno.
- Se construyó `src/ingest/pdf-connector.ts` + `src/ingest/pdf-normalize.ts` (mismo patrón que
  `bcrp-la-libertad`: `npm run ingest:pdf -- <ruta> <edicion>`, checksum, batch crudo, upsert
  transaccional). El normalizer solo reconoce el formato de tabla limpio confirmado en
  `IAPM_2025_2028` (encabezado de N años + filas "Total"/"1."/"2. CIADI"/"3. APP" tab-separadas) —
  el formato distinto que usa `MMM_2024_2027` en la misma sección (año actual + año previo +
  "Contingencia Esperada" + "Diferencia") se detecta y se descarta explícitamente, devolviendo 0
  filas en vez de datos mal ubicados. Verificado con un test que confirma ambos comportamientos.
- **Bug real encontrado durante el spike**: la primera versión de los regex de categoría usaba
  `.*` codicioso sin un literal de anclaje al final de la fila "1. Procesos judiciales..." — sin
  un ancla como "CIADI" o "APP" para detener el backtracking, `.*\t` consumía hasta el ÚLTIMO tab
  de la fila, capturando solo el valor final en vez de los N valores completos. Se corrigió a
  `.*?` (no codicioso). Este es exactamente el tipo de error silencioso que la salvaguarda de
  "todas las categorías deben encontrarse o se devuelve `[]`" existe para atrapar — con esa
  salvaguarda, el bug se manifestó como "0 filas" (visible, investigable) en vez de datos
  parcialmente corruptos.
- Serie verificada y cargada por el conector real (no por `INSERT` manual): 2020-2023, 4
  categorías cada uno, 16 filas, desde `IAPM_2025_2028`. La edición vigente (`MMM_2027_2030`)
  queda con `estado = 'no_localizado'` — pendiente de que alguien descargue el PDF a mano.

## Referencias

- Data contract: `docs/data-contracts/riesgo-fiscal-isds.md`
- Precedente de ingesta manual por bloqueo de PDF: `docs/adr/0014-bcrp-la-libertad-sintesis-economica-ingesta-manual.md`
- Criterio de alcance del workspace compartido: `docs/adr/0019-alcance-workspace-utilidades-compartidas.md`
- Proyecto externo que originó este trabajo: `clasificado/archivos_conflicto_peru/tracker_mmm_pasivos_contingentes.html`, `informe_isds_peru.tex`, `modulo_riesgo_institucional.md` (los tres también corregidos, misma fecha)
