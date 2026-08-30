# PRD — Infraestructura que funciona y desarrollo territorial v1

**Estado:** núcleo implementado; piloto de fuentes y ampliación sectorial pendientes
**Fecha:** 2026-08-24
**Producto:** Rastro
**Ámbito:** API, base de datos, CLI, MCP, pruebas y documentación. **No incluye interfaz web.**

## 1. Decisión de producto

Rastro ya puede seguir una parte importante de la cadena pública: presupuesto, inversión, CUI, obra, territorio, avance físico y paralización. El siguiente salto no es otro ranking: es distinguir una obra registrada de un activo que presta el servicio prometido.

```text
Hoy:       presupuesto → inversión/CUI → obra → avance o paralización
Objetivo:  CUI → obra → cierre/recepción → activo → operador → mantenimiento
                                      → disponibilidad → servicio → territorio publicado
```

Cada flecha requiere una clave oficial y evidencia trazable. Una obra con 100% de avance no se presentará como operativa; un mantenimiento presupuestado no se presentará como mantenimiento realizado; un servicio disponible no se convertirá en mejora económica o social sin un indicador sectorial que lo pruebe.

## 2. Problema

La discusión pública suele terminar en “se gastó” o “la obra figura con avance”. Eso deja sin responder preguntas decisivas para ciudadanía, gestores y regidores:

1. ¿La obra fue recibida o puesta en servicio?
2. ¿Qué entidad opera el activo y desde cuándo?
3. ¿Hay mantenimiento identificado y qué evidencia hay de su ejecución?
4. ¿El servicio está disponible, restringido o fuera de servicio según una fuente publicada?
5. ¿Qué población, colegios, usuarios productivos o territorio reconoce la propia fuente como atendidos?

Sin ese tramo, Rastro puede describir ejecución física, pero no explicar si infraestructura de drenaje, agua/saneamiento, educación, transporte o riego se transformó en capacidad pública utilizable.

## 3. Objetivo y no objetivos

### Objetivo v1

Construir un registro de evidencia para La Libertad que permita responder, por activo verificable:

- cuál es su CUI/obra/activo y la fuente de cada clave;
- si existe evidencia de cierre, recepción o puesta en servicio;
- quién opera y quién mantiene, cuando la fuente lo publica;
- qué estado de disponibilidad se documentó y en qué fecha;
- qué cobertura o indicador de servicio publica el sector;
- qué vacíos impiden afirmar que la infraestructura funciona.

El piloto cubrirá tres familias con alto valor ciudadano: drenaje urbano, infraestructura educativa y agua/saneamiento. La incorporación de transporte, riego y otros sectores depende de pasar el mismo piloto de viabilidad.

### No objetivos

- No certificar que una obra está bien construida, es segura o cumple expediente técnico.
- No inferir funcionamiento a partir de devengado, avance, inauguración o nota de prensa.
- No calcular impacto económico, aprendizaje, salud o reducción de riesgo sin indicador causal/sectorial publicado.
- No asignar usuarios o barrios por cercanía geográfica, nombre parecido o domicilio de entidad.
- No construir una interfaz nueva, scraper o scheduler antes de validar la fuente y sus condiciones de uso.

## 4. Principios y jerarquía de evidencia

| Nivel | Evidencia o clave | Uso permitido | No permite afirmar |
|---|---|---|---|
| A | CUI + código INFOBRAS/activo/acta oficial | Une inversión, obra o activo por igualdad exacta. | Que el servicio opera. |
| A | Acta de recepción, cierre, entrega al operador o resolución | Estado de cierre/puesta en servicio según el texto. | Calidad o disponibilidad posterior. |
| A | Registro del operador con fecha/activo/indicador | Estado de disponibilidad y responsable publicados. | Cobertura fuera del alcance declarado. |
| B | Presupuesto/actividad de mantenimiento con clave de activo | Financiamiento o actividad identificada. | Mantenimiento ejecutado o calidad del activo. |
| C | Nota de inauguración, comunicado agregado, testimonio | Contexto e hipótesis para buscar la fuente primaria. | Cierre, operación o impacto individual. |
| Prohibido | Título parecido, ubicación aproximada, embeddings, sede de entidad | Ningún vínculo automático. | Todo vínculo oficial. |

El estado `SIN_EVIDENCIA_DE_OPERACION` describe el alcance de Rastro, no demuestra que el activo esté inoperativo en la realidad.

## 5. Modelo de grafo y datos

```text
investment(CUI) ──exacto──> public_work(INFOBRAS)
       │                         │
       │                         └──exacto/documento──> infrastructure_asset
       │                                                       │
       └──documento──> handover_event ─────────────────────────┤
                                                               ├──> operator_assignment
                                                               ├──> maintenance_evidence
                                                               ├──> availability_observation
                                                               └──> service_indicator → territorio/cobertura publicada
```

Entidades propuestas, append-only:

| Entidad | Claves y campos esenciales | Regla de integridad |
|---|---|---|
| `infrastructure_evidence_batch` | URL, tipo de fuente, checksum, extracción, cobertura, automatización. | Ninguna ingesta sin procedencia. |
| `infrastructure_asset` | `asset_id`, CUI, código INFOBRAS/código sectorial, sector, nombre literal, territorio publicado. | CUI/código opcionales solo si una fuente declara ausencia; no deduplicar por nombre. |
| `asset_handover_evidence` | activo, tipo de acto, fecha, entidad emisora, URL, literal. | No se convierte en estado operativo. |
| `asset_operator_assignment` | activo, entidad operadora, rol, vigencia, fuente. | No usar sede o ejecutora como operador por defecto. |
| `asset_maintenance_evidence` | activo, actividad/contrato, período, PIM/devengado si aplica, fuente. | Gasto no equivale a mantenimiento realizado. |
| `asset_availability_observation` | activo, fecha, estado, alcance, fuente, detalle literal. | `OPERATIVO` exige registro sectorial/operador; no nace de inauguración. |
| `asset_service_indicator` | activo o ámbito, indicador, unidad, periodo, valor, denominador, cobertura y fuente. | No atribuir un indicador agregado a un activo sin clave. |
| `asset_evidence_review_queue` | candidato, vacío, fuentes, estado y evento de revisión. | Candidatos no alimentan agregados. |

Estados controlados:

- cierre: `RECEPCION_DOCUMENTADA`, `CIERRE_DOCUMENTADO`, `SIN_EVIDENCIA_DE_CIERRE`;
- disponibilidad: `OPERATIVO_DOCUMENTADO`, `OPERACION_RESTRINGIDA_DOCUMENTADA`, `FUERA_DE_SERVICIO_DOCUMENTADO`, `SIN_EVIDENCIA_DE_OPERACION`;
- mantenimiento: `FINANCIAMIENTO_IDENTIFICADO`, `MANTENIMIENTO_DOCUMENTADO`, `SIN_EVIDENCIA_DE_MANTENIMIENTO`;
- cobertura: `COBERTURA_POR_ACTIVO`, `COBERTURA_AGREGADA_NO_ATRIBUIDA`, `NO_PUBLICADA`.

## 6. Contratos de salida

Rutas propuestas bajo `radar-ejecucion`, en solo lectura:

```text
GET /api/infraestructura/activos?departamento=LA%20LIBERTAD&sector=DRENAJE
GET /api/infraestructura/activos/{assetId}
GET /api/infraestructura/activos/{assetId}/operacion
GET /api/infraestructura/activos/{assetId}/mantenimiento?anio=2026
GET /api/infraestructura/integridad?departamento=LA%20LIBERTAD&estricto=true
GET /api/infraestructura/evidencia-pendiente?estado=PENDING
```

Cada ficha debe devolver: identidad del activo, enlaces exactos usados, período/corte, cobertura, estado de cada eslabón, fuentes y limitación. `estricto=true` debe responder `409 BLOQUEADO_POR_EVIDENCIA` si se intenta presentar funcionamiento sin recepción/operación verificable o cobertura individual sin denominador.

Comandos terminales previstos:

```powershell
npm run infraestructura:activos -- --sector DRENAJE
npm run infraestructura:ficha -- --activo ACTIVO-...
npm run infraestructura:operacion -- --activo ACTIVO-... --json
npm run infraestructura:mantenimiento -- --activo ACTIVO-... --anio 2026
npm run infraestructura:integridad -- --estricto
```

MCP expone las mismas consultas de lectura; ni MCP ni CLI disparan ingestas.

## 7. Desarrollo territorial: qué puede y qué no puede decir

Rastro podrá describir una **cadena de capacidad pública**: activo identificado → servicio documentado → cobertura publicada → territorio reconocido. Para desarrollo, el resultado permitido es descriptivo: “el operador reportó disponibilidad para X ámbito” o “la fuente publica Y usuarios/cobertura”.

No se atribuirán cambios en empleo, productividad, matrícula, aprendizaje, salud, comercio, valor del suelo o reducción de pérdidas a una obra específica sin una evaluación sectorial que publique metodología, periodo de comparación y ámbito identificable. La capa geoespacial futura puede enriquecer contexto de acceso y exposición a riesgo, pero no sustituye una clave del activo ni demuestra causalidad.

## 8. Fases y puertas de salida

| Fase | Resultado | Puerta de salida |
|---|---|---|
| 0. Viabilidad | Inventario de fuentes por sector, muestras y decisión de automatización. | Dos activos con claves reproducibles por familia o decisión de no automatizar. |
| 1. Identidad y cierre | Activo, CUI/obra, territorio y recepción/cierre cuando exista. | Sin unión por nombre; numerador/denominador de cohorte declarado. |
| 2. Operación y mantenimiento | Operador, mantenimiento, disponibilidad y cola de evidencia. | Ningún `OPERATIVO_DOCUMENTADO` sin fuente de operador/sector. |
| 3. Servicio y territorio | Indicadores de servicio y cobertura, conservando agregados separados. | Ninguna cobertura agregada se asigna a activo/distrito sin clave. |
| 4. Escala | MCP, auditoría de lotes, refresco manual y ampliación sectorial. | Pruebas, fuentes y límites publicados para cada familia. |

## 9. Riesgos y mitigaciones

| Riesgo | Mitigación |
|---|---|
| El sector no publica activos ni operación con claves durables. | Declarar `NO_AUTOMATIZAR_HASTA_VALIDAR`; mantener cola de evidencia, no reconstruir por texto. |
| Recepción e inauguración se confunden con operación. | Estados separados y prueba negativa obligatoria. |
| Mantenimiento se publica a nivel de actividad agregada. | Conservarlo como agregado, sin atribuirlo al activo. |
| Indicadores contienen datos personales o identifican menores. | Persistir solo agregado, activo, colegio/código o territorio; excluir personas. |
| Se usa un indicador como prueba de impacto. | Separar disponibilidad, cobertura e impacto en contrato y copy. |

## 10. Definición de terminado v1

- No hay UI, ranking único, scraper ni scheduler nuevos.
- Cada activo materializado tiene fuente, fecha de extracción, regla de vínculo y limitación.
- CUI, obra, activo, operador, mantenimiento y cobertura solo se enlazan con una clave/documento verificable.
- Pruebas negativas impiden que avance, inauguración, gasto o nombre se presenten como operación.
- CLI, API, MCP, contrato de datos y documentación reportan el mismo estado de evidencia.

## 11. Corte de implementación — 2026-08-24

- Se implementó el modelo de activo, cierre, operador, mantenimiento, disponibilidad, indicador y revisión append-only.
- Se materializaron dos activos con fuentes existentes: drenaje de Trujillo (CUI `2539202`) y educación en Casa Grande (sin CUI/código durable publicado).
- Los dos quedan deliberadamente bloqueados para una afirmación de funcionamiento: no se cargó recepción, operador, mantenimiento, disponibilidad ni indicador sin fuente primaria.
- Agua/saneamiento no fue materializado: la fase de viabilidad sigue pendiente y Rastro no crea una tercera familia por similitud territorial.
- API, CLI y MCP exponen el vacío y `estricto=true` devuelve bloqueo controlado mientras falten los eslabones mínimos.
