# ADR-0018: Research spike — PNDA (MINEDU/MINSA/MIDIS) para cerrar el ciclo Presupuesto → Obra → Servicio

> Este ADR es una **investigación**, no una decisión de construir — mismo criterio que
> ADR-0007 (MIDAGRI/MINCETUR) y ADR-0010 (PROINVERSIÓN/VERTIX): se documenta lo que se pudo
> confirmar sobre tres fuentes candidatas, con nivel de confianza explícito por hallazgo.
> **No se decide build/no-build todavía.** Este spike responde a `docs/PRD_EXPANSION_PNDA.md`
> y `docs/BACKLOG_EXPANSION_PNDA.md` (ambos "Borrador / Para Revisión"), que proponían 3 apps
> nuevas y un conector CKAN genérico sin haber verificado en vivo si las 3 fuentes existen con
> la granularidad asumida, y sin revisar el repo en busca de trabajo ya hecho sobre lo mismo.

## Contexto

`docs/PRD_EXPANSION_PNDA.md` propone cerrar el "punto ciego" de Rastro (invertir en una obra
no garantiza que el servicio mejore) integrando tres sectores desde la Plataforma Nacional de
Datos Abiertos (PNDA): Educación (MINEDU), Salud (MINSA) y Desarrollo Social (MIDIS), con tres
apps nuevas (`adar-educacion`/`adar-salud`/`adar-social` en el borrador) y un conector CKAN
genérico (`PndaConnector`) en `packages/`.

Antes de comprometer ese alcance, este spike verifica dos cosas: (a) si las 3 fuentes existen
en PNDA con la estructura que el PRD asume (UBIGEO, estado operativo/individual vs. agregado),
y (b) si ya hay trabajo en el repo que resuelve parte de lo propuesto.

**Redundancia encontrada antes de investigar las fuentes**: `tools/ckan-indexer/ckan_indexer.py`
ya es un indexador del catálogo CKAN de `datosabiertos.gob.pe` — exactamente lo que
`TICKET-01` del backlog propone construir desde cero como `PndaConnector`. Ya corrió en modo
parcial (999 de ~5,000 datasets) y generó `docs/inventario-fuentes/catalog.json` +
`por-ministerio.md` + `reporte-calidad.md` (1,273 recursos verificados vivos por HEAD request).
Cualquier implementación de `PndaConnector` debe partir de este indexer existente, no
duplicarlo.

**Limitación del entorno de investigación**: a diferencia de los data contracts existentes del
proyecto (que navegan la fuente en vivo y confirman estructura exacta de columnas), este spike
se apoya en resultados de búsqueda web (snippets indexados), no en descarga y parseo directo de
los CSV/recursos reales. El nivel de confianza de cada hallazgo refleja esa limitación —
**antes de escribir un data contract con el rigor habitual, alguien necesita descargar cada
recurso real y confirmar columnas exactas**, mismo paso pendiente que dejó ADR-0007 para
MIDAGRI/MINCETUR.

## Hallazgo 1 — Salud (MINSA/SUSALUD, RENIPRESS): confianza alta

El "Registro Nacional de IPRESS" (RENIPRESS) lo mantiene SUSALUD, no MINEDU/MIDIS-equivalente
directo de MINSA, pero es la fuente correcta para "¿está el puesto de salud operativo?":
- Dataset confirmado en PNDA: `datosabiertos.gob.pe/dataset/minsa-ipress` y
  `.../registro-nacional-de-ipress-renipress-superintendencia-nacional-de-salud-susalud`.
- **23,656 establecimientos de salud a nivel nacional**, con código único de institución,
  ubicación y un campo `id_ubigeo` (equivalencia RENIEC/INEI) — exactamente la llave que el
  resto del proyecto usa para cruzar territorio (`ceplan-geo/territories`, `radar-inversiones`,
  `infobras`).
- Formato CSV, descargable, mantenido activamente (aparece en el índice parcial ya generado
  por `tools/ckan-indexer` bajo el slug `minsa-ipress`).
- **Pendiente de confirmar en vivo**: si el registro incluye estado operativo/equipamiento
  (lo que el PRD pide para el "Score de Brecha de Servicio") o solo identidad + ubicación —
  los snippets de búsqueda no lo confirman con certeza.

## Hallazgo 2 — Educación (MINEDU): confianza media

- `datosabiertos.gob.pe` tiene un grupo "Ministerio de Educación - MINEDU" con datasets de
  padrón de instituciones educativas, pero el ejemplo más concreto encontrado
  (`padrón-regional-de-instituciones-educativas-de-la-región-cajamarca`) es **regional, no
  nacional** — 9,346 instituciones de Cajamarca con campos (fecha de corte, código modular,
  anexo, código de local, nombre, nivel, forma, características, tipo, gestión, dependencia,
  director, teléfono, correo, web, estado). Estructura muy útil si existe el equivalente para
  La Libertad, pero **no se confirmó si el dataset de Cajamarca es un caso aislado publicado
  por ese gobierno regional específico, o si existe una versión nacional/por-región para las
  demás regiones incluyendo La Libertad.**
- Existe además `datos.minedu.gob.pe` (repositorio propio de MINEDU, separado de la PNDA
  central) con ESCALE (Unidad de Estadística Educativa) — probablemente la fuente nacional más
  completa y consistente, pero no se verificó si publica un padrón descargable equivalente al
  de Cajamarca o solo reportes agregados.
- **Pendiente de confirmar en vivo**: (a) si hay padrón de instituciones educativas específico
  de La Libertad o nacional con la misma estructura que Cajamarca; (b) si ESCALE
  (`datos.minedu.gob.pe`) es una fuente más confiable que el dataset regional encontrado; (c) si
  alguno de los dos declara estado de infraestructura (no solo identidad del local), que es lo
  que el PRD necesita para el cruce con inversión.

## Hallazgo 3 — Desarrollo Social (MIDIS): confianza alta, con una restricción de política de datos que el PRD no resolvió

Dos programas, dos formatos de publicación muy distintos — esto es el hallazgo más importante
del spike:

- **JUNTOS ya se publica agregado por distrito**: `resumen-de-hogares-afiliados-y-abonados-por-ubigeo-2024`
  reporta, por UBIGEO y de forma bimestral, hogares afiliados, hogares abonados, miembros
  objetivo y montos transferidos por afiliación/corresponsabilidad. **Esto encaja
  directamente con el patrón de honestidad de datos que ya usa `seguridad-ciudadana`
  (agregación distrital, nunca individual) — es la fuente correcta para cruzar con inversión
  en servicios básicos sin tocar datos de personas naturales.**
- **Pensión 65 se publica a nivel de USUARIO individual**: `información-de-usuarios-del-programa-pensión-65`
  (reportes bimestrales, ej. "Usuarios Pensión 65 RBU 202506/202508") — el nombre del dataset
  y de sus recursos ("Usuarios") indica registros por persona, no agregados por distrito.
  `docs/ABOUT_RASTRO.md` (§9.5, §11.4) declara explícito que Rastro **no cruza con datos
  personales de personas naturales** — el PRD original ("cruzar la ubicación de beneficiarios
  de programas sociales") no distingue entre estos dos programas ni declara si el cruce sería
  a nivel de hogar/persona o agregado. **Cualquier implementación de este cruce debe usar
  JUNTOS tal como se publica (agregado) y, si se usa Pensión 65, agregarlo del lado de Rastro
  a nivel distrital antes de persistirlo — nunca guardar ni exponer el registro individual**,
  siguiendo el mismo criterio que `seguridad-ciudadana/ingest/sidpol-connector.ts` aplica a
  denuncias policiales.
- **Pendiente de confirmar en vivo**: estructura exacta de columnas de ambos datasets, y si
  Pensión 65 tiene alguna variante ya agregada por distrito (no se encontró en esta búsqueda,
  pero tampoco se descartó exhaustivamente).

## Conclusión del spike

No se decide build/no-build. Antes de escribir un PRD ejecutable (con el mismo rigor de
`docs/PRD_Confiabilidad_Conectores_y_Cruces_v1.md`), falta:

1. Correr `tools/ckan-indexer/ckan_indexer.py --full` (o al menos un `--limit` mayor dirigido
   por búsqueda de texto a "minedu"/"midis"/"ipress") para que el índice del repo confirme
   estos hallazgos con HEAD-check real, no solo snippets de búsqueda.
2. Descargar y abrir en vivo al menos un recurso real de cada uno de los 3 datasets
   priorizados (RENIPRESS, el padrón educativo que corresponda a La Libertad o su equivalente
   nacional, y JUNTOS por UBIGEO) para confirmar columnas exactas — mismo paso que falta en
   ADR-0007 para MIDAGRI/MINCETUR.
3. Decidir explícitamente, antes de tocar código, si Pensión 65 entra al alcance del cruce
   (agregado del lado de Rastro) o queda fuera por el riesgo de manejo de datos de un programa
   dirigido a adultos mayores en pobreza — es una decisión de producto, no solo técnica.
4. Si se decide avanzar, el `PndaConnector` del backlog original se redefine como una extensión
   de `tools/ckan-indexer` (o un consumidor de su output ya indexado), no como un conector
   nuevo desde cero.

## Consecuencias

- `docs/PRD_EXPANSION_PNDA.md` y `docs/BACKLOG_EXPANSION_PNDA.md` permanecen como borrador —
  no se promueven a PRD ejecutable hasta que los 4 puntos de la conclusión estén resueltos.
- Si el resultado de los pasos 1-2 es positivo, el siguiente paso natural es un PRD con el
  mismo formato que `PRD_Confiabilidad_Conectores_y_Cruces_v1.md` (Historia, Contexto
  verificado en código, Criterios de aceptación por ticket), no una reescritura del borrador
  actual.
- Si Pensión 65 se descarta por el paso 3, el alcance de "Desarrollo Social" se reduce a
  JUNTOS únicamente — evaluar si eso sigue justificando una app nueva o si encaja mejor como
  extensión de una app existente.
