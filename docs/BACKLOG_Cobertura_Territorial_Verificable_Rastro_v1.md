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

## Secuencia obligatoria

`CT-01 → CT-02 → CT-03 → CT-04 → CT-05/07/08/09 → CT-18 → CT-10 → CT-12/13/14 → CT-15/16/17 → CT-19/20`

## Decisión de capacidad

Los P0 constituyen el mínimo para ampliar territorio de manera honesta. No se debe iniciar análisis comparativo público de las 25 jurisdicciones mientras CT-05 a CT-09 no produzcan un corte verificable. CT-10 es la apuesta más costosa; por eso se separa de las fuentes que ya tienen archivos nacionales manejables.

## Estado de ejecución (2026-09-08, actualizado — ver CT-06 más abajo)

| Tickets | Estado | Evidencia |
|---|---|---|
| CT-01, CT-02, CT-03, CT-04, CT-18 | Implementado y validado | Migración central, catálogo de 25, CLI y pruebas que bloquean falsos “completos”. |
| CT-06 | **Hecho (2026-09-08)** | Ver sección "CT-06 — cerrado" más abajo. |
| CT-09 | Instrumentado y verificado en 5/25 regiones; corte nacional pendiente | Código listo para las 25 (`DEFAULT_TERRITORIAL_SCOPE` ya las incluye), pero `.env` local trae `MINOR_CONTRACT_DEPARTAMENTOS` acotado a 5 y la corrida de las 25 se abortó dos veces por falta de RAM en esta máquina (no es un límite de la fuente ni del código) — ver detalle abajo. |
| CT-08 | Código listo (2026-09-09); corte nacional pendiente | `recordTerritorialCoverage` ya estaba implementado en el conector; el bloqueo real (`run-oece-*-full.ts` con `"LA LIBERTAD"` hardcodeado) ya se corrigió — ver detalle abajo. Falta ejecutar el barrido de las 25 regiones, que la fuente no acota por región server-side (recorrido histórico completo de `/releases`/`/records`, horas, no minutos). |
| CT-07 | Ejecutado y verificado | Invierte recorrió sin huecos los cinco rangos del CSV público (246,344,022 bytes) y consolidó las 25 regiones como `COMPLETA_VERIFICADA`; el alcance continúa acotado a lo expuesto por esa fuente pública. |
| CT-10 a CT-17, CT-20 | Pendiente | Requieren fuente/corrida o dependencias que todavía no están verificadas. |
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
