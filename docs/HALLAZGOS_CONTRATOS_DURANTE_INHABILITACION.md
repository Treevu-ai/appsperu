# Hallazgos reales — contratos adjudicados durante inhabilitación vigente

> Fecha: 2026-09-19. Datos extraídos en vivo de `compras-publicas-postgres-1`
> (puerto 5433, tabla `awards`), `proveedores-sancionados-postgres-1` (puerto
> 5439, tabla `inhabilitaciones`) e `identidad-fiscal-postgres-1` (puerto
> 5438, tabla `contribuyentes`) — las tres bases encendidas para esta
> investigación (estaban apagadas). Usa el endpoint ya existente
> `GET /api/crossref` de `proveedores-sancionados` (campo
> `inhabilitadoEnFechaAdjudicacion`, `apps/proveedores-sancionados/api/src/routes/crossref.ts`)
> en vez de recalcular la lógica de solape temporal a mano.

## 1. Cómo se llegó a esto

Investigación exploratoria arrancó acotada a Lima: los 20 proveedores con
mayor monto contratado en el departamento no mostraron nada (los 20 están
`ACTIVO`/`HABIDO` en SUNAT, sin sanciones vigentes). Ampliando a los 6,676
proveedores de Lima con RUC válido en `awards`:

- **514 (7.7%)** tienen algún historial de sanción (inhabilitación o multa).
- **72** tienen una inhabilitación **vigente ahora mismo** — legalmente
  prohibidos de contratar con el Estado en este momento.

Cruzando fechas de contrato contra el período de cada inhabilitación
(`desde`/`hasta`) para esos 72, aparecieron 2 casos de solape real. **Se
verificó que no son artefacto de la muestra de Lima**: corriendo el mismo
cruce a nivel nacional (`GET /api/crossref?departamento=TODOS&soloInhabilitados=true`,
494 pares RUC+contrato con inhabilitación vigente en todo el país), **son los
únicos 2 casos en los 494** donde `inhabilitadoEnFechaAdjudicacion === true`.

## 2. Caso 1 — Estación de Servicios San José S.A.C. (RUC 20175642341)

**Doble inhabilitación vigente simultánea**, ambas por presentar
información/documentos falsos o adulterados al Estado:

| Resolución | Desde | Hasta | Infracción |
|---|---|---|---|
| 1776-2024-TCE-S3 | 2024-05-21 | 2027-05-21 | Presentar información inexacta y documentos falsos/adulterados a Entidades, Tribunal, RNP, OSCE y Perú Compras |
| 8552-2025-TCP-S3 | 2026-01-08 | 2028-01-08 | Presentar documentos falsos o adulterados a entidades contratantes, Tribunal, RNP, OECE o Perú Compras |

Es decir: **fue sancionada por segunda vez, por el mismo tipo de conducta,
mientras ya estaba inhabilitada por la primera sanción.**

**Historial completo de contratos (15, ~S/ 11.4M)**: 14 de los 15 son de
febrero-abril 2024, **antes** de que empezara la primera inhabilitación
(21-may-2024) — sin problema ahí. El contrato #15 es el que cae dentro de
**ambos** períodos de inhabilitación vigente:

> **Municipalidad Provincial de Talara - Pariñas**, S/ 2,521,300, adjudicado
> **16-jul-2026** — 2 años después de iniciada la primera inhabilitación y 6
> meses después de la segunda.

Estado tributario actual (SUNAT): ACTIVO/HABIDO. Sin vínculos societarios
disponibles (no aparece en `supplier_conformacion` — esa tabla no cubre este
RUC en la muestra actual).

## 3. Caso 2 — Laboratorios Unidos S.A. (RUC 20417180134)

| Resolución | Desde | Hasta | Infracción |
|---|---|---|---|
| 6898-2026-TCP-S1 | 2026-07-08 | 2028-07-08 | Presentar documentos falsos o adulterados a Entidades, Tribunal, RNP, OSCE o Perú Compras |

**Historial completo (2 contratos)**: el primero (S/ 96,552, ESSALUD,
26-mar-2024) es anterior a la inhabilitación. El segundo:

> **Ministerio de Salud**, S/ 600,000, adjudicado **31-ago-2026** — menos de
> 2 meses después de iniciada la inhabilitación vigente.

Estado tributario actual (SUNAT): ACTIVO/HABIDO. Mismo resultado sin vínculos
societarios disponibles.

## 4. Lectura — qué es y qué no es este hallazgo

**Lo que está verificado**: la fecha de adjudicación de estos 2 contratos
cae dentro de un período en el que la propia base de datos del Tribunal de
Contrataciones del Estado marca a estas 2 empresas como inhabilitadas para
contratar con el Estado.

**Lo que no se sabe todavía** (y por lo que esto es un hallazgo a investigar,
no una acusación cerrada):
- No se verificó si hubo un recurso/apelación en trámite que suspendiera el
  efecto de la sanción en la fecha del contrato (el Tribunal puede otorgar
  medidas cautelares).
- No se verificó si el contrato fue firmado antes de que la sanción quedara
  firme y solo se formalizó/registró después (desfase entre fecha real de
  compromiso y fecha registrada en el sistema).
- No se identificó quién en la Municipalidad de Talara o en el Ministerio de
  Salud aprobó cada contratación, ni si hubo verificación de inhabilitación
  antes de adjudicar (paso que el TUO de la Ley de Contrataciones exige a la
  entidad convocante).
- No hay datos de socios/representantes de ninguna de las 2 empresas en las
  fuentes ya ingeridas — no se puede decir todavía quién está detrás.

**Por qué vale la pena seguirlo**: contratar con un proveedor inhabilitado
vigente es una infracción que compete tanto al proveedor como,
potencialmente, a la entidad que no verificó el estado en el RNP antes de
adjudicar — es exactamente el tipo de señal que el módulo de `crossref` de
`proveedores-sancionados` fue diseñado para detectar (`inhabilitadoEnFechaAdjudicacion`,
implementado desde 2026-09-12 según el catálogo de conectores), y este es el
primer caso documentado donde el campo da `true` en una corrida real.

## 5. Qué falta para que esto sea accionable

1. **Verificar directamente en el buscador público del RNP/OSCE** que la
   inhabilitación de ambas empresas en las fechas señaladas es la versión
   vigente (sin apelación en curso) — cruce contra la fuente primaria, no
   solo la base ya ingerida.
2. **Identificar a los responsables de la adjudicación** en Municipalidad de
   Talara y MINSA para esas dos contrataciones específicas (expediente de
   contratación, no disponible en los datos ya ingeridos).
3. **Correr el mismo cruce con `soloNuevos=true` periódicamente** — el
   endpoint ya soporta vigilancia continua (`sanciones_contratos_vistos`);
   ambos casos ya estaban registrados como "vistos" desde 2026-09-13, antes
   de esta investigación — confirma que el cruce venía corriendo, pero nadie
   había filtrado específicamente por `inhabilitadoEnFechaAdjudicacion` para
   aislar estos 2 de los 494 con inhabilitación vigente en general.
4. **`minor_contracts` (contratos menores) — auditado a fondo, sin overlap,
   pero con un hueco de dato real detrás.** La corrida nacional
   (`departamento=TODOS`) ya incluye `minor_contracts` y no arrojó ningún
   caso, pero eso por sí solo no bastaba como respuesta: **`award_date` y
   `contract_date` están vacías en el 100% de las 59,372 filas de
   `minor_contracts`** — el cruce por fecha simplemente no se puede calcular
   ahí con esos campos, no es que se haya calculado y haya dado "sin
   solape".
   - Se extrajeron los proveedores de `minor_contracts` con inhabilitación
     vigente: **30 RUC distintos** (grupo separado de los 72 de `awards`,
     sin superposición).
   - Se probaron los únicos campos de fecha realmente poblados como proxy —
     `publication_date` y `quotation_end_date` (100% pobladas) — contra las
     129 filas de esos 30 proveedores: **ninguna cae dentro de su período de
     inhabilitación**, todas son anteriores al inicio de la sanción
     correspondiente.
   - Se descartaron otras posibles fuentes de fecha real: `source_timestamp`
     (100% poblada, pero es la fecha en que corrió el conector de ingesta —
     2026-09-09 en el 100% de las filas — no la fecha del contrato, habría
     sido engañoso usarla), `order_number`/`contract_number` (0% poblados),
     `status` (un solo valor, "AWARDED", en toda la tabla), y un cruce por
     `ocid` contra `awards` buscando una fecha real prestada de ahí (0
     coincidencias — son universos de datos completamente separados).
   - **Conclusión honesta**: con el mejor proxy disponible, no hay evidencia
     de solape en `minor_contracts` — pero esto es distinto a "confirmado
     que no hay ningún caso". Cerrar esto de verdad requiere que la fuente
     (SEACE/OECE) o el conector de `minor_contracts` capture la fecha real
     de adjudicación/firma, que hoy no se ingiere. Pendiente de mejora de
     dato, no de análisis.
