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

## Addendum — Fase 0: verificación en vivo (2026-09-05)

Se ejecutaron los pasos 1 y 2 de la conclusión (`package_list`/`package_show` en vivo contra
`datosabiertos.gob.pe`, más descarga real de los recursos CSV con `curl -A "Mozilla/5.0..."` —
la API rechaza el user-agent por defecto de `curl`/Python con HTTP 418 de un WAF). No se corrió
`ckan_indexer.py --full` (15-25 min) porque `package_list` (una sola llamada, 4,684 datasets)
ya permite filtrar por substring del slug sin bajar cada `package_show`; no hizo falta tocar el
script. `package_search` no existe en esta instancia DKAN (404) — confirma la nota del código
del indexer de que hay que apoyarse en `package_list` + `package_show`, no en búsqueda de texto
del lado del servidor.

### Salud — mejor fuente que la asumida, y confirma estado operativo

Hay **3** datasets IPRESS, no 1:
- `minsa-ipress`: recurso de 2017, **20,819 registros**, con `Estado`/`Situación`/`Condición` en
  el header — confirma que sí trae estado operativo, pero está **desactualizado** (última
  modificación del archivo es 2017 aunque el metadato del dataset diga 2025).
- `registro-nacional-de-ipress-renipress-superintendencia-nacional-de-salud-susalud`: apunta a
  `datos.susalud.gob.pe` (dominio externo, no descargado en este spike).
- `registro-nacional-de-entidades-prestadoras-de-servicios-de-salud-renipress`: **esta es la
  fuente correcta**, no la del PRD original. Recursos CSV mensuales vigentes (`RENIPRESS_31-08-2026.csv`
  confirmado descargable, **36,004 registros**, 26,901 con `ESTADO=ACTIVO`). Columnas: `UBIGEO`,
  `ESTADO`, `CATEGORIA` (I-1, etc.), `NORTE`/`ESTE` (coordenadas), `TELEFONO`, `COD_IPRESS`.
  Delimitador `;`, encoding UTF-8 con BOM. **Recomendación: usar este dataset, no `minsa-ipress`.**

### Educación — la fuente de PNDA está muerta, pero ESCALE sí es viable (no es un no-build)

No existe ningún dataset con slug `minedu*` en el catálogo PNDA. Solo hay **2** datasets de
padrón regional (uno de Cajamarca y `padrón-regional-de-instituciones-educativas`), cuyo único
recurso es un enlace HTML a `datosabiertos.regionlalibertad.gob.pe/datastreams.aspx?guid=padron-colegios`
— **ese enlace devuelve HTTP 404 ahora mismo**. La fuente que el PRD asumía para La Libertad vía
PNDA está muerta. **Conclusión: descartar PNDA como canal de Educación.**

Fuera de PNDA, `datos.minedu.gob.pe` (el dominio que el ADR original asumía para ESCALE) **no
resuelve DNS** — no existe. El dominio correcto es `escale.minedu.gob.pe`, y sí está vivo y
activamente mantenido — el Censo Educativo 2025 ya está publicado (cédulas censales en PDF
confirmadas: `Cedula-2A_Censo_Educativo-2025.pdf`, `Cedula-3AP_Censo_Educativo-2025.pdf`). Hay
dos rutas de acceso a datos, ninguna tan directa como un CSV con URL fija:
- `escale.minedu.gob.pe/padron-de-iiee` — buscador interactivo (portlet Liferay "PadronWeb" de
  ~2011), con exportación por correo electrónico ("Exportar consulta") y un enlace de "Descargar
  datos del padrón" hacia una biblioteca de documentos Liferay (`.../document_library_display/...`)
  que **no se pudo resolver con `curl` porque el listado se renderiza vía JS/sesión** — este
  spike no tuvo acceso al navegador (extensión Chrome desconectada) para completar la navegación
  visual. Es el mismo patrón de riesgo que la ficha de La Libertad: "interfaz por validar, no
  API pública", pero a diferencia de esa, el dominio sí está vivo y el dato sí existe.
- `sistemas02.minedu.gob.pe/anda/index.php/catalog` — catálogo de microdata estilo NADA/ANDA,
  descubierto en este spike, con **17 Censos Escolares descargables en CSV**, pero cubre
  **2000-2016 únicamente** — sirve como fuente histórica, no para el corte actual que el PRD
  necesita para cruzar con inversión reciente.

**Pendiente de confirmar (siguiente paso, no descarte)**: completar la navegación del enlace
"Descargar datos del padrón" en `escale.minedu.gob.pe/uee` con el navegador (Chrome extension)
para obtener la URL directa del archivo del padrón vigente, y abrir el "Diccionario Padron 2017"
(`escale.minedu.gob.pe/documents/10156/4028089/00+Diccionario+Padron+2017.pdf`) para confirmar
si el padrón declara estado de infraestructura o solo identidad/ubicación del local.

### Social (MIDIS) — hallazgo nuevo que cambia el diseño del cruce

Además de JUNTOS por UBIGEO (confirmado: `resumen-de-hogares-afiliados-y-abonados-por-ubigeo-2025-programa-juntos`,
XLSX bimestral, existe 2023→2026), se encontró
`cobertura-de-los-programas-sociales-adscritos-al-midis-ministerio-de-desarrollo-e-inclusión`
(slug corto: INFOMIDIS) — **no estaba en el PRD ni en el ADR original**. Es un CSV mensual desde
agosto 2024, **ya agregado a nivel distrital** (1,892 filas = 1,892 UBIGEO únicos, sin registros
individuales), con columnas por programa: `JUNTOS - Hogares afiliados/abonados`,
**`PENSION 65 - Usuarios`** (conteo agregado, no listado nominal), `QALI WARMA`, `FONCODES`,
`CUNAMAS`, `CONTIGO`, `PAIS/Tambos`. Esto resuelve directamente la restricción de política de
datos del Hallazgo 3 original: **Pensión 65 sí se puede usar sin riesgo de PII, porque MIDIS ya
lo publica agregado por distrito en este dataset** — no hace falta agregarlo del lado de Rastro
ni decidir excluirlo. Recomendación: usar INFOMIDIS como fuente única de "Social" en vez de
combinar JUNTOS + Pensión 65 por separado; cubre más programas con menos trabajo de ingesta.

### Conclusión actualizada

De los 4 puntos pendientes del ADR original:
1. ✅ Resuelto — no se corrió `--full`, pero `package_list` + `package_show` dirigido dieron la
   misma confirmación con mucho menos tiempo.
2. ✅ Resuelto para Salud y Social (columnas exactas confirmadas arriba). **Parcial para
   Educación** — se confirmó que ESCALE (no PNDA) es la fuente viva correcta y que el Censo
   Educativo 2025 ya está publicado, pero falta el paso final de obtener la URL directa del
   archivo (navegación del document library de Liferay con navegador, no con `curl`) y abrir el
   diccionario de datos para confirmar si declara estado de infraestructura.
3. ✅ Resuelto — no aplica: Pensión 65 entra al alcance vía INFOMIDIS (agregado por MIDIS), sin
   necesidad de decisión de producto sobre manejo de PII.
4. Sin cambios — sigue pendiente definir si el `PndaConnector` se construye como extensión de
   `tools/ckan-indexer` o como consumidor de su output.

**Cambio de alcance recomendado para un futuro PRD ejecutable**: Salud y Social tienen fuente
confirmada y descargable hoy con URL fija (RENIPRESS mensual, INFOMIDIS mensual) — listas para
un PRD ejecutable ya. Educación tiene fuente viva confirmada (ESCALE, Censo Educativo 2025) pero
sin URL de descarga directa todavía confirmada — no es un descarte, es un spike corto de
navegador pendiente antes de comprometerla al mismo PRD. Opción recomendada: escribir el PRD
ejecutable para Salud + Social ahora, y tratar Educación como un ticket de spike de una sesión
(con navegador) antes de sumarla al alcance, en vez de bloquear todo el PRD por ese pendiente.
