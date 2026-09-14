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

## Referencias

- Data contract: `docs/data-contracts/riesgo-fiscal-isds.md`
- Precedente de ingesta manual por bloqueo de PDF: `docs/adr/0014-bcrp-la-libertad-sintesis-economica-ingesta-manual.md`
- Criterio de alcance del workspace compartido: `docs/adr/0019-alcance-workspace-utilidades-compartidas.md`
- Proyecto externo que originó este trabajo: `clasificado/archivos_conflicto_peru/tracker_mmm_pasivos_contingentes.html`, `informe_isds_peru.tex`, `modulo_riesgo_institucional.md`
