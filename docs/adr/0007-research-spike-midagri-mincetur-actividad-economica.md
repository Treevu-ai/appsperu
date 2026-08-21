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

## Decisión

**No se decide construir ninguna app todavía.** Este ADR deja registrado:

1. MIDAGRI es el candidato de mayor confianza para un próximo spike de verificación en vivo
   (browser real, no bot-blocked) — objetivo: confirmar URLs de descarga directa, columnas
   exactas y si `Insumos y Servicios Agropecuarios` u otro dataset trae La Libertad
   específicamente, antes de escribir el ADR de app standalone (patrón ADR-0002/0003) y el data
   contract con el rigor habitual del proyecto.
2. MINCETUR queda como candidato secundario, mismo tipo de spike pendiente, prioridad menor a
   MIDAGRI hasta confirmar si "Reporte Regional de Turismo" es tabular o narrativo.
3. PRODUCE y PCM quedan fuera de alcance de este spike — no descartados, solo no investigados
   con suficiente profundidad para documentar un hallazgo útil.
4. Si se decide avanzar, el patrón a seguir es el mismo de `ceplan-estrategico`
   (ADR-0003/data contract con "Estado: CONFIRMADO/PARCIALMENTE CONFIRMADO"): abrir el portal
   real en un browser, confirmar estructura de descarga, y solo entonces escribir el ADR de
   app + migraciones.

## Pendientes concretos para el próximo spike

1. Verificar en vivo (browser real) las URLs de descarga directa de los datasets MIDAGRI
   listados arriba — confirmar si `Insumos y Servicios Agropecuarios` desagrega por
   departamento incluyendo La Libertad.
2. Confirmar si el monitoreo satelital distrital de siembras (SIEA) es descargable o solo
   visualización.
3. Abrir el "Reporte Regional de Turismo 2025" de MINCETUR y determinar si es PDF o dataset.
4. Reintentar PRODUCE (`ogeiee.produce.gob.pe`) y PCM (`sgp.pcm.gob.pe`) cuando la
   conectividad del entorno lo permita — ninguno de los dos se descartó, solo quedaron sin
   investigar.

## Referencias

- Data contracts (estado "parcialmente confirmado por listado, pendiente de verificación en
  vivo"): `docs/data-contracts/midagri-estadistica-agraria.md`,
  `docs/data-contracts/mincetur-turismo-regional.md`
- Precedente del mismo patrón de investigación: ADR-0003 (CEPLAN/ObservaPerú), ADR-0006
  (hallazgo sobre ANIN)
