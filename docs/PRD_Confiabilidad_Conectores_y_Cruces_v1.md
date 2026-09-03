# PRD — Confiabilidad de conectores y cruces entre apps

**Estado:** Propuesto; pendiente de owner y fecha comprometida
**Fecha:** 2026-09-02
**Ámbito:** `apps/*/api/src/ingest`, `apps/*/api/src/routes/crossref.ts`, `docs/conectores.md`
**Horizonte:** dos sprints cortos; sin fecha comprometida ni owner asignado
**Origen:** diagnóstico completo de los 21 conectores de ingesta del monorepo (2026-09-02), documentado en [`docs/conectores.md`](conectores.md) y su sección ["Mapa de cruces entre apps"](conectores.md#mapa-de-cruces-entre-apps)

## 1. Decisión de producto

AppsPerú cruza datos de 14 APIs independientes para dar contexto (¿cuánto gasta el Estado en algo que también se denuncia/mide en otra fuente?, ¿este proveedor tiene sanciones vigentes?). El diagnóstico de 2026-09-02 confirmó que los 21 conectores están bien justificados y sin redundancia real, pero encontró **una brecha de cruce con impacto directo en la señal de riesgo de proveedores**, **un conector crítico con deuda técnica confesada por su propio autor**, y **una nomenclatura que induce a error sobre qué fuente se está consultando**. Este PRD convierte esos hallazgos en trabajo verificable, sin ampliar el alcance de ingesta ni tocar la lógica de negocio de los conectores existentes salvo donde el propio hallazgo lo exige.

Este PRD no autoriza nuevas fuentes de datos, scraping adicional, ni cambios en las conclusiones que la plataforma presenta sobre un proveedor o una entidad — solo mejora qué tan completo y honesto es el cruce entre lo que ya se ingiere.

## 2. Problema y oportunidad

El diagnóstico encontró tres fricciones concretas:

1. **Gap de cruce con impacto de riesgo real**: `proveedores-sancionados` e `identidad-fiscal` solo cruzan contra `awards` (poblada por `oece-connector.ts`/`oece-records-connector.ts`). Los otros dos conectores de `compras-publicas` (`legacy-seace-orders-connector.ts`, `oece-minor-contracts-connector.ts`) escriben en `minor_contracts` con el mismo formato de `supplier_id`, pero no están incluidos en esos cruces. Un proveedor inhabilitado que solo tiene contratos menores no aparece en el radar de riesgo.
2. **Deuda técnica confesada en la fuente más cruzada del sistema**: `mef-connector.ts` (radar-ejecucion) tiene un `TODO` explícito del propio autor — usa offsets de byte observados manualmente para acotar la descarga a La Libertad, sin garantía de que el MEF mantenga esa estructura. Siete apps dependen de `budget_execution` para sus propios cruces (ver mapa de cruces); un cambio silencioso en el archivo fuente del MEF puede romper todos esos cruces sin que se note.
3. **Nomenclatura que induce a error**: `oece-minor-contracts-connector.ts` no toca la API OCDS de OECE — apunta a una interfaz distinta de SEACE. El nombre sugiere una relación con `oece-connector.ts`/`oece-records-connector.ts` que no existe, lo que puede llevar a un futuro mantenedor a asumir cobertura o comportamiento incorrectos.

Resolverlas mejora la señal de riesgo de proveedores (el caso de uso más sensible del sistema), reduce el riesgo de una falla silenciosa en el conector más cruzado, y baja el costo de mantenimiento futuro.

## 3. Objetivo, no objetivos y métricas de éxito

### Objetivo

Cerrar la brecha de cruce sobre `minor_contracts`, tomar y documentar una decisión explícita sobre el riesgo de `mef-connector.ts`, y eliminar la confusión de nomenclatura entre SEACE y OECE — sin ampliar el alcance de ingesta ni introducir automatización no solicitada.

### No objetivos

- No agregar fuentes de datos nuevas ni conectores nuevos.
- No cambiar el modelo canónico de `minor_contracts` ni de `awards` más allá de lo necesario para el cruce.
- No implementar automatización/scheduler como parte obligatoria de este PRD (queda como issue P1 evaluable, no como bloqueante — ver CX-04).
- No decidir unilateralmente completar el streaming de `mef-connector.ts`; este PRD exige que la decisión quede documentada en un ADR, sea cual sea (completar, aceptar el riesgo, o mitigar de otra forma).
- No modificar las conclusiones o etiquetas de riesgo que ya expone la plataforma sobre un proveedor — solo ampliar de qué conectores se alimenta esa señal.

### Métricas de éxito

| Métrica | Meta de aceptación |
|---|---|
| Cobertura de cruce de riesgo | `GET /api/crossref` de `identidad-fiscal` y de `proveedores-sancionados` incluyen resultados provenientes de `minor_contracts`, no solo de `awards`. |
| Decisión documentada sobre MEF | Existe un ADR que registra la decisión tomada sobre `mef-connector.ts` (completar streaming, aceptar el riesgo con monitoreo, o mitigación alternativa) y su justificación. |
| Nomenclatura correcta | `oece-minor-contracts-connector.ts` deja de existir con ese nombre; el nuevo nombre refleja la fuente real (SEACE) sin romper `npm run ingest:minor-contracts` ni las rutas/tests que dependen de él. |
| Documentación viva | `docs/conectores.md` y su mapa de cruces reflejan el estado real después de cada cambio de este PRD, en el mismo PR que lo introduce. |

## 4. Usuarios y casos de uso

| Usuario | Necesidad | Resultado esperado |
|---|---|---|
| Analista de riesgo de proveedores | Ver todas las contrataciones de un proveedor (OCDS + menores) cruzadas contra sanciones y estado tributario. | `/api/crossref` de proveedores-sancionados/identidad-fiscal cubre `awards` y `minor_contracts`. |
| Equipo de datos | Saber si el conector de presupuesto (la fuente más cruzada) es confiable para producción. | ADR con decisión explícita y trazable sobre `mef-connector.ts`. |
| Futuro mantenedor | No confundir un conector de SEACE con uno de OECE al leer el nombre del archivo. | Nombre del archivo y de sus símbolos exportados coherente con su fuente real. |
| Cualquier persona que use `docs/conectores.md` como referencia | Confiar en que el catálogo refleja el código actual. | Catálogo actualizado en el mismo PR que cualquier cambio de conector. |

## 5. Alcance funcional: seis issues

### CX-01 — Cruce de `minor_contracts` en identidad-fiscal y proveedores-sancionados

**Prioridad:** P0 · **Esfuerzo:** M · **Dependencias:** ninguna

Extender `apps/identidad-fiscal/api/src/routes/crossref.ts` y `apps/proveedores-sancionados/api/src/routes/crossref.ts` para que, además de `awards` (compras-publicas), consulten `minor_contracts` (también en compras-publicas, poblada por `legacy-seace-orders-connector.ts` y `oece-minor-contracts-connector.ts`). El `supplier_id`/RUC ya usa el mismo formato en ambos modelos; el trabajo es de consulta y de forma de respuesta, no de normalización de datos.

**Criterios de aceptación**

- `GET /api/crossref` de `identidad-fiscal` incluye resultados originados en `minor_contracts`, distinguibles por campo (`origen: "awards" | "minor_contracts"` o equivalente) sin romper el contrato de respuesta existente para consumidores actuales.
- `GET /api/crossref` de `proveedores-sancionados` hace lo mismo, preservando la distinción entre "inhabilitado hoy" e "inhabilitado en la fecha de la adjudicación/contrato" que ya existe para `awards`.
- Un proveedor con inhabilitación vigente y solo contratos menores (sin `awards` OCDS) ahora aparece marcado en ambos cruces.
- Pruebas cubren: proveedor solo en `awards`, proveedor solo en `minor_contracts`, proveedor en ambos, proveedor en ninguno.
- `docs/conectores.md` (fichas de `legacy-seace-orders-connector.ts` y `oece-minor-contracts-connector.ts`, y el "Mapa de cruces") se actualiza en el mismo PR quitando la nota de gap.

### CX-02 — ADR de decisión sobre `mef-connector.ts`

**Prioridad:** P0 · **Esfuerzo:** M (investigación + decisión) · **Dependencias:** ninguna

Producir un ADR (`docs/adr/0015-mef-connector-offsets-manuales-decision.md`) que documente explícitamente una de tres rutas para el `TODO` confesado en `mef-connector.ts` (offsets de byte observados manualmente para La Libertad): (a) completar el modo de streaming real sobre el CSV completo, eliminando la dependencia de offsets fijos; (b) mantener el enfoque actual pero con monitoreo activo (alerta si el tamaño/estructura del archivo del MEF cambia respecto al último batch exitoso); (c) otra mitigación equivalente. Cualquiera de las tres es aceptable como salida de este ticket — lo que no es aceptable es dejar la decisión implícita en un comentario de código.

**Criterios de aceptación**

- El ADR nombra explícitamente los 7 consumidores del cruce (`actividad-agraria`, `seguridad-ciudadana`, `radar-ejecucion` interno vía turismo, `compras-publicas`, `radar-inversiones`, `identidad-fiscal`, `ceplan-geo`/`ceplan-estrategico`) y el impacto de una falla silenciosa en cada uno.
- La decisión tomada queda reflejada en `docs/conectores.md` (ficha de `mef-connector.ts`) reemplazando o complementando la nota de "TODO explícito pre-producción" actual.
- Si la decisión es (b) monitoreo, el ADR especifica la señal concreta a vigilar (ej. tamaño de archivo esperado, checksum de estructura, conteo de filas por sección) y quién la revisa.
- Si la decisión es (a) completar streaming, este ticket entrega el ADR y el diseño técnico; la implementación puede ser un ticket de seguimiento fuera de este backlog si el esfuerzo excede M.

### CX-03 — Renombrar `oece-minor-contracts-connector.ts`

**Prioridad:** P1 · **Esfuerzo:** S · **Dependencias:** ninguna (puede correr en paralelo con CX-01, mismo archivo pero cambios no solapados si se coordina el orden del merge)

Renombrar el archivo, sus exports (`classifyContractingEntity` se reexporta desde `legacy-seace-orders-connector.ts`, revisar ese import) y el script npm `ingest:minor-contracts` a un nombre que refleje la fuente real (SEACE, buscador público moderno), por ejemplo `seace-public-minor-contracts-connector.ts`.

**Criterios de aceptación**

- Ningún test ni script npm se rompe (`npm run ingest:minor-contracts`, `:full`, y el import cruzado desde `legacy-seace-orders-connector.ts` siguen funcionando, con nombres actualizados si corresponde).
- `docs/conectores.md` refleja el nuevo nombre en la ficha, el mapa de cruces y la tabla resumen.
- El PR es solo renombrado + imports; sin cambios de comportamiento.

### CX-04 — Evaluar automatización de los conectores núcleo de cruce

**Prioridad:** P1 · **Esfuerzo:** M · **Dependencias:** CX-02 (para `mef-connector.ts` específicamente; el resto no depende)

Evaluar y, si se decide seguir adelante, implementar un scheduler (cron o equivalente) para los conectores cuya frescura afecta más cruces: `mef-connector.ts`, `oece-connector.ts`, `oece-records-connector.ts`. Hoy los 21 conectores son 100% manuales por decisión de diseño (confirmado en `docs/conectores.md`); este ticket no asume que automatizar es la respuesta correcta — el entregable mínimo es la evaluación documentada.

**Criterios de aceptación**

- Documento de evaluación (puede ser una sección del ADR de CX-02 o uno propio) que responde: ¿qué tan stale puede estar cada cruce antes de que la lectura sea engañosa?, ¿qué costo de infraestructura implica automatizar (dado que hoy no hay backend con cron, ver `docs/arquitectura/scraping-arquitectura.md` §3.7)?
- Si se decide automatizar, al menos un conector corre sin intervención manual y su corrida queda registrada (log o tabla) de forma auditable.
- Si se decide no automatizar por ahora, la razón queda documentada y el ticket se cierra como "evaluado, diferido" — no se deja abierto indefinidamente.

### CX-05 — Evaluar consolidación de `entity_crosswalk`

**Prioridad:** P2 · **Esfuerzo:** M · **Dependencias:** ninguna

`compras-publicas` e `infobras` mantienen cada una su propio `entity_crosswalk` (mef↔oece y mef↔infobras respectivamente), con matcher difuso equivalente pero independiente; `identidad-fiscal` reutiliza el matcher de `compras-publicas` sin tabla propia. Evaluar si conviene un servicio de matching de entidades compartido (librería o microservicio) en vez de tres implementaciones paralelas del mismo problema.

**Criterios de aceptación**

- Documento de evaluación que compara: costo de mantener 2-3 implementaciones vs. costo de extraer un servicio compartido, y si el resultado del matching sería idéntico o divergiría por app.
- Si se decide consolidar, el ADR correspondiente define la interfaz del servicio compartido antes de tocar código de las 3 apps.
- Si se decide no consolidar, la razón queda documentada (ej. "cada app tiene suficiente contexto propio para justificar su propio matcher") y el ticket se cierra.

### CX-06 — Chequeo CI: conector nuevo sin ficha en `docs/conectores.md`

**Prioridad:** P1 · **Esfuerzo:** S · **Dependencias:** ninguna

Agregar un chequeo (script + step de CI) que falle si aparece un archivo `src/ingest/*-connector.ts` nuevo en cualquier app sin una entrada correspondiente en `docs/conectores.md` (ancla `<a id="...">` o mención por nombre de archivo). Objetivo: que la brecha de 6 conectores no documentados detectada en el diagnóstico de 2026-09-02 no vuelva a repetirse.

**Criterios de aceptación**

- El script recorre `apps/*/api/src/ingest/*-connector.ts` y compara contra las menciones de nombre de archivo en `docs/conectores.md`.
- CI falla con un mensaje claro (qué archivo falta documentar) si hay un desfase.
- El chequeo no falla por diferencias de formato o texto — solo por ausencia total de mención del nombre del archivo.
- Documentado en `docs/conectores.md` mismo (nota al pie) que este chequeo existe, para que quien agregue un conector sepa que debe actualizar el catálogo en el mismo PR.

## 6. Priorización y secuencia

| Fase | Entregables | Resultado que desbloquea |
|---|---|---|
| **Ahora** | CX-01, CX-02, CX-03 | Cierra el gap de riesgo de proveedores, saca la decisión sobre MEF de un comentario de código a un ADR trazable, y elimina la confusión de nomenclatura. |
| **Siguiente** | CX-04, CX-06 | Decide con evidencia si automatizar vale la pena, y evita que el catálogo se desactualice otra vez. |
| **Después** | CX-05 | Consolidación de matching, solo si la evaluación lo justifica — no es una mejora obligatoria. |

## 7. Requisitos no funcionales

- **Trazabilidad:** todo cambio de este PRD que afecte un cruce debe distinguir el origen del dato (`awards` vs. `minor_contracts`, u otra fuente) en la respuesta, no fusionarlo de forma indistinguible.
- **Compatibilidad:** los cambios de CX-01 y CX-03 no deben romper el contrato de respuesta de endpoints ya consumidos (verificar si `rastro-web` u otro cliente depende de la forma actual antes de cambiarla).
- **No regresión de honestidad de datos:** ningún cambio de este PRD puede convertir "sin match" en un valor por defecto que parezca un match real (mismo principio que ya aplica en `identidad-fiscal/crossref.ts`: "un RUC no encontrado no se marca irregular, se marca aparte").
- **Documentación como entregable, no como afterthought:** cada ticket de este PRD incluye actualizar `docs/conectores.md` como criterio de aceptación, no como tarea separada.

## 8. Riesgos y mitigaciones

| Riesgo | Mitigación |
|---|---|
| CX-01 cambia la forma de respuesta de `/api/crossref` y rompe un consumidor existente | Verificar consumidores (rastro-web, MCP) antes de mergear; versionar el campo nuevo como aditivo, no reemplazo. |
| CX-02 concluye "completar streaming" pero el esfuerzo real excede lo estimado | El ADR separa explícitamente decisión (este ticket) de implementación (ticket de seguimiento si aplica), para no bloquear el resto del PRD. |
| CX-03 rompe el import cruzado (`classifyContractingEntity`) entre `legacy-seace-orders-connector.ts` y el archivo renombrado | Ejecutar la suite de tests de `compras-publicas/api` completa antes de mergear, no solo los tests del archivo tocado. |
| CX-06 genera falsos positivos si un archivo `*-connector.ts` es intencionalmente interno (no una fuente externa) | El script solo revisa `src/ingest/`, que por convención del repo son siempre conectores externos — si aparece una excepción real, se documenta explícitamente en el propio `docs/conectores.md` en vez de silenciar el chequeo. |

## 9. Fuera de este PRD

- Automatización completa de todos los 21 conectores (solo se evalúa para los 3 de mayor tráfico de cruce, CX-04).
- Cambios al modelo canónico de contrataciones más allá de lo necesario para CX-01.
- Nuevas fuentes de datos o conectores adicionales.
- Cambios en `apps/rastro-web` — este PRD es backend/ingesta/documentación únicamente; si CX-01 o CX-03 requieren cambios en el frontend, esos quedan como tickets de seguimiento fuera de este backlog.

## 10. Definition of Done

- Cada issue tiene PR, revisión y pruebas automatizadas asociadas.
- `docs/conectores.md` refleja el estado real después de cada PR mergeado de este PRD.
- Los ADR de CX-02 y (si aplica) CX-05 están mergeados antes de cerrar sus tickets respectivos.
- Ningún cambio de este PRD introduce una nueva fuente de datos no auditada ni una afirmación de cobertura no verificada.
