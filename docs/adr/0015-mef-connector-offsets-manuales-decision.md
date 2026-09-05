# ADR-0015: `mef-connector.ts` — offsets manuales de LA LIBERTAD, decisión de riesgo (CX-02)

- Estado: Aceptado — implementado en `apps/radar-ejecucion/api`.
- Fecha: 2026-09-02
- Ámbito: `apps/radar-ejecucion/api/src/ingest/mef-connector.ts` (`ingestMefFullYearForDepartamento`,
  `ingestMefFullYearForMetaDepartamento`), `mef-section-bounds.ts`.
- Origen: [`docs/PRD_Confiabilidad_Conectores_y_Cruces_v1.md`](../PRD_Confiabilidad_Conectores_y_Cruces_v1.md)
  §5 CX-02, a partir del diagnóstico completo de conectores de 2026-09-02.

## Contexto

`mef-connector.ts` trae la ejecución presupuestal (PIA/PIM/DEVENGADO) del MEF hacia
`budget_execution`, la tabla más cruzada del monorepo. El archivo fuente
(`2026-Gasto-Mensual.csv`) pesa ~6.2 GB y no es paginado — el conector no lo procesa completo
en streaming (ver `TODO antes de producción` en el propio código, línea 23), sino que descarga
ventanas de bytes acotadas con HTTP Range.

Dos de las tres funciones de ingesta (`ingestMefFullYearForDepartamento`,
`ingestMefFullYearForMetaDepartamento`) dependen de **offsets de byte observados manualmente**
(`SECTION_OFFSETS_LA_LIBERTAD`, `SECTION_NIVEL_MES_BOUNDS`, `NACIONAL_MES_START_BYTE`),
calibrados escaneando el archivo real el 2026-08-21/22 contra un tamaño total confirmado de
**6,240,885,549 bytes** (`NACIONAL_FILE_END_BYTE`). Estos offsets no están garantizados por el
MEF — si el archivo cambia de tamaño u orden interno, las ventanas pueden dejar de contener las
filas esperadas.

**Consumidores del cruce** (verificado contra `docs/conectores.md#mapa-de-cruces-entre-apps`):
`budget_execution` es consultada en vivo por `actividad-agraria` (`GET /api/crossref`,
FUNCION=AGROPECUARIA), `seguridad-ciudadana` (`GET /api/crossref`, FUNCION=ORDEN PUBLICO Y
SEGURIDAD), `radar-ejecucion` mismo vía `GET /api/tourism/crossref` (FUNCION=TURISMO),
`compras-publicas` (`entity_crosswalk` mef↔oece), `radar-inversiones` (`SEC_EJEC` exacto),
`identidad-fiscal` (`GET /api/crossref/entidades`, fuzzy) y `ceplan-geo`/`ceplan-estrategico`
(vía HTTP). Si `budget_execution` queda desactualizada o incompleta sin que nadie lo note, los
siete cruces heredan el error en silencio — cada uno seguiría respondiendo 200 con cifras
potencialmente equivocadas, no con un error visible.

## Alternativas consideradas

1. **Completar streaming real** — reescribir el conector para parsear el CSV completo por
   chunks en vez de ventanas fijas, eliminando la dependencia de offsets calibrados a mano de
   raíz. Elimina el riesgo en el origen, pero es una reescritura mayor (esfuerzo L) sobre un
   archivo de 900+ líneas que ya maneja casos delicados y confirmados en vivo (PIA/PIM y
   DEVENGADO en filas separadas, orden Regional→Local→Nacional, MES_EJE descendente). El
   riesgo de introducir una regresión sutil en esa reescritura es real y no trivial de detectar.
2. **Offsets manuales + monitoreo activo (elegida)** — mantener el enfoque actual, pero agregar
   una señal temprana y verificable de que los offsets pueden haberse invalidado, sin tocar la
   lógica de descarga/filtrado ya calibrada y probada en vivo.
3. **Aceptar el riesgo sin monitoreo** — dejar el `TODO` como documentación pasiva. Descartada:
   no agrega ninguna protección nueva, solo mueve el texto de un comentario de código a un ADR.

## Decisión

**Offsets manuales + monitoreo activo.** Se agrega `assertMefFileSizeWithinTolerance()` en
`mef-connector.ts`, que corre al inicio de `ingestMefFullYearForDepartamento` y de
`ingestMefFullYearForMetaDepartamento`:

1. `fetchMefFileTotalBytes(filename)` pide `Range: bytes=0-0` y lee `Content-Range:
   bytes 0-0/<total>` para conocer el tamaño real del archivo sin descargarlo.
2. Se compara contra `NACIONAL_FILE_END_BYTE` (6,240,885,549 — el tamaño confirmado la última
   vez que se calibraron los offsets).
3. Si la deriva excede **2%** (tolerancia elegida porque el archivo crece mes a mes dentro del
   año fiscal por nuevas filas de ejecución, no es un tamaño fijo), la ingesta **falla fuerte**
   con un mensaje que nombra exactamente qué offsets pueden estar desactualizados y enlaza a
   este ADR — mismo principio "falla fuerte, no en silencio" que ya aplica el resto del archivo.
4. `MEF_ALLOW_SIZE_DRIFT=true` degrada el error a advertencia (`console.warn`), para corridas
   donde el archivo cambió a propósito (ej. justo después de recalibrar los offsets) sin
   bloquear la ingesta con el mismo chequeo que detectó el cambio.

No se implementa (todavía) el modo de streaming completo. Si en el futuro el volumen de trabajo
o la frecuencia de recalibración lo justifican, la Alternativa 1 sigue siendo válida — este ADR
no la descarta, solo no la ejecuta ahora.

## Consecuencias

- Ninguna ventana de bytes cambia; el comportamiento de ingesta exitosa es idéntico al de antes
  de este ADR. El único cambio observable es una llamada HTTP adicional (1 byte) al inicio de
  cada corrida de las dos funciones afectadas, y un nuevo modo de falla explícito si el tamaño
  del archivo se movió más del 2%.
- Si el MEF cambia el archivo (nuevo año fiscal, reordenamiento, u otro motivo), la primera
  corrida después del cambio falla con un mensaje accionable en vez de insertar silenciosamente
  datos de un departamento equivocado o filas vacías interpretadas como "sin ejecución".
- Recalibrar los offsets sigue siendo un proceso manual (escanear el archivo real) — este ADR
  no lo automatiza, solo hace más barato detectar que hace falta recalibrar.
- Pruebas nuevas en `apps/radar-ejecucion/api/src/__tests__/mef-connector-file-size-drift.test.ts`
  cubren: tamaño coincidente, deriva dentro de tolerancia, deriva fuera de tolerancia (falla),
  y el escape hatch `MEF_ALLOW_SIZE_DRIFT=true` (degrada a advertencia). No requieren base de
  datos — mockean `fetch` y los módulos de pool.

## Referencias

- Ticket: [`docs/TICKETS_Confiabilidad_Conectores_y_Cruces_v1.md#CX-02`](../TICKETS_Confiabilidad_Conectores_y_Cruces_v1.md)
- Ficha del conector: [`docs/conectores.md#radar-ejecucion`](../conectores.md#radar-ejecucion)
- ADR-0006 (offsets de LA LIBERTAD y del bloque Nacional, contexto original de la calibración)
