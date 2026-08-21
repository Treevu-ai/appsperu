# ADR-0007: Research spike — MIDAGRI (SIEA) y MINCETUR (turismo regional) para seguimiento de actividad económica en La Libertad

> Este ADR es una **investigación**, no una decisión de construir. A diferencia de
> ADR-0002/0003 (apps standalone ya decididas) o ADR-0006 (extensión ya decidida sobre
> `radar-ejecucion`), aquí se documenta lo que se pudo confirmar en vivo sobre dos fuentes
> nuevas candidatas, con nivel de confianza explícito por hallazgo — igual que hizo
> originalmente ADR-0003 con ObservaPerú antes de tener claridad sobre su granularidad real.
> **No se decide build/no-build todavía.**

## Contexto

El proyecto cubre bien el ciclo de gasto público (presupuesto → inversión → obra → compra →
proveedor), pero no tiene ninguna señal de **actividad económica real** de La Libertad —
producción agrícola, manufactura, turismo — que permita contrastar el gasto público con
resultado económico territorial (ej. "¿la inversión en riego se refleja en producción agrícola
de la costa?"). PRODUCE, MINCETUR, MIDAGRI y PCM se evaluaron como candidatos; este spike
cubre MIDAGRI y MINCETUR, los dos priorizados en la conversación previa a este ADR.

**Limitación del entorno de investigación**: `datosabiertos.gob.pe` no resolvió por DNS en
ningún intento (mismo comportamiento en ambas fuentes, y ya visto antes al investigar ANIN en
ADR-0006) y `gob.pe` devolvió `418 I'm a Teapot` (bloqueo anti-bot) al intentar leer una página
de informes de MINCETUR. Todo lo de abajo viene de resultados de búsqueda (snippets indexados),
no de navegación directa verificada — nivel de confianza más bajo que el resto de data
contracts del proyecto, que sí navegaron las fuentes en vivo. **Antes de escribir un data
contract con el rigor habitual, alguien necesita abrir estos portales en un browser real**
(no headless/bot-blocked) y confirmar estructura exacta — mismo paso que se hizo para
ObservaPerú en su momento.

## Hallazgo 1 — MIDAGRI: confianza alta, múltiples datasets CSV reales confirmados por listado

Vía `datosabiertos.gob.pe` (Plataforma Nacional de Datos Abiertos), grupo MIDAGRI, aparecen
**datasets ya publicados en CSV** (confirmado por el listado del portal, no por descarga
directa en este spike):

| Dataset | Contenido | Regional? |
|---|---|---|
| `VBP Agropecuario, Agrícola y Pecuario` | Valor Bruto de Producción agropecuaria/agrícola/pecuaria, 2019-2025 | Pendiente confirmar granularidad |
| `MIDAGRI - Información Estadística Agrícola` | Superficie sembrada/cosechada, producción, rendimiento, **precio en chacra**, por cultivo | Sí — es la fuente detrás del SIEA |
| `MIDAGRI - Información Estadística Pecuaria` | Producción, población, precios al productor, rendimientos pecuarios | Pendiente confirmar |
| `Datos Agroindustriales 2023-2025` | Producción y venta de productos terminados, insumos | Pendiente confirmar |
| `Insumos y Servicios Agropecuarios` | Importación de insumos, producción de guano, **valor de jornal agrícola por región**, **precio de alquiler de tractor por región** (2018-2024) | **Sí, explícitamente por región** |
| `MIDAGRI: Estudios Económicos` | Sin detalle confirmado | — |

Adicionalmente, el portal operacional propio de MIDAGRI (`siea.midagri.gob.pe/portal/`) ofrece
dashboards Power BI y boletines ("El Agro en Cifras", mensual) con las mismas variables, y
menciona **monitoreo satelital de siembras a nivel distrital** — si eso es descargable (no
confirmado), sería la granularidad geográfica más fina de cualquier fuente que el proyecto haya
evaluado hasta ahora, por debajo de departamento.

**Por qué es el candidato más fuerte**: a diferencia de CEPLAN (que resultó no tener datos
per-entidad) o ANIN (que resultó no tener fuente propia), MIDAGRI ya tiene **datasets con
"por región" en el nombre mismo del dataset** — señal directa, no inferida, de que la
granularidad territorial que necesita el proyecto existe.

## Hallazgo 2 — MINCETUR: confianza media, existe reporte regional pero formato sin confirmar

`datosturismo.mincetur.gob.pe` es el portal operacional (equivalente al SIEA de MIDAGRI), con
módulos de "Estadísticas", "Reportes regionales", "Indicadores turísticos" y "Observatorio".
Existe una publicación específica **"Reporte Regional de Turismo 2025"**
(`gob.pe/institucion/mincetur/informes-publicaciones/6659083-...`) — el fetch a esa página
devolvió `418` (bloqueo), así que no se pudo confirmar si es:
(a) un PDF narrativo por región (como los boletines "El Agro en Cifras" de MIDAGRI), o
(b) datos tabulares descargables.

El sistema base sí expone series de **flujo de turistas internacionales, movimiento de
pasajeros en aeropuertos, llegadas/pernoctaciones y capacidad de hospedaje** — con fuente
subyacente Migraciones para el flujo internacional. La granularidad regional para hospedaje
("Estadística Mensual de Turismo para Establecimientos de Hospedaje", ya visto en el grupo
MINCETUR de `datosabiertos.gob.pe`) es plausible pero tampoco confirmada en vivo.

**Por qué es candidato secundario, no descartado**: hay señal real de reporte regional y de un
dataset de hospedaje por establecimiento (que normalmente trae departamento/provincia como
columna), pero falta el mismo nivel de confirmación que MIDAGRI ya tiene solo por los nombres
de dataset.

## PRODUCE y PCM — no cubiertos en este spike

Se evaluaron brevemente en la conversación previa pero quedan fuera de este ADR:
- **PRODUCE**: el sitio de estadísticas (`ogeiee.produce.gob.pe`) no resolvió (mismo problema
  de red que `datosabiertos.gob.pe`). Hay un dataset "Directorio de Empresas MiPyme por sector
  productivo" en la PNDA, pero sin confirmar si trae ubicación/región.
- **PCM**: `sgp.pcm.gob.pe` (Secretaría de Gestión Pública) publica informes de seguimiento de
  metas por ministerio/gobierno regional — conexión rechazada al intentar leer la página. Esta
  fuente es conceptualmente la más alineada con lo que el proyecto ya persigue con
  CEPLAN/`salud-institucional` (Execution Efficiency), así que merece su propio spike cuando el
  entorno de red lo permita, en vez de forzar una conclusión sin datos.

## Actualización 2026-08-21 (segunda pasada, Chrome real vía `claude-in-chrome`)

El pase con WebFetch (arriba) quedó bloqueado por red en ambas fuentes. Repetir con un browser
real destrabó MINCETUR por completo y confirmó MIDAGRI a nivel de dashboard (no de dataset
descargable) — **invierte el orden de prioridad** planteado originalmente:

- **MIDAGRI**: confirmado en vivo que el portal SIEA existe, funciona, y su dashboard "Perfil
  Productivo Departamental" (Power BI público) sí filtra por región incluyendo La Libertad con
  datos reales y ricos (VBP por subsector, top cultivos, rendimientos, agroexportaciones por
  producto/destino). **Pero el dashboard no tiene opción de exportar datos** (confirmado por
  clic derecho: sin "Exportar datos" en el menú contextual) — la vía de ingesta real seguiría
  siendo los datasets CSV de `datosabiertos.gob.pe`, que **siguió sin resolver ni desde Chrome
  real** — no es un bloqueo del tooling de este proyecto, es la red del entorno de investigación
  actual. Queda confirmado que el dato existe con la granularidad necesaria; falta solo destrabar
  el acceso a la PNDA (desde otra red) para confirmar el formato de descarga.
- **MINCETUR**: confirmado en vivo que "Reporte Regional de Turismo 2025" es un **PDF por
  departamento** (26 archivos, ~800KB-1MB c/u, incl. "LA LIBERTAD - Año 2025"), no un dataset
  tabular. Esto lo baja de prioridad frente a MIDAGRI: ninguna de las 8 apps del proyecto
  parsea PDF hoy (INFOBRAS es XLSX, no PDF) — sería el primer conector de ese tipo, mayor
  esfuerzo de implementación que cualquier fuente ya integrada.

## Decisión

**No se decide construir ninguna app todavía.** Este ADR deja registrado, con la prioridad
invertida respecto al borrador inicial:

1. **MIDAGRI pasa a ser el candidato de mayor prioridad** para el siguiente paso — no un nuevo
   spike de descubrimiento (ya se hizo), sino específicamente destrabar el acceso a
   `datosabiertos.gob.pe` (desde una red donde resuelva) para confirmar URLs de descarga directa
   y columnas exactas de los datasets ya identificados, antes de escribir el ADR de app
   standalone (patrón ADR-0002/0003).
2. **MINCETUR baja de prioridad** — el hallazgo de que es PDF, no CSV, lo hace más caro de
   implementar que cualquier fuente actual del proyecto; no descartado, pero no es el siguiente
   paso natural.
3. PRODUCE y PCM quedan fuera de alcance de este spike — no descartados, solo no investigados
   con suficiente profundidad para documentar un hallazgo útil.
4. Si se decide avanzar con MIDAGRI, el patrón a seguir es el mismo de `ceplan-estrategico`
   (ADR-0003/data contract con "Estado: CONFIRMADO/PARCIALMENTE CONFIRMADO"): el punto de
   integración es el dataset descargable de la PNDA, no el iframe de Power BI del SIEA — mismo
   principio que ya aplicó ADR-0006 para descartar scraping del dashboard de ANIN.

## Actualización 2026-08-21 (tercera pasada, retry) — MIDAGRI queda CONFIRMADO

El bloqueo de `datosabiertos.gob.pe` no era una caída del portal: **el dominio raíz no
resuelve, pero `www.datosabiertos.gob.pe` sí** — error de investigación en las dos pasadas
anteriores, no un problema real de la fuente. Con eso corregido:

- **`MIDAGRI-03.03: Valor de Jornal Agrícola por región 2018-2026`** queda confirmado con el
  mismo rigor que el resto de data contracts del proyecto: CSV real, 16.36 KB, columnas
  `Región/Año/Ene..Dic`, 210 registros, botón de descarga funcional, licencia Open Data Commons
  Attribution. Detalle completo en `docs/data-contracts/midagri-estadistica-agraria.md`.
- Se descubrió que `MIDAGRI-02` (VBP) es **nacional, no regional** — corrige la lectura inicial
  de este ADR, que asumía que el "por región" del título de `Insumos y Servicios Agropecuarios`
  era la única señal regional disponible. Ahora está confirmado en el dataset mismo, no en el
  título.
- El VBP/rendimiento regional que sí se ve en el dashboard Power BI del SIEA no tiene todavía
  un dataset CSV equivalente confirmado — candidato: `MIDAGRI - Información Estadística
  Agrícola`, pendiente de previsualizar.

## Decisión final de este spike

**MIDAGRI ya no necesita más investigación exploratoria** — el siguiente paso natural es
escribir el ADR de app standalone (patrón ADR-0002/0003: nombre, puertos, migraciones,
conector) tomando `MIDAGRI-03.03` como primer recurso a ingerir, con
`MIDAGRI - Información Estadística Agrícola` como segundo objetivo si se confirma que trae el
VBP/rendimiento regional. MINCETUR se mantiene en pausa (PDF, mayor costo). PRODUCE y PCM
siguen sin investigar.

## Actualización 2026-08-21 (cuarta pasada) — La Libertad confirmada, corrección sobre el "segundo dataset"

1. **LA LIBERTAD confirmada en `MIDAGRI-03.03`**: 9 filas (2018-2026), valor de jornal agrícola
   subiendo de S/34 a S/48-49 (~42% nominal en 8 años), con un hueco real abr-jul 2020
   (consistente con inicio de pandemia). Detalle completo en el data contract.
2. **"MIDAGRI - Información Estadística Agrícola" no existe** — se revisó el catálogo completo
   de MIDAGRI en la PNDA (23 datasets, 3 páginas) y ningún dataset trae superficie
   sembrada/cosechada/rendimiento/precio en chacra por cultivo con ese nombre. Era una
   referencia del snippet de búsqueda original, no un dataset real — se descarta como pendiente.
3. Candidato investigado en su lugar: **`MIDAGRI-02: Datero Agrario`** — **descartado**. Su
   título promete precios mayoristas por ciudad, pero el contenido real (confirmado
   previsualizando el último de sus 42 recursos) es telemetría de uso del servicio telefónico
   de consulta (`CONSULTAS`, `USUARIO`, `MODULOS`, `OPERADOR` — Movistar/Bitel), sin precios ni
   ciudad/región. Además está congelado desde mayo 2020 (los 42 archivos no dejan margen de
   duda: cubren exactamente 2015-2020/mayo y ninguno más reciente).
4. El VBP/rendimiento regional del dashboard Power BI del SIEA **no tiene dataset CSV
   equivalente localizado** en el catálogo completo — puede ser un cálculo interno del SIEA sin
   fuente pública propia en la PNDA.

**No se encontró segundo dataset viable.** Esto no cambia la decisión de fondo: `MIDAGRI-03.03`
por sí solo ya es suficiente para justificar el ADR de app standalone — un solo recurso bien
confirmado (estructura, columnas, cobertura de La Libertad) pesa más que dos recursos sin
verificar, y el proyecto ya tiene precedente de apps con un solo conector real (`ceplan-geo`
sigue sin construir, pero varias apps existentes arrancaron con un único dataset).

## Pendientes concretos

1. Confirmar patrón de URL de descarga directa (no solo el botón de UI) para poder automatizar
   el conector sin depender de un click.
2. MINCETUR: explorar `datosturismo.mincetur.gob.pe` (el portal operacional, no el compendio de
   PDFs de `gob.pe`) para confirmar si tiene un dataset tabular alternativo.
3. Reintentar PRODUCE (`ogeiee.produce.gob.pe`) y PCM (`sgp.pcm.gob.pe`) con Chrome real,
   recordando probar también con `www.` si el dominio raíz falla.

## Referencias

- Data contracts (estado "parcialmente confirmado por listado, pendiente de verificación en
  vivo"): `docs/data-contracts/midagri-estadistica-agraria.md`,
  `docs/data-contracts/mincetur-turismo-regional.md`
- Precedente del mismo patrón de investigación: ADR-0003 (CEPLAN/ObservaPerú), ADR-0006
  (hallazgo sobre ANIN)
