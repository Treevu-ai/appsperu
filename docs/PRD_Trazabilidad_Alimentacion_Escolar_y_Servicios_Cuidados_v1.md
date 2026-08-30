# PRD — Trazabilidad de alimentación escolar y servicios que cuidan

**Estado:** núcleo implementado; ampliación de evidencia bloqueada por claves fuente no publicadas
**Fecha:** 2026-08-24
**Producto:** Rastro
**Ámbito:** API, base de datos, conector/manual de evidencia, CLI, MCP y documentación. **No incluye interfaz web.**

## 1. Decisión de producto

Rastro debe pasar de informar cobertura agregada a responder una pregunta verificable: **¿qué evidencia pública conecta una necesidad infantil con una obra, un lote de alimentos, un proveedor, una entrega y un control?**

La cadena se conserva en dos planos que no se sustituyen entre sí:

```text
Infraestructura: CUI → obra INFOBRAS → territorio publicado → condición/avance publicado
Alimentación: colegio → lote/contrato → RUC proveedor → entrega/recepción → control de calidad
```

Una flecha existe solo si una fuente oficial publica ambas claves o declara expresamente la relación. El domicilio SUNAT del proveedor no es el colegio atendido; una nota de prensa sobre supervisión no es un acta de entrega; un nombre semejante nunca reemplaza CUI, RUC, código modular, lote o contrato.

## 2. Punto de partida

La versión actual de Rastro ya ofrece `GET /api/servicios-cuidados` y el comando `npm run servicios:cuidados`. Materializa tres registros iniciales:

1. Drenaje pluvial de Trujillo, con CUI `2539202` y territorio publicado.
2. Institución educativa de Casa Grande: beneficio, drenaje, agua y saneamiento publicados; **sin CUI ni código INFOBRAS atribuido**.
3. Servicio alimentario Wasi Mikuna La Libertad 2025: 276,812 estudiantes, 3,692 colegios, cinco comités y 27 de 35 ítems adjudicados. El registro declara cero RUC vinculados y cero entregas evidenciadas; no infiere vínculos desde compras generales.

La fuente oficial también describe supervisión de almacenes de proveedores en La Libertad y controles de calidad. Además, existen documentos públicos con referencias de contrato y entrega. Es evidencia de viabilidad, no prueba de que haya una descarga estructurada, completa y estable para todos los lotes, colegios y entregas. [Wasi Mikuna: cobertura 2025](https://www.gob.pe/institucion/wasimikuna/noticias/1102955-wasi-mikuna-refuerza-trabajo-con-directores-y-padres-de-familia-de-nuevas-instituciones-educativas-usuarias-en-la-libertad), [adjudicación 2025](https://www.gob.pe/institucion/wasimikuna/noticias/1082618-wasi-mikuna-en-la-libertad-se-adjudico-servicio-alimentario-para-mas-de-270-000-escolares), [supervisión de almacenes](https://www.gob.pe/institucion/wasimikuna/noticias?sheet=15).

### Implementación 2026-08-24

- Migración `012_food_traceability.sql`: período, lote, fuente, RUC opcional validado, colegio con código modular, entrega, control y cola append-only de revisión.
- API/CLI/MCP de solo lectura para lotes, cobertura, proveedor por RUC, integridad y evidencia pendiente; la revisión humana opera por CLI con evento, rol, nota y fecha.
- Piloto materializado: tres lotes de Comité La Libertad 5, 3 de 35 ítems publicados. No hay RUC exacto, colegios con código modular ni actas de recepción en esos documentos.
- Decisión operativa: las fuentes quedan `MANUAL_ASISTIDA` o `NO_AUTOMATIZAR_HASTA_VALIDAR`; no se añadió scraper, scheduler ni declaración de cobertura total.
- Observaciones de proveedor: el registro separa sanción formal, denuncia con expediente, proceso, antigüedad del RUC y referencia externa. No se sembraron casos sin RUC y fuente primaria; una referencia sin RUC queda deliberadamente no vinculable.

## 3. Problema

Las fuentes disponibles publican partes de la cadena en formatos distintos: anuncios agregados, expedientes/documentos, procesos de compra, supervisiones y, potencialmente, actas. Sin un contrato explícito se corre el riesgo de:

- convertir cobertura planificada en entrega realizada;
- vincular un proveedor al colegio equivocado por localidad o nombre;
- presentar una sanción vigente hoy como situación en la fecha de un contrato pasado;
- publicar “cero entregas” como ausencia real cuando solo falta extracción;
- convertir observaciones de control en acusaciones.

## 4. Objetivo y no objetivos

### Objetivo v1

Para La Libertad y un período de servicio declarado, crear un registro reproducible de evidencia que permita mostrar, por lote y proveedor cuando la fuente lo autorice:

1. colegios y territorio atendidos;
2. lote, proceso o contrato de compra;
3. proveedor y RUC exacto;
4. eventos de entrega, recepción, observación o no conformidad;
5. controles de calidad/inocuidad publicados;
6. cobertura, fecha de extracción, fuente y vacíos.

### No objetivos

- No identificar niñas, niños, familias, docentes ni otro dato personal.
- No calificar la calidad nutricional, eficacia pedagógica o impacto sanitario sin una fuente sectorial que lo mida.
- No atribuir responsabilidad, favorecimiento, incumplimiento o irregularidad por concentración, demora o vacío documental.
- No construir scraper ni scheduler antes del piloto de viabilidad y revisión de condiciones de uso.
- No prometer cobertura total de La Libertad hasta contar con un denominador oficial de colegios/lotes y una corrida trazable que lo cubra.

## 5. Fuentes, alcance y jerarquía de evidencia

| Nivel | Fuente o clave | Uso permitido | Estado inicial |
|---|---|---|---|
| A | Documento oficial con número de contrato/lote + RUC | Vínculo proveedor–lote–servicio. | Requerido para publicar proveedor. |
| A | Acta, guía, constancia de recepción o control con colegio/fecha | Evento de entrega/recepción. | Requerido para decir “entregado” o “recibido”. |
| A | CUI + INFOBRAS | Vínculo inversión–obra por igualdad exacta. | Ya operativo. |
| B | Listado oficial de colegios con código modular/ubigeo | Catálogo y denominador territorial. | Debe validarse en el piloto. |
| C | Nota de prensa, comunicado o supervisión agregada | Contexto y evidencia de que hubo acción, no cobertura individual. | Disponible; nunca completa una cadena. |
| No utilizable | Nombre parecido, domicilio SUNAT, embeddings, redes sociales | Ningún vínculo automático. | Prohibido. |

El portal del proceso y los documentos de transparencia se tratarán inicialmente como **interfaz/exportación por validar**, no como API pública documentada. La Fase 0 debe registrar URL, fecha, parámetros, licencia/condición aplicable, estabilidad, paginación, identificadores, nulos y duplicados antes de automatizar.

## 6. Modelo de datos objetivo

Extender el registro existente, sin borrar la evidencia actual, con las siguientes entidades append-only:

```text
food_service_period      periodo, unidad territorial, modalidad, fuente, denominador declarado
food_lot                 periodo, comité, lote, modalidad, contrato/proceso, estado, evidencia
food_supplier_link       lote, RUC, razón social publicada, contrato, fuente, vigencia
school_registry_link     colegio/código modular, ubigeo, fuente y vigencia
food_delivery_evidence   lote, colegio, fecha, estado, documento/acta, observación
food_quality_evidence    lote/proveedor/colegio si está publicado, tipo de control, resultado literal, fuente
evidence_batch           URL, checksum, extracción, transformación, cobertura y estado de validación
```

### Estados obligatorios

- `VINCULO_OFICIAL`: clave y fuente prueban la relación.
- `EVIDENCIA_DE_ENTREGA`: documento asocia lote/proveedor/colegio/fecha según lo publicado.
- `EVIDENCIA_DE_CONTROL`: acto de supervisión o control; no equivale a entrega si no la documenta.
- `CONTEXTO_AGREGADO`: solo describe cobertura o actividad agregada.
- `CANDIDATO_NO_USADO` y `REQUIERE_EVIDENCIA`: se conservan para revisión, no alimentan agregados.
- `SIN_EVIDENCIA_INGRESADA`: estado de cobertura de Rastro; no es evidencia de ausencia en el mundo real.

## 7. Contratos de salida y terminal

Las rutas nuevas se agregan a `radar-ejecucion` bajo `/api/servicios-cuidados`, preservando la actual:

```text
GET /api/servicios-cuidados?tipo=ALIMENTACION
GET /api/servicios-cuidados/alimentacion/lotes?periodo=2025&estado=...
GET /api/servicios-cuidados/alimentacion/cobertura?periodo=2025&provincia=...&distrito=...
GET /api/servicios-cuidados/alimentacion/proveedores/{ruc}
GET /api/servicios-cuidados/alimentacion/evidencia-pendiente?periodo=2025
```

Comandos previstos:

```powershell
npm run servicios:cuidados -- --tipo ALIMENTACION
npm run alimentacion:lotes -- --periodo 2025 --json
npm run alimentacion:cobertura -- --periodo 2025 --provincia TRUJILLO
npm run alimentacion:proveedor -- --ruc ###############
npm run alimentacion:integridad -- --periodo 2025 --strict
```

Cada salida debe devolver `fuentes`, `fechaExtraccion`, `periodo`, `cobertura`, `denominador`, `estadoVinculo` y `limitaciones`. Un comando `--strict` falla si se solicita publicar un agregado con denominador no verificable o si una fila usa una relación no oficial.

La implementación agrega `GET /api/servicios-cuidados/alimentacion/integridad?estricto=true`, que responde `409 BLOQUEADO_POR_EVIDENCIA` y hace que `npm run alimentacion:integridad -- --estricto` termine con código 2 cuando falten claves esenciales.

## 8. Cómo demostrar buena gestión sin fabricar rankings

Rastro no creará una nota única. Publicará una matriz de evidencia por cadena:

| Pregunta | Evidencia mínima positiva | Resultado permitido |
|---|---|---|
| ¿La obra está identificada? | CUI y obra exacta, o fuente que declare la ausencia de CUI. | “Identificada” / “clave no publicada”. |
| ¿El servicio fue contratado? | Lote/contrato y fuente. | “Contrato/lote publicado”. |
| ¿Llegó al colegio? | Acta, guía o recepción con colegio y fecha. | “Entrega/recepción documentada”. |
| ¿Hubo control? | Registro de control con alcance literal. | “Control documentado”. |
| ¿El proveedor tenía condición verificable? | RUC exacto y consulta fechada de SUNAT/RNP. | “Estado fuente a la fecha de consulta”; no certificación integral. |

Una entidad podrá mostrar mayor completitud documental si publica más eslabones verificables. Eso demuestra trazabilidad de publicación, no reemplaza auditoría, evaluación nutricional ni fiscalización competente.

## 9. Fases, riesgos y definición de terminado

| Fase | Resultado | Puerta de salida |
|---|---|---|
| 0. Viabilidad | Fuente, alcance y derechos de uso documentados; muestra con llaves reales. | Dos lotes de prueba con identificadores reproducibles o decisión explícita de no automatizar. |
| 1. Núcleo | Lotes, RUC y colegios solo con evidencia oficial; modelo y CLI. | Integridad referencial y pruebas negativas pasan. |
| 2. Entrega/control | Actas/controles y matriz de completitud. | No hay entrega sin documento ni proveedor sin RUC. |
| 3. Escala | Cobertura provincial/distrital declarada y MCP. | Denominador oficial y corte reproducible disponibles. |

Riesgos principales: fuente sin descarga estable, datos personales, códigos de colegio ausentes, periodos incompatibles, documentos que solo prueban contexto y cobertura incompleta. Mitigación: piloto primero, conservar fuente original/checksum, catálogo de estados, revisión humana y suspensión del conector si cambian condiciones o faltan llaves.

**Definición de terminado v1:** no hay UI nueva; migraciones y pruebas pasan; cada publicación incluye fuente/corte/cobertura; RUC, lote, colegio y entrega no se unen por texto; la salida separa evidencia, contexto y vacío; documentación/MCP/CLI se mantienen alineados.

## 10. Referencias oficiales iniciales

- [Wasi Mikuna: cobertura planificada La Libertad 2025](https://www.gob.pe/institucion/wasimikuna/noticias/1102955-wasi-mikuna-refuerza-trabajo-con-directores-y-padres-de-familia-de-nuevas-instituciones-educativas-usuarias-en-la-libertad).
- [Wasi Mikuna: proceso y adjudicación 2025 en La Libertad](https://www.gob.pe/institucion/wasimikuna/noticias/1082618-wasi-mikuna-en-la-libertad-se-adjudico-servicio-alimentario-para-mas-de-270-000-escolares).
- [Wasi Mikuna: controles y liberación de alimentos](https://www.gob.pe/institucion/wasimikuna/noticias/1124258-wasi-mikuna-mas-del-95-de-alimentos-se-distribuyeron-a-instituciones-educativas-a-nivel-nacional).
- [ANIN: institución educativa de Casa Grande](https://www.gob.pe/institucion/anin/noticias/1373519-anin-fortalece-la-infraestructura-educativa-con-nueva-institucion-en-la-libertad).
