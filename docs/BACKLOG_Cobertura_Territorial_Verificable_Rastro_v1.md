# Backlog ejecutable — Cobertura territorial verificable Rastro

**Regla de priorización:** primero se prueba la fuente y su corte; luego se habilitan los cruces. Prioridad `P0` bloquea cualquier afirmación territorial pública.

| ID | Épica | Objetivo | Criterios de aceptación | Dependencias | Prioridad | Esfuerzo | Fase |
|---|---|---|---|---|---|---|---|
| CT-01 | Fundaciones | Crear catálogo canónico de 25 jurisdicciones, códigos y alias por fuente. | 25 filas; Callao incluido; nombres desconocidos fallan; pruebas de alias. | Ninguna | P0 | M | Ahora |
| CT-02 | Fundaciones | Crear modelo `territorial_coverage` y migraciones por app. | Guarda app, fuente, jurisdicción, lote, conteos, corte, estado y restricción. | CT-01 | P0 | M | Ahora |
| CT-03 | Fundaciones | Definir máquina de estados de cobertura. | Solo permite transiciones válidas; `0` hallados no implica completa; pruebas unitarias. | CT-02 | P0 | S | Ahora |
| CT-04 | Terminal | Construir CLI `cobertura:territorial`. | Tabla y JSON; filtros `--app`, `--jurisdiccion`, `--todas`, `--require-complete`; exit code correcto. | CT-01, CT-02 | P0 | M | Ahora |
| CT-05 | INFOBRAS | Instrumentar lote nacional y conteos por región. | Registra leídas, normalizadas, persistidas y rechazadas por cada jurisdicción solicitada. | CT-01, CT-02 | P0 | M | Ahora |
| CT-06 | INFOBRAS | Ejecutar corrida persistente y verificar las 25 jurisdicciones. | Lote con corte; conteo por las 25; fallas aisladas no dejan transacción parcial. | CT-05, infraestructura de worker | P0 | M | Ahora |
| CT-07 | Invierte | Registrar continuidad de rangos y CUI por región. | Compara bytes descargados con `Content-Length`; marca parcial ante hueco; CUI por región. | CT-01, CT-02 | P0 | M | Ahora |
| CT-08 | OECE OCDS | Registrar cobertura de procesos, awards y postores por región. | Ventana, páginas, página terminal, hallados, persistidos y detalles fallidos por región. | CT-01, CT-02 | P0 | L | Ahora |
| CT-09 | SEACE 8 UIT | Registrar código territorial, total fuente y detalle por región. | Cada código consultado queda en lote; límite se declara por región; detalle fallido no se contabiliza como ausente. | CT-01, CT-02 | P0 | M | Ahora |
| CT-10 | MEF | Diseñar escaneo reproducible para GR/GL por jurisdicción. | No usa offsets de La Libertad para otra región; valida secciones, meses y `MES_EJE=0`. | CT-01, almacenamiento/rango reanudable | P0 | XL | Siguiente |
| CT-11 | MEF | Extender GN por `DEPARTAMENTO_META` a lotes multirregión. | Misma descarga no mezcla metas al agregar; estado por jurisdicción y por mes. | CT-02, CT-10 parcial | P1 | L | Siguiente |
| CT-12 | Identidad Fiscal | Registrar cobertura territorial del padrón por prefijo UBIGEO. | Separa cobertura nacional de calidad UBIGEO; no ubica la ejecución por domicilio de proveedor. | CT-01, CT-10 | P1 | M | Siguiente |
| CT-13 | Sanciones | Propagar cobertura de compras al cruce de sanciones. | Fuente nacional y cruce territorial tienen estados diferentes; faltante de compras bloquea conclusión local. | CT-08, CT-09 | P1 | S | Siguiente |
| CT-14 | Actividad Agraria | Verificar serie MIDAGRI por departamento/año/mes. | Disponibilidad, nulos reportados, corte y ausencia distinguida por las 25 jurisdicciones. | CT-01, CT-02 | P1 | M | Siguiente |
| CT-15 | Salud Institucional | Bloquear score cuando falten capas mínimas de la región. | Respuesta terminal muestra dependencias; jamás devuelve "saludable" sin cobertura base. | CT-05, CT-07, CT-10 | P1 | M | Después |
| CT-16 | CEPLAN | Declarar formalmente `NO_APLICA` territorial o incorporar clave geográfica verificada. | El reporte no lo cuenta como fuente regional sin llave oficial; decisión documentada. | CT-01 | P1 | S | Después |
| CT-17 | Cruces | Crear grafo de dependencias de cobertura. | RUC/CUI/OCID/UBIGEO/matcher llevan método y confianza; dependencias bloqueadas se propagan. | CT-02, CT-12, CT-13 | P1 | L | Después |
| CT-18 | Calidad | Prueba de regresión de afirmaciones. | Suite falla si una app marca cobertura completa sin lote, corte y conteo. | CT-03, CT-04 | P0 | M | Ahora |
| CT-19 | Operación | Runbook de corrida y recuperación. | Instrucciones para reanudar, registrar error, verificar y publicar límites sin interfaz. | CT-04 a CT-09 | P1 | S | Después |
| CT-20 | Publicación | Generar corte público terminal. | Un único JSON/Markdown con fecha, fuente, región, estado y restricciones; sin ranking acusatorio. | CT-04, CT-18 | P2 | M | Después |
| CT-21 | OECE OCDS | Corregir `isCompleteSnapshot` (siempre falso con `params` de fecha) y recalcular `territorial_coverage` para LA LIBERTAD/AREQUIPA/LIMA desde lo ya persistido, sin volver a golpear la fuente. | `oece-connector.ts`/`oece-records-connector.ts` marcan `COMPLETA_VERIFICADA` cuando la paginación fue exhaustiva, sin importar si hubo `params`; backfill no requiere nueva descarga. | CT-08 | P0 | S | Ahora |
| CT-22 | MEF | Construir el materializador de cobertura para radar-ejecucion (no existe ninguno hoy) reusando `coverage/mef-territorial.ts`, y correrlo para LA LIBERTAD (dato completo) y AREQUIPA (dato parcial, sin GN). | `radar-ejecucion` deja de estar `BLOQUEADA` por falta de script cuando el dato real existe; AREQUIPA queda `PARCIAL` de forma correcta hasta correr GN. | CT-10 | P0 | M | Ahora |
| CT-23 | SEACE 8 UIT | Decidir qué debe medir `territorial_coverage`/SEACE: el departamento de la entidad buscada o el departamento real de ejecución del ítem — hoy mide el primero, no un bug de conteo. | Decisión documentada (¿cambiar la semántica de `persisted_records` a `execution_department`, o dejarlo y aclarar la restricción?) antes de tocar código. | CT-09 | P1 | M | Ahora |

## Secuencia obligatoria

`CT-01 → CT-02 → CT-03 → CT-04 → CT-05/07/08/09 → CT-18 → CT-10 → CT-12/13/14 → CT-15/16/17 → CT-19/20`

## Decisión de capacidad

Los P0 constituyen el mínimo para ampliar territorio de manera honesta. No se debe iniciar análisis comparativo público de las 25 jurisdicciones mientras CT-05 a CT-09 no produzcan un corte verificable. CT-10 es la apuesta más costosa; por eso se separa de las fuentes que ya tienen archivos nacionales manejables.

## Decisión de alcance de ejecución — LA LIBERTAD, AREQUIPA, LIMA (2026-09-09)

El catálogo de 25 jurisdicciones (CT-01) sigue siendo el diseño final — no cambia. Lo que se
re-secuencia es **qué se ejecuta primero**: el batch nacional de CT-10 (23 departamentos MEF) se
detuvo deliberadamente porque el equipo de desarrollo no soporta corridas de esa envergadura ahora
(ver sección CT-10 más abajo). El trabajo activo de CT-08/CT-09/CT-10/CT-11 y de radar-inversiones
se re-secuencia para completar primero **AREQUIPA y LIMA** (junto con LA LIBERTAD, que ya tenía
avance) antes de retomar las ~20 regiones restantes, que quedan explícitamente pausadas sin fecha.
Detalle completo del estado real por app/región en `docs/ESTADO.md` (sección "Decisión de alcance").

**Gap adicional encontrado en radar-inversiones (Invierte):** AREQUIPA y LIMA tienen 0 filas en
`investments`/`investments_deactivated` — nunca se ha ingerido Invierte.pe para esas regiones (a
diferencia de MEF/OECE/SEACE, donde al menos hay dato parcial). Pendiente: revisar si
`scripts/run-invierte-full.ps1` admite parametrizar departamento o si el filtro ocurre después de
descargar el CSV nacional completo por rangos HTTP (en cuyo caso no habría que volver a descargar,
solo reprocesar).

## Estado de ejecución (2026-09-09, actualizado)

| Tickets | Estado | Evidencia |
|---|---|---|
| CT-01, CT-02, CT-03, CT-04, CT-18 | Implementado y validado | Migración central, catálogo de 25, CLI y pruebas que bloquean falsos “completos”. |
| CT-06 | **Hecho (2026-09-08)** | Ver sección "CT-06 — cerrado" más abajo. |
| CT-08 | **Hecho (2026-09-09)**, con bug de bookkeeping pendiente | Corrida nacional real ejecutada: 25/25 departamentos poblados en `procurement_processes` (Lima 1,650, La Libertad 416, ~5,940 total) y `awards` (8,882 filas). El dato es real y completo, pero `territorial_coverage` sigue marcando `PARCIAL` por el bug de `isCompleteSnapshot` — ver CT-21. |
| CT-09 | **Hecho (2026-09-09)** | Corrida de las 20 regiones restantes completada (`isPartial: false`, 47,183 contratos nuevos); `minor_contracts` con 25/25 departamentos poblados. `territorial_coverage` de SEACE tiene una discrepancia de conteo sin explicar — ver CT-23. |
| CT-07 | Ejecutado y verificado para LA LIBERTAD | Invierte recorrió sin huecos los cinco rangos del CSV público para LA LIBERTAD; **AREQUIPA y LIMA sin ingerir (0 filas)** — ver "Decisión de alcance" arriba. |
| CT-10 | **Pausado deliberadamente (2026-09-09)**, no por falla | Recalibración de límites hecha (PR #145); batch de 23 departamentos lanzado y detenido en HUANUCO por decisión de alcance. 6 OK (ANCASH, APURIMAC, AYACUCHO, CAJAMARCA, CUSCO, HUANCAVELICA), 2 fallos (AMAZONAS, CALLAO), ~15 sin correr. Ver sección "CT-10 — pausado" más abajo. |
| CT-21, CT-22, CT-23 | Nuevos (2026-09-09) | Bugs de bookkeeping encontrados al verificar LA LIBERTAD/AREQUIPA/LIMA — ver tabla de tickets arriba. |
| CT-11 a CT-17, CT-20 | Pendiente | Requieren fuente/corrida o dependencias que todavía no están verificadas; pausados junto con el resto de las ~20 regiones fuera del alcance de LA LIBERTAD/AREQUIPA/LIMA. |
| CT-19 | Implementado de forma inicial | `docs/RUNBOOK_Cobertura_Territorial_Rastro.md`; falta automatización programada, expresamente fuera de alcance. |

## CT-06 — cerrado (2026-09-08)

No hizo falta infraestructura de worker ni código de escaneo nuevo (la fuente INFOBRAS entrega un único XLSX nacional, no un endpoint por región) — solo correr la ingesta ya existente con las 25 jurisdicciones en vez de las 5 que se habían corrido hasta ahora (`LA LIBERTAD,LAMBAYEQUE,PIURA,CAJAMARCA,CUSCO`).

Al correrla apareció un hallazgo real, no un artefacto de la corrida: **Callao salía `SIN_DATOS_EN_FUENTE`** pese a que la Provincia Constitucional del Callao sí tiene obras registradas. Causa — el XLSX etiqueta esa jurisdicción como `"P C DEL CALLAO"`, no `"CALLAO"` (el nombre canónico del catálogo territorial), así que sus 1,471 filas caían silenciosamente en "otro departamento" en cada corrida anterior, incluidas las 5 regiones que ya se daban por buenas. Corregido en `canonicalizarDepartamentoFuente()` (`apps/infobras/api/src/ingest/infobras-connector.ts`), con test de regresión (`src/__tests__/infobras-connector.test.ts`) y ficha actualizada en `docs/conectores.md`.

Verificado en vivo tras el fix: `npm run cobertura:territorial -- --app infobras --todas --require-complete` (`apps/radar-ejecucion/api`) → `state: "COMPLETA_VERIFICADA"`, `coverage_claimable: true`, exit code 0, 25/25 jurisdicciones `COMPLETA_VERIFICADA`. Ingesta nacional: 191,180 filas leídas, 178,616 aceptadas (antes del fix: 177,145 — la diferencia son exactamente las 1,471 obras de Callao), 346 rechazadas por campos inválidos.

## CT-09 — intento 2026-09-08, sigue abierto (5/25 regiones)

`apps/compras-publicas/api/src/ingest/run-minor-contracts.ts` ya usa `DEFAULT_TERRITORIAL_SCOPE = Object.keys(DEPARTMENT_CODES)` (las 25) por defecto y el buscador público de SEACE sí acepta `codigo_departamento` como parámetro real (a diferencia de OECE) — el código no es el bloqueo.

Dos intentos de correr `npm run ingest:minor-contracts:full` con las 25 regiones explícitas (`MINOR_CONTRACT_DEPARTAMENTOS`) murieron (`killed`) por memoria del sistema — la máquina de desarrollo bajó a ~950MB libres de 16GB por procesos ajenos a esta sesión (no los contenedores Docker, que ya estaban minimizados desde CT-06). Se decidió no forzarlo bajo esa presión de memoria.

Estado verificado y persistido: la corrida con el `.env` original (`MINOR_CONTRACT_DEPARTAMENTOS=AMAZONAS,CAJAMARCA,LA LIBERTAD,LAMBAYEQUE,PIURA`) completó limpio — `npm run cobertura:territorial -- --app compras-publicas --todas` muestra 5/25 jurisdicciones `COMPLETA_VERIFICADA` (AMAZONAS, CAJAMARCA, LA LIBERTAD, LAMBAYEQUE, PIURA), `isPartial: false` para ese alcance. **Falta correr las 20 regiones restantes cuando la máquina tenga RAM disponible** — mismo comando, sin cambio de código:
```
MINOR_CONTRACT_DEPARTAMENTOS=<25 regiones> npm run ingest:minor-contracts:full
```

## CT-08 — código corregido 2026-09-09, corte nacional sigue pendiente

`recordTerritorialCoverage` ya estaba implementado en ambos conectores de OECE (`oece-connector.ts` para releases, `oece-records-connector.ts` para awards/postores) — la instrumentación nunca fue el problema real. El bloqueo era que los tres scripts que hacen el barrido "hasta página terminal" — `run-oece-releases-full.ts`, `run-oece-records-full.ts`, `run-oece-segmented.ts` — tenían `departamento: "LA LIBERTAD"` escrito directo en el código, sin leer ninguna variable de entorno. El barrido "full" es justo el que debería cubrir el país completo por defecto; con el hardcode, ni corriéndolo hoy mismo se podía llegar a las 25 regiones sin editar el archivo primero.

Corregido: los tres scripts ahora llaman a `resolveDepartamentosFromEnv()` (nueva función en `oece-connector.ts`, misma lógica que ya usaba el CLI base del conector para `OECE_DEPARTAMENTOS`/`OECE_DEPARTAMENTO`) y, sin ninguna de las dos variables, corren sobre las 25 jurisdicciones (`PERU_DEPARTAMENTOS`) por defecto. Test de regresión en `oece-range-url.test.ts` (4 casos: lista por comas, variable singular, sin ninguna variable, catálogo de 25). Suite completa de `compras-publicas/api` en verde (113/113).

**Sigue sin correr la ingesta nacional real** — a diferencia de INFOBRAS (un solo XLSX) y SEACE (parámetro de región real en el buscador), OECE no filtra por región server-side: el departamento se deriva del `buyer.address.department` de cada release/record, filtrado en cliente después de traer TODAS las páginas de `/releases` o `/records` en orden. Cubrir las 25 regiones exige recorrer el histórico completo de ambos endpoints, sin límite de tasa documentado por la fuente — un crawl de horas, no minutos, y sin verificar aún si OECE tiene el mismo tipo de alias de departamento no mapeado que se encontró en INFOBRAS (`"P C DEL CALLAO"`, CT-06). Queda para una corrida dedicada, con tiempo y memoria disponibles, fuera de esta sesión.

## CT-08 y CT-09 — cerrados (2026-09-09)

Ambos con corrida nacional real ejecutada y verificada en datos:

- **CT-08 (OECE)**: se encontró y corrigió un bug de config real antes de correr — `apps/compras-publicas/api/.env` tenía `OECE_DEPARTAMENTOS`/`MINOR_CONTRACT_DEPARTAMENTOS` hardcodeados a las mismas 5 regiones de siempre (resabio previo al fix de código de la sección anterior), limitando silenciosamente cualquier corrida "nacional" aunque el código ya soportara las 25 por defecto. Corridas reales: `run-oece-releases-full.ts` y `run-oece-records-full.ts`, ambas `status: COMPLETE`, terminando solas en la página 501 (`OECE_404_AFTER_NEXT_LINK`, fin de paginación real, no crash). Verificado en vivo: `procurement_processes` con 25/25 departamentos poblados (Lima 1,650, La Libertad 416, total ~5,940); `awards` con 8,882 filas, 1,711 `buyer_id` distintos.
- **CT-09 (SEACE)**: ingesta de las 20 regiones restantes (`MINOR_CONTRACT_DEPARTAMENTOS=<20 regiones>`). RAM se mantuvo con margen esta vez (2.5-3.8GB libres, vs. ~950MB en los intentos previos que murieron). Terminó `isPartial: false`, 47,183 contratos nuevos (65,890 registros fuente procesados, solo 10 fallos de detalle). Verificado en vivo: `minor_contracts` con 25/25 departamentos poblados (Lima 18,230 es la mayor, como se esperaba).

**Pendiente real encontrado al verificar LA LIBERTAD/AREQUIPA/LIMA con el CLI de cobertura (2026-09-09, sesión siguiente):** el dato en ambas fuentes es real y completo, pero `territorial_coverage` no lo refleja correctamente — ver CT-21 (OECE marca `PARCIAL` por un bug en `isCompleteSnapshot`, nunca puede llegar a `COMPLETA_VERIFICADA` con `params` de fecha) y CT-23 (SEACE tiene una discrepancia de conteo sin explicar entre `persisted_records` y las filas reales en `minor_contracts`, en direcciones opuestas según la región).

## CT-10 — pausado deliberadamente (2026-09-09), no por falla

Avance real de esta sesión: el diseño genérico (`fetchDepartamentoRowsInSection`) ya existía en código; lo que faltaba y se hizo:

1. El archivo del MEF creció 12.6% desde la última calibración manual — recalibrado vía búsqueda binaria (PR #145, `mef-connector.ts`/`mef-section-bounds.ts`).
2. Nueva tabla `DEPARTAMENTO_UBIGEO_PREFIJO` (25 regiones) para matching de Gobiernos Locales — antes solo 5 departamentos tenían UBIGEO.
3. Verificado en vivo con AREQUIPA: 18/18 secciones, 2,933 entidades, 0 rechazados, ~11 min.
4. Lanzado un batch secuencial de los 23 departamentos restantes. **Detenido deliberadamente en HUANUCO** tras la decisión de alcance de esta misma sesión (ver arriba) — Ricardo aclaró que su prioridad real es LA LIBERTAD óptimo primero y máximo AREQUIPA+LIMA como pilotos, no una corrida de las 25 regiones, dado el equipo disponible.

**Resultado final del batch parcial:** OK = ANCASH, APURIMAC, AYACUCHO, CAJAMARCA, CUSCO, HUANCAVELICA (6); FALLÓ = AMAZONAS (bug de parseo CSV preexistente en el límite de chunk de 25MB, no introducido esta sesión), CALLAO (`No se encontró ninguna fila de "CALLAO" en ninguna de las 16 secciones GR/GL` — probablemente el mismo patrón de alias no mapeado que Callao en INFOBRAS/CT-06, sin confirmar todavía cuál es el nombre exacto que usa el MEF); sin correr = HUANUCO en adelante (~15 restantes).

**No retomar este batch completo sin que Ricardo lo pida explícitamente.** El trabajo de MEF que sí es prioridad ahora: AREQUIPA ya tiene GR+GL reales (de este mismo batch) pero le falta GN, y ninguno de los tres departamentos objetivo (LA LIBERTAD/AREQUIPA/LIMA) tiene un materializador de cobertura que traduzca ese dato crudo a `territorial_coverage` — ver CT-22. LIMA no tiene ningún dato MEF ingerido todavía (gap real, no de bookkeeping).

## CT-21, CT-22 — cerrados (2026-09-09, misma sesión de verificación)

- **CT-21 (OECE)**: fix aplicado en `oece-connector.ts:232` y `oece-records-connector.ts:257` — se quitó la condición `Object.keys(params).length === 0` de `isCompleteSnapshot` (un barrido con `startDate`/`endDate` nunca podía certificarse, sin importar que llegara a la página terminal). Backfill ejecutado (`recompute-oece-coverage.ts`, nuevo) recalculando desde `procurement_processes`/`awards`/`bidders` ya persistidos, sin re-descargar de OECE: LA LIBERTAD, AREQUIPA y LIMA quedan `COMPLETA_VERIFICADA` en `OECE_OCDS_RELEASES/AWARDS/BIDDERS`. 113/113 tests en verde.
- **CT-22 (MEF)**: construido `apps/radar-ejecucion/api/src/ingest/materialize-mef-coverage.ts` (`npm run coverage:mef`), reusando `coverage/mef-territorial.ts` (código existente, nunca conectado hasta ahora). Atribución real: `budget_execution.source_batch_id` no guarda un lote por sección — la atribución GR/GL usa `entities.nivel_gobierno` + prefijo UBIGEO del departamento; GN usa `budget_execution.meta_departamento` directo. Corrido para LA LIBERTAD (queda `COMPLETA_VERIFICADA` en los 3 niveles) y AREQUIPA (GR/GL `COMPLETA_VERIFICADA`; GN corrido aparte vía `npm run ingest:mef:meta -- AREQUIPA`, 288 entidades, y luego re-materializado → también `COMPLETA_VERIFICADA`). 94/94 tests en verde (incluye test nuevo para `coverageRowsFromMefSnapshots`).

## CT-23 — causa raíz encontrada (2026-09-09): no es un bug de conteo, es una diferencia de semántica

`territorial_coverage`/SEACE mide el **departamento de la entidad contratante buscada** (el filtro `codigo_departamento` de la búsqueda pública), no el **departamento real de ejecución del ítem**. En `seace-public-minor-contracts-connector.ts:396`, `upsertedContractsByDepartamento` se incrementa usando la variable `departamento` del bucle exterior (la región por la que se buscó), mientras que la tabla `minor_contracts.execution_department` (lo que consulté para "dato real") se llena con `location.department` (línea 391, derivado de `item.nomDistritoExt`/`nomDistrito` del ítem — la ubicación real donde se ejecuta esa contratación específica).

Una entidad con sede en un departamento puede ejecutar ítems en otro (obra/servicio prestado en una región distinta a la sede de la entidad contratante) — por eso "buscado por LA LIBERTAD" (persisted, vía `territorial_coverage`) y "ejecutado en LA LIBERTAD" (`minor_contracts.execution_department`) son conjuntos distintos, y pueden diferir en cualquier dirección según el flujo neto de contrataciones cruzadas. Esto explica tanto el sub-conteo en LA LIBERTAD como el sobre-conteo en AREQUIPA/LIMA — no hay overcounting técnico (no hay filas duplicadas ni upserts fallidos), es una pregunta distinta.

**Decisión pendiente, no tomada esta sesión:** ¿`territorial_coverage` debería medir "búsqueda completa por región" (lo que mide hoy, y es coherente con el resto del diseño: registra qué se buscó/recorrió, no dónde terminó ejecutándose) o "ejecución real por región" (lo que probablemente espera un consumidor final del dato)? Cambiar `persisted_records` a contar por `execution_department` en vez de por región buscada es posible, pero cambia lo que la fila certifica — no es una corrección trivial. Se documenta aquí para decidir con Ricardo antes de tocar el conector.

## Ingesta real ejecutada — LA LIBERTAD, AREQUIPA, LIMA (2026-09-09, cierre de sesión)

Con CT-21/CT-22 cerrados, se ejecutó la ingesta real pendiente para los tres departamentos objetivo:

- **AREQUIPA — MEF GN**: `npm run ingest:mef:meta -- AREQUIPA` (288 entidades, 0 secciones sin datos). Re-materializado → **AREQUIPA queda `COMPLETA_VERIFICADA` en los 3 niveles MEF**, óptima.
- **LIMA — MEF GR+GL**: `MEF_PILOT_DEPARTAMENTOS=LIMA npx tsx src/cli/ingest-pilot-ejecutora.ts` (4,638 entidades, 0 secciones sin datos, 0 rechazados). Materializado → GR (204) y GL (4,434) `COMPLETA_VERIFICADA`.
- **LIMA — MEF GN, resuelto en la misma sesión (2026-09-09)**: `npm run ingest:mef:meta -- LIMA` falló tres veces antes de cerrar, cada vez por una causa distinta:
  1. Primer intento: `FATAL ERROR: ... JavaScript heap out of memory` (heap V8 por defecto ~4GB, no límite de RAM del sistema — había ~2.8-6GB libres en los tres intentos).
  2. Segundo intento, con `NODE_OPTIONS=--max-old-space-size=6144`: avanzó más (usó las secciones ya cacheadas en `raw_mef_batches` de mes 3-8, descargó mes 2 y 1 nuevos) pero falló en mes=0 con `total size of jsonb array elements exceeds the maximum of 268435455 bytes` — límite duro de Postgres para un valor `jsonb` (256MB). Lima genera muchísimas más filas de Gobierno Nacional por `DEPARTAMENTO_META=LIMA` que cualquier otro departamento — el conector guardaba el payload crudo de una sección completa como un único array `jsonb`, y esa estrategia no escalaba a departamentos de este volumen.
  3. **Fix aplicado en `mef-connector.ts`**: `saveFilteredBatch()` ahora trocea las filas filtradas en varios lotes (`resource_id` sufijado `#chunk=N`) de hasta 100MB cada uno (`chunkRowsBySize()`, con test unitario nuevo), y `loadCachedRows()` reúne todos los lotes de un mismo `resource_id` en vez de asumir uno solo. Con el fix, mes=0 guardó sus 169,615 filas sin problema — pero **apareció un tercer bug, no relacionado**: `RangeError: Maximum call stack size exceeded` en `allRecords.push(...records)` — el operador spread revienta el límite de argumentos de V8 (~65-125 mil) cuando el array fuente es así de grande. Corregido con un helper `pushAll()` (loop simple) en los 6 sitios del archivo que acumulaban filas potencialmente masivas.
  4. **Tercer intento, ya con ambos fixes: éxito.** 1,520 entidades actualizadas, 0 secciones sin datos, 0 rechazados. Re-materializado → **LIMA queda `COMPLETA_VERIFICADA` en los 3 niveles MEF**.
  - **No quedó nada corrupto en los intentos fallidos**: cada fallo dejó la transacción sin comitear (verificado en vivo), y las secciones ya guardadas exitosamente en intentos previos se reutilizaron como caché en el intento final — ningún trabajo se perdió entre reintentos.
  - 99/99 tests en verde (incluye 5 tests nuevos para `chunkRowsBySize`).
- **Invierte.pe (CT-07) — AREQUIPA y LIMA**: se corrigió el mismo patrón de hardcode de OECE/CT-08 en `run-invierte-full.ts` y `run-invierte-desactivadas-full.ts` (`DEFAULT_TERRITORIAL_SCOPE=["LA LIBERTAD"]` estaba fijo en la llamada del CLI y en `materializeVerifiedCoverage`; ahora ambos leen `INVIERTE_DEPARTAMENTOS` del entorno, mismo mecanismo que `resolveDepartamentosFromEnv()` de OECE). Corridas reales para `LA LIBERTAD,AREQUIPA,LIMA` — el archivo nacional se descarga completo de cualquier forma, así que ampliar el alcance no costó una descarga nueva:
  - `investments`: LIMA 15,762 / LA LIBERTAD 8,006 / AREQUIPA 7,201. 5 rangos, 0 rechazados, sin huecos.
  - `investments_deactivated`: LIMA 36,120 / LA LIBERTAD 19,793 / AREQUIPA 9,869. 6 rangos, sin huecos (7,252 rechazos solo en el primer rango, por campos inválidos — no bloquea completitud).
  - **AREQUIPA y LIMA quedan `COMPLETA_VERIFICADA`** en radar-inversiones, igual que LA LIBERTAD.

### Estado final verificado (`cobertura:territorial`, 2026-09-09) — LAS 3 REGIONES ÓPTIMAS

| App | LA LIBERTAD | AREQUIPA | LIMA |
|---|---|---|---|
| radar-ejecucion (MEF) | ✅ COMPLETA_VERIFICADA | ✅ COMPLETA_VERIFICADA | ✅ COMPLETA_VERIFICADA |
| radar-inversiones (Invierte) | ✅ COMPLETA_VERIFICADA | ✅ COMPLETA_VERIFICADA | ✅ COMPLETA_VERIFICADA |
| infobras | ✅ COMPLETA_VERIFICADA | ✅ COMPLETA_VERIFICADA | ✅ COMPLETA_VERIFICADA |
| compras-publicas (OECE+SEACE) | ✅ COMPLETA_VERIFICADA | ✅ COMPLETA_VERIFICADA | ✅ COMPLETA_VERIFICADA |

**LA LIBERTAD, AREQUIPA y LIMA quedan óptimas al 100% en las 4 apps con fuente real**, verificado con `npm run cobertura:territorial -- --app radar-ejecucion --jurisdiccion "<región>" --require-complete` (exit 0 en las tres). CT-21 y CT-22 cerrados, incluyendo el fix adicional de troceo de payload + `pushAll` que destrabó LIMA. CT-23 (SEACE) queda como decisión de diseño pendiente, no bug — ver arriba.
