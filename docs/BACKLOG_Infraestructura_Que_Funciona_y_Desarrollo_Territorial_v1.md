# Backlog ejecutable — Infraestructura que funciona y desarrollo territorial v1

**Producto:** Rastro
**Regla transversal:** API/terminal/MCP únicamente. Un activo, operador, mantenimiento o indicador entra solo mediante clave oficial y evidencia trazable.
**Estimación:** S ≤ 1 día, M 2–3 días, L 4–6 días. No es compromiso de calendario.

## Corte de implementación — 2026-08-24

| Tickets | Estado | Resultado verificable o bloqueo |
|---|---|---|
| IF-01–03 | Parcial y bloqueado de forma explícita | Se registraron fuentes primarias existentes para drenaje/educación y quedaron manual-asistidas. Agua/saneamiento no se materializa sin fuente reproducible de activo/acto/operador. |
| IF-04–05 | Hecho | Migración idempotente de lotes, activo y vínculo CUI→INFOBRAS únicamente por igualdad exacta. |
| IF-06 | Parcial | Territorio publicado para la cohorte; no se fabrica distrito/cobertura individual donde la fuente no lo publica. |
| IF-07–11 | Modelo hecho; evidencia pendiente | Cierre, operador, mantenimiento, disponibilidad y cola append-only operan. La cohorte conserva cero registros de esos tipos y ocho vacíos pendientes. |
| IF-12–13 | Modelo hecho; sin indicador cargado | Se modeló servicio/cobertura y se prohíbe convertirlo en impacto económico o social. |
| IF-14–16 | Hecho | API, CLI, integridad estricta y seis tools MCP de solo lectura; el modo estricto bloquea la publicación de funcionamiento sin evidencia. |
| IF-17 | Hecho, cohorte parcial | Dos activos materializados: drenaje de Trujillo y educación Casa Grande; no representan el universo regional ni tres familias completas. |
| IF-18 | Hecho | Migración aplicada localmente, 52/52 pruebas API, build de API/MCP y validación runtime completados. |

## Secuencia estratégica

| Fase | Objetivo | Tickets | Regla de corte |
|---|---|---|---|
| 0 | Validar que exista una fuente responsable por familia de infraestructura. | IF-01 a IF-03 | Sin activo/acto/operador reproducible, no hay conector. |
| 1 | Construir identidad y cierre físico/documental. | IF-04 a IF-07 | No hay activo ni recepción por nombre de obra. |
| 2 | Medir operación y mantenimiento sin sobreafirmar. | IF-08 a IF-11 | No hay “operativo” sin fuente sectorial/operador. |
| 3 | Conectar servicio y territorio con límites visibles. | IF-12 a IF-15 | No se reparte un agregado entre activos o distritos. |
| 4 | Operar el contrato y escalar. | IF-16 a IF-18 | Sin pruebas, trazabilidad y revisión humana no se publica. |

## Tickets

| ID | Épica | Objetivo | Criterios de aceptación | Dependencias | Prioridad | Esfuerzo | Fase |
|---|---|---|---|---|---|---|---|
| IF-01 | Viabilidad | Inventariar fuentes de drenaje, educación y agua/saneamiento para activo, recepción, operador, mantenimiento y disponibilidad. | URL, responsable, acceso, condiciones de uso, frecuencia, claves, paginación, nulos, muestra y estabilidad documentados; clasifica API, descarga, interfaz o documento. | Ninguna. | P0 | M | 0 |
| IF-02 | Viabilidad | Obtener dos muestras reproducibles por familia, con activo o CUI/código y acto/operación. | Guarda fuente, fecha, checksum cuando descargable, claves, transformación y resultado de duplicados. | IF-01 | P0 | M | 0 |
| IF-03 | Gobernanza | Dictaminar automatización, frecuencia y cobertura por fuente. | ADR declara `AUTOMATIZABLE`, `MANUAL_ASISTIDA` o `NO_AUTOMATIZAR_HASTA_VALIDAR`; no hay scraping sin permiso/estabilidad. | IF-01–02 | P0 | S | 0 |
| IF-04 | Modelo | Crear lotes de evidencia y activos de infraestructura. | Migración idempotente para `infrastructure_evidence_batch` e `infrastructure_asset`; fuente/corte obligatorios; CUI/código validado o ausencia declarada. | IF-03 | P0 | M | 1 |
| IF-05 | Identidad | Implementar vínculo CUI → INFOBRAS → activo por claves exactas. | Unión por CUI/código de obra/activo explícito; prueba rechaza nombre, distrito y embeddings. | IF-04 | P0 | M | 1 |
| IF-06 | Territorio | Registrar territorio y población/cobertura publicada del activo. | Conserva tipo de alcance; distrito nulo si no se publica; no usa sede de entidad ni proximidad. | IF-04 | P0 | M | 1 |
| IF-07 | Cierre | Modelar recepción, cierre y transferencia al operador. | Acto, fecha, emisor, URL y literal requeridos; inauguración no crea `RECEPCION_DOCUMENTADA`. | IF-04–05 | P0 | M | 1 |
| IF-08 | Operador | Modelar operador, rol y vigencia. | Entidad operadora y fuente obligatorias; ejecutora/financiadora no se convierte en operador sin acto. | IF-07 | P1 | M | 2 |
| IF-09 | Mantenimiento | Modelar presupuesto/actividad, contrato o evidencia de mantenimiento. | Distingue `FINANCIAMIENTO_IDENTIFICADO` de `MANTENIMIENTO_DOCUMENTADO`; no atribuye actividad agregada al activo. | IF-04, IF-08 | P1 | M | 2 |
| IF-10 | Disponibilidad | Ingerir estado de operación, restricción o fuera de servicio. | Fecha, alcance, fuente y detalle literal requeridos; no deriva operación de avance o inauguración. | IF-07–08 | P1 | L | 2 |
| IF-11 | Revisión | Crear cola append-only de activos sin recepción, operador, mantenimiento o disponibilidad. | Candidato, motivo, fuente, decisión, rol y fecha; no alimenta agregados ni rankings. | IF-07–10 | P1 | M | 2 |
| IF-12 | Servicio | Modelar indicadores de servicio/cobertura por activo o ámbito. | Unidad, periodo, denominador, fuente y alcance obligatorios; agregado sin clave queda no atribuido. | IF-06, IF-10 | P1 | L | 3 |
| IF-13 | Desarrollo | Publicar contexto territorial de desarrollo sin atribución causal. | Distingue cobertura/disponibilidad de impacto; no calcula productividad, empleo o bienestar sin evaluación sectorial. | IF-12 | P1 | M | 3 |
| IF-14 | API/CLI | Exponer ficha, operación, mantenimiento, integridad y evidencia pendiente. | Validación de parámetros, JSON y salida humana; fuente/corte/cobertura/límite en cada respuesta. | IF-04–13 | P1 | M | 3 |
| IF-15 | Integridad | Implementar `estricto=true` y reglas de bloqueo. | HTTP 409/código distinto de cero ante operación, cobertura o impacto sin evidencia mínima; pruebas negativas pasan. | IF-14 | P1 | M | 3 |
| IF-16 | MCP | Agregar tools MCP de solo lectura para activos e integridad. | Catálogo describe cobertura y límites; no expone mutaciones ni ingestas. | IF-14–15 | P2 | S | 4 |
| IF-17 | Piloto | Materializar cohorte declarada de activos por las tres familias. | Numerador, denominador, periodo y regla de selección visibles; no se presenta como universo regional. | IF-01–16 | P1 | M | 4 |
| IF-18 | Calidad | Ejecutar migración, pruebas, build, revisión de documentos y reporte de cobertura. | Suite pasa; SQL idempotente; fuentes y limitaciones reproducibles; no hay datos personales nuevos. | IF-17 | P0 | S | 4 |

## Definition of Done por ticket

- Fuente, fecha de extracción, cobertura y transformación documentadas.
- Prueba negativa contra vínculo por nombre, ubicación aproximada, avance, inauguración o presupuesto.
- Cada estado distingue hecho documentado, agregado no atribuible y vacío de evidencia.
- Ningún dato de personas, hogares, estudiantes o pacientes se persiste.
- API/CLI/MCP muestran la misma limitación y no prometen actualización automática.

## Bloqueos que no se fuerzan

1. No existe código de activo o documento que conecte obra y operador: se conserva como candidato, sin unión.
2. El sector publica acto de inauguración pero no recepción/operación: se publica como contexto, no como funcionamiento.
3. Solo existe gasto general de mantenimiento: no se asigna a una obra concreta.
4. Un indicador es provincial/regional y no tiene clave de activo: se informa agregado, no cobertura individual.
5. Se encuentra una correlación territorial con empleo, producción o bienestar: se registra como hipótesis, no como impacto atribuible.
