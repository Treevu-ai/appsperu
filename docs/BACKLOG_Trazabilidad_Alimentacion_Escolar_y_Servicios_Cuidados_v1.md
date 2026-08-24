# Backlog ejecutable — Trazabilidad de alimentación escolar y servicios que cuidan

**Producto:** ALSOL
**Regla transversal:** API/terminal/MCP únicamente; ninguna interfaz nueva. Los vínculos solo entran con una clave y evidencia oficial.
**Estimación:** S ≤ 1 día, M 2–3 días, L 4–6 días. Las estimaciones no son compromiso de calendario.

## Corte de implementación — 2026-08-24

| Ticket | Estado | Resultado verificable o bloqueo |
|---|---|---|
| SC-01–02 | Bloqueado de forma explícita | Se inventariaron cinco fuentes y tres documentos primarios, pero no una descarga oficial estable con checksum y condiciones de uso verificadas. No se habilita conector automático. |
| SC-03 | Hecho | Las fuentes quedan clasificadas `MANUAL_ASISTIDA` o `NO_AUTOMATIZAR_HASTA_VALIDAR`. |
| SC-04–05 | Hecho | Migración idempotente: lote/contrato/fuente obligatorios; RUC solo admite 11 dígitos y no se deduce desde el nombre. |
| SC-06 | Modelo hecho; datos bloqueados | Catálogo exige código modular; no se materializó ningún colegio sin padrón oficial verificable. |
| SC-07 | Hecho, cohorte parcial | Tres lotes documentados de 35 ítems publicados; numerador, denominador y límite se entregan por API/CLI. |
| SC-08 | Modelo hecho; evidencia pendiente | No hay acta/guía vinculada a colegio en la cohorte, por lo que no se crea una entrega ficticia. |
| SC-09 | Hecho con alcance agregado | Se registra un control territorial agregado separado de la entrega, sin atribuirlo a proveedor, lote o colegio. |
| SC-10 | Código listo; datos bloqueados | La consulta por cumplimiento solo acepta RUC exacto; aún no existe uno en los lotes materializados. |
| SC-11 | Preexistente | La regla CUI→obra exacta sigue en el registro de infraestructura; no se amplió por título. |
| SC-12–13 | Hecho | Cinco rutas, CLI humana/JSON, integridad estricta y cinco tools MCP de solo lectura; pruebas y build pasan. |
| SC-14 | Hecho | Cola y eventos append-only, con comando de revisión y sin alimentar agregados/rankings. |
| SC-15 | Hecho, sin observaciones sembradas | Registro tipado, consulta por RUC exacto y bandeja no vinculable para referencias sin RUC; no se cargó denuncia, sanción ni antigüedad sin fuente primaria. |

## Secuencia estratégica

| Fase | Objetivo | Tickets comprometibles | Criterio de corte |
|---|---|---|---|
| 0 | Probar que la fuente permite una ingesta responsable. | SC-01 a SC-03 | Si no hay lotes/RUC reproducibles o condición de uso clara, no se automatiza. |
| 1 | Construir las claves de contratación y escuela. | SC-04 a SC-07 | No se publica proveedor ni colegio sin clave oficial. |
| 2 | Documentar entregas, controles y cumplimiento temporal. | SC-08 a SC-11 | No se afirma entrega/control sin documento. |
| 3 | Operar y ampliar cobertura con límites visibles. | SC-12 a SC-14 | No se declara cobertura total sin denominador y corrida trazable. |

## Tickets

| ID | Épica | Objetivo | Criterios de aceptación | Dependencias | Prioridad | Esfuerzo | Fase |
|---|---|---|---|---|---|---|---|
| SC-01 | Viabilidad de fuente | Inventariar portal, documentos, transparencia y expedientes de Wasi Mikuna para La Libertad. | Registra URL, fecha, acceso, condición de uso, identificadores, paginación, muestra, nulos, duplicados y estabilidad; clasifica API, descarga, interfaz o documento. | Ninguna. | P0 | S | 0 |
| SC-02 | Viabilidad de fuente | Obtener dos muestras reproducibles de lote/contrato con evidencia primaria. | Cada muestra contiene período, comité, lote o contrato, URL, checksum y fecha de extracción; se descarta toda fila sin identificador. | SC-01. | P0 | M | 0 |
| SC-03 | Gobernanza | Dictaminar automatización, frecuencia y límites de cobertura. | ADR/contrato declara “automatizable”, “manual asistida” o “no automatizable”; no se usa scraping si no hay fuente estable y permitida. | SC-01, SC-02. | P0 | S | 0 |
| SC-04 | Modelo de datos | Crear `food_service_period`, `food_lot` y `evidence_batch`. | Migración idempotente; período, modalidad, comité, lote, contrato y fuente son obligatorios para filas verificadas; conserva lote crudo/checksum. | SC-03. | P0 | M | 1 |
| SC-05 | Proveedores | Implementar vínculo lote–RUC–proveedor solo con documento oficial. | RUC de 11 dígitos validado; razón social literal, contrato/lote, URL y fecha obligatorios; test rechaza nombre sin RUC y domicilio como territorio. | SC-04. | P0 | M | 1 |
| SC-06 | Territorio escolar | Crear catálogo de colegios con código modular/clave oficial y ubigeo. | Fuente oficial y vigencia obligatorias; no se deduplica por nombre; provincia/distrito nulos si no se publican. | SC-02. | P0 | L | 1 |
| SC-07 | Integridad | Ingerir una primera cohorte declarada de lotes 2025 de La Libertad. | Reporta numerador, denominador, período y cobertura; no afirma “35 lotes completos” salvo evidencia para los 35. | SC-04 a SC-06. | P0 | M | 1 |
| SC-08 | Entregas | Modelar e ingresar acta/guía/recepción por colegio. | Una entrega requiere lote o contrato, colegio, fecha, estado, URL y detalle; `ENTREGADO`/`RECIBIDO` no pueden nacer de comunicado agregado. | SC-06, SC-07. | P1 | L | 2 |
| SC-09 | Control de calidad | Modelar controles de almacén, inocuidad y observaciones sin alterar entregas. | Se distingue control, resultado literal y alcance; una observación no cambia estado contractual ni genera acusación. | SC-08. | P1 | M | 2 |
| SC-10 | Cumplimiento proveedor | Integrar SUNAT/RNP por RUC exacto y fecha relevante. | Devuelve estado actual de fuente, fecha de extracción e inhabilitación en fecha de contrato como `true/false/no_verificable`; no retroproyecta estado actual. | SC-05. | P1 | M | 2 |
| SC-11 | Infraestructura | Normalizar la matriz CUI→obra→territorio de servicios educativos, agua y saneamiento. | CUI–INFOBRAS por igualdad exacta; fuente puede declarar CUI no publicado; no se une una obra por título. | Registro actual de servicios cuidados. | P1 | M | 2 |
| SC-12 | Consultas terminales | Publicar rutas/CLI de lotes, cobertura, proveedor y evidencia pendiente. | Parámetros validados, JSON y salida humana; cada respuesta entrega fuentes, periodo, cobertura, estado de vínculo y limitación. | SC-07 a SC-10. | P1 | M | 3 |
| SC-13 | Operación/MCP | Añadir herramientas MCP y reporte de integridad. | MCP solo lectura; `alimentacion:integridad --strict` falla ante relación no oficial o denominador ausente; pruebas de regresión pasan. | SC-12. | P2 | M | 3 |
| SC-14 | Revisión humana | Crear cola append-only para registros con evidencia incompleta. | Conserva candidato, razón, evidencia, decisión, rol y fecha; candidatos no alimentan agregados ni rankings. | SC-08 a SC-12. | P2 | M | 3 |
| SC-15 | Observaciones de proveedor | Separar sanción formal, denuncia, proceso, antigüedad del RUC y referencia externa. | RUC exacto para atribuir; denuncia exige autoridad/expediente/estado; antigüedad exige fecha oficial de inicio y contrato; fuente sin RUC queda sin vincular y no alimenta rankings. | SC-05. | P1 | M | 2 |

## Definition of Done por ticket

- Migración o código con prueba automática proporcional al riesgo.
- Fuente primaria, fecha de extracción, transformación y cobertura documentadas.
- Prueba negativa que impida vincular por nombre, embeddings, domicilio o fecha incompatible.
- Comando/API responde con limitación explícita cuando falte una fuente opcional.
- Sin UI, scheduler ni dato personal nuevo.

## Riesgos que bloquean, no se fuerzan

1. El portal solo permite lectura manual, cambia de formato o prohíbe automatización: se conserva flujo manual asistido y no se promete conector.
2. Los documentos no contienen RUC/lote/colegio: se mantiene `SIN_EVIDENCIA_INGRESADA`; no se completa con la muestra OCDS general.
3. No existe denominador oficial por distrito/período: se reporta cohorte materializada, no cobertura total.
4. La evidencia revela datos personales de menores: se excluyen antes de persistir; ALSOL trabaja con servicio, colegio y agregados, no personas.
