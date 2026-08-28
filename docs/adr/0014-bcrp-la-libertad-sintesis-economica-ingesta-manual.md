# ADR-0014: `bcrp-la-libertad` — Síntesis de Actividad Económica (BCRP Sucursal Trujillo), ingesta manual

- Estado: Aceptado — implementado en `apps/bcrp-la-libertad`.
- Fecha: 2026-08-28
- Ámbito: nueva app, cuarta fuente BCRP del proyecto junto a `bcrp-comercio-exterior` — pero
  de dominio distinto (indicadores multisectoriales de un departamento, no comercio exterior
  nacional).

## Contexto

El usuario señaló que el BCRP tiene una sucursal en Trujillo que publica investigación propia
de La Libertad — inicialmente se descartó al confundirla con `bcrp-comercio-exterior` (agregado
nacional, fuente distinta). Investigación en vivo confirmó que sí existe un reporte mensual
específico, "LA LIBERTAD: Síntesis de Actividad Económica", con URL predecible.

Dos hallazgos determinaron el diseño:

1. **`bcrp.gob.pe` está detrás de un WAF (Incapsula) que bloquea toda herramienta
   automatizada** (`curl`, `WebFetch`) con un challenge JS. Confirmado con el navegador real
   del usuario, que sí carga el PDF — descarta la hipótesis inicial de bloqueo de red/IP (el
   patrón que sí resolvió `infobras` corriendo la ingesta en otra máquina). Acá ninguna máquina
   sin navegador real con ejecución JS puede pasar el challenge. Ver
   `docs/data-contracts/bcrp-sintesis-la-libertad.md` para el detalle de las pruebas.
2. **El contenido del PDF sí es parseable, con una limitación real.** Un spike con `pdf-parse`
   v2 sobre el PDF real de enero 2026 (`docs/sintesis-la-libertad-01-2026.pdf`) mostró que
   `getText()` extrae texto tabulado (`\t`) limpio para 7 de los 10 ANEXOS del reporte, pero 3
   (manufactura-%var, morosidad, importaciones Salaverry) usan un layout donde los valores
   van separados por espacio simple en vez de tab — y algunos valores superan 999 usando
   espacio como separador de miles, indistinguible de un separador de columna sin conocer las
   coordenadas x/y originales del PDF (que `getText()` no preserva).

## Decisión

### Ingesta manual, sin conector de descarga

Primer conector del proyecto sin script de descarga por red. `npm run ingest:pdf -- <ruta>`
recibe un argumento posicional (ruta a un PDF ya descargado) — a diferencia de todos los
demás `ingest:*` del proyecto, que no reciben argumentos porque descargan solos. El
`raw_bcrp_ll_batches` guarda `file_name` + checksum del texto extraído, no un payload de red.

### App nueva, no extender `bcrp-comercio-exterior`

Dominio distinto: `bcrp-comercio-exterior` es comercio exterior agregado nacional (API JSON
oficial, sin WAF, series `PN38714`-`PN38723`); esta es multisectorial (agro, pesca, minería,
manufactura, crédito, depósitos, ejecución presupuestal, comercio exterior *regional*) y de
un solo departamento por diseño del reporte de origen. Comparten el prefijo `bcrp-` porque
comparten la fuente institucional (BCRP), no el dominio de datos.

### Modelo genérico de indicadores, no una tabla por ANEXO

Los 10 ANEXOS comparten la misma forma (indicador × 13 meses) — se normalizan en una sola
tabla `bcrp_ll_indicators` (`anexo_numero`, `seccion` opcional, `indicador`, `periodo_anio`,
`periodo_mes`, `valor`), evitando 10 migraciones/normalizers casi idénticos. Un solo parser
(`parseAnexoTable`) cubre los 7 anexos con formato A; se aplica repetidas veces sobre el texto
ya partido por `splitByAnexo` (que detecta encabezados `ANEXO N` con regex flexible, dado que
el formato del encabezado varía entre "ANEXO 1", "ANEXO Nº 01", "ANEXO N° 10" en el mismo
documento).

### Anexos 4, 7 y 9 no se ingieren — decisión deliberada, no un bug pendiente

Los tres usan el layout de valores separados por espacio (formato B, ver data contract). Se
evaluó y descartó un parser heurístico que intentara "fundir" tokens numéricos consecutivos
cuando parecieran ser un solo valor con separador de miles — el riesgo de fusionar mal (o de
no fundir cuando debía) produce datos **silenciosamente incorrectos**, sin ningún error visible
que lo delate. Se prefiere devolver 0 filas para esos 3 anexos (visible en el resumen de
`ingestPdf`, documentado en el catálogo MCP y en el data contract) antes que arriesgar una cifra
mal parseada que alguien cite en un memo sin saber que está corrupta.

### El período de cada columna se calcula por posición

Las columnas de cada tabla vienen etiquetadas "ENE FEB MAR ... DIC ENE" — no distinguen año.
`extractReportPeriod` lee el mes/año real de la portada del PDF, y `computeColumnPeriods`
calcula los 13 periodos retrocediendo desde ahí. Más robusto que confiar en las etiquetas de
mes de cada tabla individual.

## Alternativas consideradas

**Parser heurístico de fusión de tokens para los anexos 4/7/9** — descartada, ver arriba.

**Automatizar la descarga con un navegador headless (Playwright/Puppeteer)** — no disponible
como herramienta en este entorno de desarrollo. Si en el futuro se agrega esa capacidad al
proyecto, vale la pena revisar si resuelve el challenge de Incapsula (no garantizado — algunos
challenges detectan automatización de todas formas).

**Reintentar con cookies de sesión (cookie-jar de dos pasadas)** — probado, no funcionó; el
challenge de Incapsula requiere ejecutar JS real, no solo tener una cookie válida.

## Consecuencias

- Primera fuente del proyecto con ingesta 100% manual — riesgo operativo: si nadie descarga el
  PDF de un mes, ese mes queda sin dato en la base (aunque el histórico sigue disponible
  manualmente en el sitio del BCRP para recuperarlo después).
- Habilita, por primera vez en el proyecto, una serie mensual de ejecución presupuestal
  específica de La Libertad, independiente de `radar-ejecucion` — útil para cruzar/validar sin
  esperar una re-ingesta de esa app.
- 3 de 10 anexos quedan pendientes — no se descarta resolverlos más adelante si aparece una
  forma confiable de distinguir separador de miles de separador de columna (ej. una librería
  de extracción PDF que sí preserve coordenadas x/y por token, permitiendo reconstruir columnas
  por posición en vez de por espacios en el texto).
- No hay scheduler — coherente con el resto del proyecto, pero acá ni siquiera es posible
  automatizar la parte de descarga.

## Corrección posterior (misma fecha, revisión previa a usar los datos en un memo)

Al construir el análisis del memo de brecha (§6 de
`docs/MEMO_LA_LIBERTAD_BRECHA_INVERSION_PUBLICA_PRIVADA_POR_SECTOR_2026-08-28.md`) se encontró
que el ANEXO 10 repite las etiquetas "Gobierno nacional/regional/locales" 6 veces (una por
categoría de gasto), y la clave única original (`anexo_numero, indicador, periodo_anio,
periodo_mes`) no las distinguía — el upsert las pisaba entre sí, dejando en la base solo la
última de las 6 apariciones por mes en vez de las 6. Los demás anexos (1,2,3,5,6,8) no tienen
este problema (verificado: ningún indicador se repite dentro del mismo mes).

**Corrección**: `seccion` pasó a ser `NOT NULL DEFAULT ''` (antes nullable) y parte de la
clave única (`UNIQUE (anexo_numero, seccion, indicador, periodo_anio, periodo_mes)`);
`parseAnexoTable` ahora trackea la categoría padre inmediata (última fila de datos que no es
una de las 3 etiquetas repetidas) y se la asigna como `seccion` a cada aparición. Se
re-ingirió el PDF de enero 2026 y se verificó contra el CUADRO N°09 original del reporte
(Ene-26: Formación Bruta de Capital GN=114, GR=27, GL=56 — coincide exacto).

## Referencias

- Data contract: `docs/data-contracts/bcrp-sintesis-la-libertad.md`
- Memo que originó este trabajo:
  `docs/MEMO_LA_LIBERTAD_BRECHA_INVERSION_PUBLICA_PRIVADA_POR_SECTOR_2026-08-28.md`
