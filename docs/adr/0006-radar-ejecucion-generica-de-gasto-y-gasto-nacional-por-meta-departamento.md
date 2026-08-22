# ADR-0006: `radar-ejecucion` — clasificación económica del gasto (genérica) y gasto de Gobierno Nacional dirigido a un departamento (caso Reconstrucción con Cambios / ANIN en La Libertad)

> **Actualización 2026-08-22 — Decisión 2 implementada y verificada con datos reales.**
> `ingestMefFullYearForMetaDepartamento` (nueva función en `mef-connector.ts`) corrió contra el
> archivo real y confirmó el hallazgo que motivó este ADR: **AUTORIDAD NACIONAL DE
> INFRAESTRUCTURA - ANIN** aparece como la entidad #1 por devengado dirigido a La Libertad
> (**S/311.3M**, 87.6% de eso bajo `ADQUISICION DE ACTIVOS NO FINANCIEROS` — inversión real —
> clasificada bajo la función ORDEN PUBLICO Y SEGURIDAD, no AGROPECUARIA ni una etiqueta obvia de
> reconstrucción). Total: **90 entidades nacionales distintas**, **S/1,848.1M de devengado** y
> **S/3,359.3M de PIM** dirigidos a La Libertad desde Gobierno Nacional, 278 filas
> (desagregadas por `generica`, ver Decisión 1 abajo) — completamente invisibles en
> `budget_execution` antes de esta corrida. Para la función AGROPECUARIA específicamente (la
> que ya cruza `actividad-agraria`, ver ADR-0008): PIM nacional S/191.6M + devengado S/58.9M
> (10 entidades) se suman a los S/249.3M/S/95.2M que ya se veían de GR/GL — **~35% más de PIM
> agropecuario real del que el dato mostraba hasta ayer**.
>
> **Corrección 2026-08-22 (mismo día)**: las primeras cifras reportadas aquí y en PR #16
> (S/1,936.1M devengado, ANIN S/272.9M, AGROPECUARIA nacional S/65.0M) estaban contaminadas por
> 37 filas de una tabla de pruebas de 2026-08-16 (`meta_departamento='LA LIBERTAD'`,
> `generica IS NULL`) que nunca se habían limpiado — al sumar sin filtrar por `generica` antes
> de aplicar la migración 004, esas filas se mezclaban con el resultado real. Se identificó al
> notar que el total no cuadraba tras desagregar por generica (Decisión 1), se depuraron las
> filas viejas (`DELETE ... WHERE meta_departamento='LA LIBERTAD' AND generica IS NULL`) y se
> confirmaron los montos limpios arriba. El PIM no se afectó (la tabla de pruebas tenía PIM=0 en
> todas sus filas). Lección: cualquier suma sobre `budget_execution` sin filtrar por
> `generica`/`meta_departamento` explícitos puede arrastrar datos de pruebas anteriores si la
> tabla no se limpia entre iteraciones de desarrollo — no hay ambiente de staging separado del
> de desarrollo en este proyecto.
>
> Tres problemas de implementación reales encontrados y resueltos en el
> camino (documentados en el código): (1) las filas dirigidas a un departamento están
> *dispersas* en el bloque Nacional, no contiguas — obligó a descargar cada sección de mes
> COMPLETA (~150-330 MB) en vez de una ventana angosta con lookback; (2) la sección `mes=0`
> (311 MB) excedía el límite de Postgres para strings JSONB (268,435,455 bytes) — se resolvió
> guardando solo las filas ya filtradas en el lake de evidencia, no la sección cruda completa;
> (3) las entidades de Gobierno Nacional nunca habían sido sembradas en `entities` por ningún
> otro conector — se agregó `upsertEntity`/`upsertTerritoryFromMef` al loop de escritura final,
> ausente en el diseño original de este ADR. Detalle completo de los 3 hallazgos en los
> comentarios de `mef-connector.ts` (`saveFilteredBatch`, `NACIONAL_MES_START_BYTE`, el upsert
> de entidades antes del INSERT final).
>
> **La Decisión 1 (genérica de gasto) también quedó implementada el mismo día** (migración
> `004_generica_gasto.sql`, campo agregado a `field-mapping.ts`/`normalize.ts`, clave de
> agregación de `budget_execution` ahora incluye `generica`). Confirmó en vivo el hallazgo de
> ANIN: 87.6% de su gasto en La Libertad (S/272.9M de S/311.3M) es
> `ADQUISICION DE ACTIVOS NO FINANCIEROS` (inversión real), no personal ni bienes y servicios —
> la función "ORDEN PUBLICO Y SEGURIDAD" realmente esconde una inversión de capital, confirmado
> con la desagregación económica, no solo inferido del nombre de la entidad. Búsqueda de
> patrones similares en las otras 89 entidades (2026-08-22): **ningún otro caso a la escala de
> ANIN** — el resto de entidades caen bajo funciones institucionalmente coherentes (salud bajo
> SALUD, universidades bajo EDUCACION, programas MIDIS bajo PROTECCION SOCIAL, PNP/Ejército bajo
> ORDEN PUBLICO/DEFENSA, esto último esperable, no "escondido"). Sí hay un patrón secundario más
> leve: SUNAT, SUNARP, RENIEC y Contraloría (S/62.5M combinado) caen bajo la función genérica
> "PLANEAMIENTO, GESTION Y RESERVA DE CONTINGENCIA" — no es gasto mal etiquetado como ANIN, pero
> sí es una función "cajón de sastre" que agrupa control/administración pública sin que el
> nombre de la función lo sugiera, dificultando encontrarlo por búsqueda temática.

## Contexto

Al revisar qué otra data pública digerible falta para el piloto de La Libertad, surgieron dos
candidatos que en un principio parecían fuentes nuevas mayores: (1) desagregar el gasto por
categoría económica (personal vs. bienes y servicios vs. inversión) y (2) sumar el presupuesto
de reconstrucción post-Niño costero/Yaku que hoy ejecuta la ANIN (Autoridad Nacional de
Infraestructura, sucesora de la ARCC). Investigación en vivo (2026-08-21) mostró que **ninguna
de las dos requiere una fuente externa nueva**:

1. **Genérica de gasto**: el mismo CSV de "Presupuesto y ejecución de gasto" del MEF que ya
   consume `mef-connector.ts` trae la clasificación económica completa (`GENERICA`,
   `GENERICA_NOMBRE`, `SUBGENERICA`, `SUBGENERICA_NOMBRE`, ... hasta `ESPECIFICA_DET_NOMBRE`),
   confirmado contra `Gastos_Diccionario.csv` en vivo. Hoy `radar-ejecucion` solo usa
   `FUNCION`/`FUNCION_NOMBRE`; nunca lee estas columnas.

2. **ANIN / Reconstrucción con Cambios**: el propio Portal de Transparencia Estándar de la ANIN
   (`id_entidad=78976`) no publica un dataset propio de proyectos — sus dos únicos enlaces de
   "Proyectos" redirigen a **Invierte.pe** (ya ingerido por `radar-inversiones`) e **INFOBRAS**
   (ya ingerido por `infobras`). No hay API ni export propio de ANIN que agregar. El gap real
   es otro, y ya está **documentado en el propio código** de `radar-ejecucion`
   (`mef-connector.ts`, comentario junto a `SECTION_OFFSETS_LA_LIBERTAD`): la ingesta
   comprensiva de año completo (`ingestMefFullYearForDepartamento`) solo cubre Gobiernos
   Regionales y Locales **con sede en La Libertad**, y **excluye explícitamente Gobierno
   Nacional** ("no hay entidades con sede en La Libertad en ese nivel"). Como la ANIN (igual
   que MTC Provías, MINSA, MIDIS, etc.) tiene sede en Lima pero ejecuta gasto físicamente en La
   Libertad, ese gasto es invisible en `budget_execution` hoy — aunque el schema ya tiene la
   columna para filtrarlo (`meta_departamento`, migraciones `002`/`003`) y el conector base
   (`ingestMefBudgetExecution`, no el full-year) ya sabe filtrar por `DEPARTAMENTO_META` en una
   sola ventana de bytes. Lo que falta es la versión **comprensiva** de esa ingesta —
   equivalente a `ingestMefFullYearForDepartamento` pero para Gobierno Nacional filtrado por
   `DEPARTAMENTO_META` en vez de por sede.

En otras palabras: no hace falta una app `anin` nueva ni un ADR de app standalone (patrón de
ADR-0002/0003) — es una ampliación de `radar-ejecucion`, misma fuente MEF, mismo patrón de
ingesta ya validado.

## Decisión 1 — Ingerir `GENERICA`/`GENERICA_NOMBRE`

Agregar la clasificación económica de primer nivel (genérica: personal, bienes y servicios,
inversión, etc.) a `budget_execution`, sin llegar a específica/subespecífica (demasiado
granular para el caso de uso actual — "cuánto del gasto es planilla vs. inversión" alcanza con
genérica).

### Cambio de schema

```sql
-- 004_add_generica.sql
ALTER TABLE budget_execution ADD COLUMN IF NOT EXISTS generica TEXT;
ALTER TABLE budget_execution ADD COLUMN IF NOT EXISTS generica_nombre TEXT;

-- La agregación pasa de (entity_code, funcion, anio_fiscal) a incluir generica.
-- Sin este cambio, sumar genéricas distintas bajo la misma fila las mezclaría
-- (mismo error de fondo que agregar sin separar MES_EJE=0 de MES_EJE 1-7, ver
-- el hallazgo de PIM=0 documentado en el data contract).
ALTER TABLE budget_execution DROP CONSTRAINT budget_execution_entity_code_funcion_anio_fiscal_fecha_cort_key;
-- recrear con generica incluida (mismo patrón que 003_fix_meta_departamento_uniqueness.sql,
-- usar COALESCE(generica, '') para no romper filas ya ingeridas sin este campo)
```

### Cambio de ingesta

`field-mapping.ts` agrega `generica: "GENERICA"` y `genericaNombre: "GENERICA_NOMBRE"`.
`normalizeMefRows` agrupa por `(SEC_EJEC, FUNCION, GENERICA, ANO_EJE)` en vez de
`(SEC_EJEC, FUNCION, ANO_EJE)`. **No requiere volver a descargar nada** — las columnas ya vienen
en las mismas secciones/offsets que hoy se descargan para La Libertad
(`SECTION_OFFSETS_LA_LIBERTAD`); es un cambio de qué columnas se leen y por qué se agrupa, no de
qué bytes se piden.

### API

`GET /api/execution` acepta un query param opcional `generica` (código, ej. `"2.1"` = personal).
Sin el filtro, se mantiene el comportamiento actual (suma todas las genéricas, como hoy).

## Decisión 2 — Ingesta comprensiva de Gobierno Nacional por `DEPARTAMENTO_META`

Nueva función `ingestMefFullYearForMetaDepartamento`, paralela a
`ingestMefFullYearForDepartamento` pero:
- Filtra por `DEPARTAMENTO_META_NOMBRE = "LA LIBERTAD"` en vez de por
  `DEPARTAMENTO_EJECUTORA_NOMBRE`.
- Recorre solo las secciones de `NIVEL_GOBIERNO_NOMBRE = "GOBIERNO NACIONAL"` × 8 meses (no 16
  secciones — GR/GL no cambian, ya están cubiertas por la función existente).
- Necesita sus propios offsets de byte (`SECTION_OFFSETS_GN_META_LA_LIBERTAD`), escaneados en
  vivo la primera vez que se implemente — los offsets de `SECTION_OFFSETS_LA_LIBERTAD` no
  aplican (son de otra sección del archivo, GR/GL, no GN).
- Persiste con `meta_departamento = 'LA LIBERTAD'` (columna ya existe, migración `002`) y
  `entity_code`/`generica` del Gobierno Nacional real (ej. ANIN, MTC-Provías, MINSA) — no se
  inventa una "entidad ANIN agregada"; cada fila sigue siendo por `SEC_EJEC` real.

### Identificación de Reconstrucción con Cambios

No hay un campo `PROGRAMA_PRESUPUESTAL`/`FUENTE_FINANCIAMIENTO` confirmado aún en el diccionario
para aislar específicamente "Reconstrucción con Cambios" de otro gasto nacional dirigido a La
Libertad — **pendiente de confirmar en vivo** contra el diccionario completo (64 columnas, solo
16 confirmadas hasta ahora). Alternativa inmediata sin depender de ese campo: filtrar
`EJECUTORA_NOMBRE ILIKE '%RECONSTRUCCION%'` o `ILIKE '%AUTORIDAD NACIONAL DE INFRAESTRUCTURA%'`
sobre las filas ya ingeridas por `DEPARTAMENTO_META`. Esto separa "Reconstrucción/ANIN" de
"MTC/MINSA/MIDIS ejecutando en La Libertad" sin ingesta adicional — es un filtro sobre datos que
la Decisión 2 ya trae.

## Alternativas consideradas

**App `anin` standalone (patrón ADR-0002/0003)** — descartada. No existe una fuente propia de
ANIN que justifique un conector nuevo; su propio portal de transparencia reexporta Invierte.pe
e INFOBRAS, ya ingeridos. Construir una app nueva sería duplicar datos que ya tenemos, con el
costo de mantenimiento de una app más (Postgres, API, migraciones) sin dato adicional real.

**Scraping directo del sitio de ANIN (`gob.pe/anin`)** — descartada por la misma razón: no hay
dataset propio detrás, solo páginas de noticias/institucionales.

**Específica/subespecífica de gasto en vez de solo genérica** — descartada para este alcance:
genérica (7-8 categorías) ya responde la pregunta de negocio ("cuánto es planilla vs.
inversión"); específica añade cientos de códigos sin un caso de uso concreto todavía.

## Consecuencias

### Positivas
- Cierra un blind spot real y ya documentado en el propio código (no especulativo): gasto
  nacional ejecutado en La Libertad, incluida reconstrucción post-desastre, es hoy invisible.
- Cero fuentes nuevas que mantener — mismo CSV, mismo patrón de ingesta, mismo schema
  extendido de forma aditiva (columnas nuevas, no tablas nuevas).
- `generica`/`generica_nombre` es reusable por cualquier función (no solo SALUD ni La Libertad).

### Negativas
- Los offsets de byte de la sección GN son manuales y frágiles, igual que
  `SECTION_OFFSETS_LA_LIBERTAD` hoy — requieren re-escaneo si el MEF reordena el archivo entre
  años.
- Cambiar la clave de agregación de `budget_execution` (agregar `generica`) rompe la unicidad
  actual — necesita migración de constraint, no solo `ALTER TABLE ADD COLUMN`, y re-ingesta de
  los datos ya cargados para poblar el campo (las filas existentes quedarían con
  `generica IS NULL`, agregadas "a ciegas" de esa dimensión, hasta que se re-corra la ingesta).
- El filtro por nombre de entidad para "Reconstrucción con Cambios" es un patrón de matching
  frágil (mismo tipo de fragilidad que el matcher difuso de `compras-publicas`), no una columna
  dedicada — puede haber falsos negativos si `EJECUTORA_NOMBRE` no incluye ese texto para todas
  las obras de reconstrucción.

## Pendiente antes de implementar

1. Escanear `Gastos_Diccionario.csv` completo (64 columnas) para confirmar si existe
   `PROGRAMA_PRESUPUESTAL`/`FUENTE_FINANCIAMIENTO` — mejoraría la identificación de
   Reconstrucción con Cambios sin depender de matching de texto sobre el nombre de entidad.
2. Escanear en vivo `2026-Gasto-Mensual.csv` para obtener `SECTION_OFFSETS_GN_META_LA_LIBERTAD`
   (mismo método que se usó para `SECTION_OFFSETS_LA_LIBERTAD`, documentado en
   `docs/data-contracts/mef-presupuesto-ejecucion.md`).
3. Decidir si la migración de `budget_execution` (agregar `generica` a la clave de unicidad)
   justifica versionar `budget_execution` o basta con re-ingestar sobre la tabla existente.

## Referencias

- Data contract actualizado: `docs/data-contracts/mef-presupuesto-ejecucion.md`
- Código relevante: `apps/radar-ejecucion/api/src/ingest/mef-connector.ts` (comentario junto a
  `SECTION_OFFSETS_LA_LIBERTAD`, función `ingestMefBudgetExecution` con filtro por
  `DEPARTAMENTO_META`), `apps/radar-ejecucion/api/src/db/migrations/002_meta_departamento.sql`
- ADR-0001: Modelo canónico
