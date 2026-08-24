# PRD — Gobernanza de vínculos, cortes y evidencia de AppsPerú

**Estado:** Implementación inicial ejecutada y validada localmente

**Fecha:** 2026-08-24

**Ámbito:** APIs, bases de datos, conectores, MCP y comandos de terminal de AppsPerú. No incluye cambios de interfaz.

**Horizonte:** tres sprints cortos, en secuencia; sin fechas, capacidad ni responsables comprometidos.

## Estado de implementación — 2026-08-24

| Ticket | Estado | Entregable verificable |
|---|---|---|
| GOV-01 a GOV-04 | Implementado | `budget_coverage_snapshots`, selector temporal por observación, corrección de agregados, `npm run integrity:budget -- --json`. |
| GOV-05 a GOV-07 | Implementado | `entity_identity_links`, semilla controlada RUC/ubigeo/OECE y `GET /api/identities`. No se materializó ningún `MEF_ENTITY_CODE` sin evidencia. |
| GOV-08 y GOV-09 | Implementado | Registro persistente CUI–fuente–territorio–presupuesto; el CUI 2539202 queda explícitamente sin vínculo presupuestal oficial. |
| GOV-10 | Implementado | `npm run tablero:territorio -- --anio 2026 --categoria services --limite 50`, con ejecución territorial separada de sede y proveedor. |
| GOV-11 y GOV-12 | Implementado | Cruce de sanciones distingue estado actual, fecha de extracción e inhabilitación en fecha de adjudicación; SUNAT histórico permanece `NO_DISPONIBLE`. |
| GOV-13 | Implementado | Bitácora append-only y `npm run signals:review -- --signal <id> --decision REVIEWED|DISMISSED --rol <rol> --nota <texto> [--evidencia <url>]`. |
| GOV-14 | Implementado | `npm run integrity:report -- --json` reúne identidad, revisiones, territorio, cortes y CUI; declara límites de cobertura. |

Validación local al cierre: radar de ejecución **74** pruebas + compilación; compras públicas **89** pruebas + compilación; proveedores sancionados **16** pruebas + comprobación de tipos. Las cifras de los comandos son alcance materializado y no certificación externa del universo total.

## 1. Decisión de producto

AppsPerú ya cuenta con una red de identificadores públicos de alto valor: `SEC_EJEC`/`entity_code`, CUI, OCID, `award_id`, RUC, código OECE, ubigeo, distrito de ejecución y `fecha_corte`. El siguiente incremento no debe añadir una fuente nueva ni un nuevo score: debe convertir esa red en relaciones explícitas, reproducibles y temporalmente correctas.

La regla rectora es simple:

> Ninguna cifra, vínculo o señal podrá mezclar cortes, territorios o granularidades sin declarar cómo se vinculó, qué evidencia lo respalda y qué no puede concluirse.

Esto conserva la utilidad del observatorio sin transformar ausencia de datos, similitud de nombres o una señal descriptiva en una acusación.

## 2. Problema comprobado

### 2.1 Las claves existentes no describen la misma relación

| Clave | Relación válida | Límite que debe permanecer visible |
|---|---|---|
| CUI | Inversión de Invierte.pe ↔ obra de INFOBRAS | No existe en el CSV de gasto del MEF; una actividad presupuestal no obtiene CUI por similitud de texto. |
| `SEC_EJEC` / `entity_code` | Unidad ejecutora MEF ↔ inversión Invierte.pe | Es un vínculo de entidad, no prueba que un gasto financie un CUI específico. |
| OCID + `award_id` | Proceso OCDS ↔ adjudicación | La cobertura depende de la partición OECE recorrida y de la etapa publicada. |
| RUC | Proveedor adjudicado ↔ SUNAT / sanciones | Identifica al proveedor cuando el ID OCDS es un RUC válido; no identifica automáticamente a toda entidad pública. |
| Código OECE | Entidad contratante del buscador SEACE/OECD | Debe validarse contra el formato del `buyer_id`; no se debe convertir en `entity_code_mef` sin evidencia. |
| Ubigeo / distrito de ejecución | Territorio de sede o de ejecución | Domicilio de un proveedor, sede de la entidad y distrito beneficiado son dimensiones distintas. |
| `fecha_corte` | Versión temporal de PIA, PIM y devengado | No es opcional al sumar presupuesto: la misma observación puede existir en más de un corte. |

### 2.2 Riesgo inmediato: doble conteo de presupuesto

En la base local, el gasto de Gobierno Nacional dirigido a La Libertad para 2026 quedó materializado en dos cortes. Una suma sin corte fijo devuelve PIM de **S/ 6,718,611,922** y devengado de **S/ 3,696,283,985.82**; la misma cobertura en el último corte devuelve **S/ 3,359,305,961** y **S/ 1,848,141,992.91**. La diferencia no expresa mayor presupuesto: es la repetición temporal de las 278 filas.

La corrección no puede ser un `MAX(fecha_corte)` global. La cobertura regional/local y la cobertura nacional dirigida a un departamento se materializan en particiones distintas y pueden tener fechas diferentes. Debe seleccionarse un corte activo por **partición de cobertura** y devolverse cada fecha utilizada.

### 2.3 Caso guía: drenaje pluvial de Trujillo

El CUI 2539202 y su alcance territorial tienen fuentes oficiales verificables. La actividad `CONSTRUCCION DE SISTEMA DE DRENAJE PLUVIAL` del CSV de gasto del MEF no publica CUI ni distrito beneficiado. Por ello se muestran en secciones separadas: presupuesto por actividad y evidencia territorial del proyecto. Esta separación es el patrón obligatorio para todo vínculo futuro CUI–presupuesto.

## 3. Objetivo y métricas de éxito

### Objetivo

Entregar una capa de gobernanza de datos que permita consultar por terminal cifras presupuestales, inversiones, obras y contrataciones con: corte explícito, alcance territorial, clave de vínculo, fuerza del vínculo, evidencia y cobertura.

### No objetivos

- No crear un dashboard ni modificar interfaces web.
- No inferir CUI, distrito beneficiado, RUC institucional o causalidad por similitud de nombres.
- No declarar corrupción, direccionamiento, fraccionamiento, sobrecosto o incumplimiento a partir de patrones o datos incompletos.
- No automatizar nuevas descargas masivas ni introducir un scheduler en este alcance.
- No convertir el domicilio SUNAT de un proveedor en el lugar de ejecución de un contrato.

### Métricas de aceptación

| Métrica | Meta |
|---|---|
| Integridad temporal | Ningún endpoint que agregue presupuesto suma más de un corte de la misma partición de cobertura. |
| Trazabilidad | Todo agregado presupuestal indica las particiones y `fecha_corte` empleadas. |
| Integridad de vínculo | Cada cruce expone `metodo`, `fuerza`, `granularidad`, fuente de evidencia y fecha de validación. |
| Prudencia territorial | Un distrito queda `null` si la fuente no publica relación territorial verificable. |
| Revisión humana | Toda señal S11–S13 puede registrar decisión, responsable, fecha y evidencia revisada por CLI. |
| Operación | Un único comando genera un informe de integridad con cobertura, cortes activos y vínculos pendientes. |

## 4. Usuarios y decisiones que habilita

| Usuario | Decisión | Resultado verificable |
|---|---|---|
| Analista ciudadano | Comparar ejecución y contratos sin duplicar cortes | Ve fecha, cobertura y relación usada antes del monto. |
| Periodista o regidor | Solicitar explicación sobre una inversión u obra | Puede citar CUI, entidad, evidencia territorial y fuente primaria, sin atribuir presupuesto no publicado. |
| Operador de datos | Ejecutar una reingesta o diagnosticar una diferencia | Identifica la partición afectada y el corte activo por fuente. |
| Revisor de contratos menores | Revisar una secuencia semántica | Deja una conclusión humana auditable, no solo un estado binario. |
| Agente MCP | Responder sin sobreafirmar | Recibe datos compactos con límites, cobertura y fuerza de vínculo. |

## 5. Requisitos funcionales

### 5.1 Particiones y cortes activos

Crear un modelo común, inicialmente en `radar-ejecucion`, para declarar el corte utilizable de cada cobertura.

**Partición mínima de presupuesto**

```text
fuente=MEF gasto mensual
anio_fiscal=2026
origen_cobertura=SEDE_EJECUTORA | META_DEPARTAMENTO
departamento=LA LIBERTAD
nivel_gobierno=GOBIERNOS REGIONALES | GOBIERNOS LOCALES | GOBIERNO NACIONAL
```

Cada partición activa debe incluir `fecha_corte`, lotes fuente, conteo de filas, método de extracción y estado (`COMPLETA_EN_EL_ALCANCE`, `PARCIAL`, `NO_DISPONIBLE`). La API no combinará una partición `PARCIAL` con otra como si ambas fueran un universo completo.

**Reglas**

1. Un agregado selecciona una sola versión por partición, no todas las filas históricas.
2. Si una respuesta combina particiones con fechas distintas, expone un arreglo `cortesUsados` y no un único “al día”.
3. Un consumidor puede solicitar un corte histórico concreto; si no existe, recibe error de dominio, no un valor aproximado.
4. Las rutas de presupuesto existentes mantienen compatibilidad, pero añaden `coberturaTemporal`.

### 5.2 Registro de vínculos de identidad institucional

Crear una tabla/contrato de identidad institucional, no un nuevo matcher opaco. Cada relación será atómica y evidenciable:

```text
identificador_origen: tipo + valor
identificador_destino: tipo + valor
relacion: MISMA_ENTIDAD | UNIDAD_EJECUTORA_DE | ENTIDAD_CONTRATANTE_DE
metodo: CLAVE_EXACTA | FUENTE_OFICIAL | REVISION_HUMANA | CANDIDATA_NOMBRE
fuerza: EXACTA | VERIFICADA | CANDIDATA | RECHAZADA
evidencia: URL/recurso, campo, lote, fecha de consulta
valido_desde / valido_hasta / revisado_en
```

El primer uso es resolver de manera controlada los campos ya existentes de `municipalities`: RUC, código OECE, ubigeo y, solo con evidencia suficiente, `entity_code_mef`.

### 5.3 Registro de evidencia CUI–presupuesto–territorio

Generalizar el registro creado para lluvias. Una relación de proyecto debe poder declarar:

- CUI y nombre literal del proyecto;
- entidad responsable publicada;
- territorio publicado y el estado de consistencia;
- naturaleza del monto: PIA legal, PIM vigente, devengado, costo de inversión, estimación o solicitud;
- fuente oficial y fecha de observación;
- vínculo con una actividad MEF solo si la fuente expone una clave común o una relación explícita.

El sistema debe poder decir: “existe CUI y territorio verificables; no existe aún PIM atribuible al CUI”, que es más útil que llenar campos con hipótesis.

### 5.4 Temporalidad de cumplimiento de proveedores

Modificar los cruces de RNP/SUNAT para separar tres preguntas:

1. `estadoActualFuente`: situación reportada por la última extracción.
2. `inhabilitadoEnFechaAdjudicacion`: comparación entre fecha de adjudicación y periodo `desde/hasta`; `true`, `false` o `no_verificable`.
3. `estadoTributarioEnFechaAdjudicacion`: siempre `no_disponible` mientras no exista una fuente histórica fechada.

Una inhabilitación vigente hoy nunca se presentará como si demostrara una condición vigente al adjudicar en el pasado.

### 5.5 Territorio de ejecución como dimensión de análisis

Materializar un comando y endpoint terminal que agregue contratos menores por `execution_department`, `execution_province` y `execution_district`, separados de la sede de la entidad y del domicilio del proveedor. La salida debe incluir cobertura territorial, monto, proveedores distintos, categorías y enlaces fuente.

No se enlazará automáticamente un contrato con un CUI, obra o actividad presupuestal por coexistir en el mismo distrito.

### 5.6 Revisión humana trazable de señales semánticas

Extender `contract_signals` con una bitácora append-only de revisión: decisión, fecha, actor/rol no sensible, nota, evidencia consultada y resultado (`MANTENER_PARA_REVISION`, `DESCARTAR_COMO_NO_COMPARABLE`, `SOLICITAR_EVIDENCIA`, `CERRAR_SIN_CONCLUSION`).

Los comandos de terminal deben permitir listar, revisar y auditar decisiones. S11–S13 mantienen lenguaje de preselección y no generan sanción ni ranking automático.

### 5.7 Informe de integridad del ecosistema

Crear `npm run integrity:report` en el workspace o un comando equivalente que consulte en modo lectura las bases disponibles y devuelva:

- cortes activos y filas por partición MEF;
- duplicidad potencial por corte;
- cobertura de CUI, RUC, OCID, código OECE, ubigeo y distrito de ejecución;
- conteos de vínculos por fuerza;
- fuentes/lotes más recientes y alcance declarado;
- advertencias accionables, nunca acusaciones.

El informe no falla por una app no disponible: marca la cobertura como `NO_VERIFICADA` y termina con código distinto de cero solo si se invoca en modo `--strict`.

## 6. Contrato de salida común

Todo nuevo endpoint de cruce o reporte debe incluir:

```json
{
  "cobertura": {
    "alcance": "descripción humana",
    "estado": "COMPLETA_EN_EL_ALCANCE|PARCIAL|NO_VERIFICADA",
    "cortesUsados": [{ "particion": "...", "fechaCorte": "YYYY-MM-DD", "lotes": [1, 2] }]
  },
  "vinculo": {
    "metodo": "CLAVE_EXACTA|FUENTE_OFICIAL|REVISION_HUMANA|CANDIDATA_NOMBRE|NO_DISPONIBLE",
    "fuerza": "EXACTA|VERIFICADA|CANDIDATA|NO_DISPONIBLE",
    "granularidad": "ENTIDAD|PROYECTO|OBRA|CONTRATO|PROVEEDOR|TERRITORIO"
  },
  "limitaciones": []
}
```

El contrato no reemplaza los campos de dominio. Evita, en cambio, que una cifra correcta se interprete fuera de su alcance.

## 7. Priorización y roadmap

| Fase | Resultado | Incluye | No se inicia antes de |
|---|---|---|---|
| **Ahora — integridad base** | No hay doble conteo de cortes y cada respuesta informa su versión | Particiones activas, consultas corregidas, pruebas de regresión, reporte de integridad inicial | — |
| **Siguiente — identidad y proyecto** | Entidades y CUI se vinculan con evidencia y fuerza explícita | Registro institucional, registro CUI, territorio de ejecución | Integridad base |
| **Después — revisión responsable** | Señales y cumplimiento se ubican correctamente en el tiempo | Revisión humana, fecha de sanción, cobertura MCP | Identidad y proyecto |

### Criterio de corte de alcance

Si la capacidad es limitada, solo se comprometen los tickets P0 de la Fase Ahora. Agregar nuevas fuentes, geocodificación, scraping o interfaz desplaza trabajo de integridad y queda fuera de esta versión.

## 8. Backlog ejecutable

### Épica A — Integridad temporal del presupuesto

#### GOV-01 — Inventario de particiones MEF y cortes activos

- **Objetivo:** crear `budget_coverage_snapshots` y materializar las particiones locales y nacionales dirigidas ya existentes.
- **Criterios de aceptación:** registra fuente, año, origen de cobertura, departamento, nivel, corte, lotes, filas y estado; una migración idempotente; datos históricos no se borran; prueba con dos cortes de una misma partición.
- **Dependencias:** acceso de lectura a `radar-ejecucion`.
- **Prioridad:** P0.
- **Esfuerzo:** M.
- **Sprint/fase:** Sprint 1 — Ahora.

#### GOV-02 — Selector de corte por partición

- **Objetivo:** crear una vista/CTE reutilizable que seleccione una única versión activa por partición sin usar `MAX(fecha_corte)` global.
- **Criterios de aceptación:** no duplica las 278 filas nacionales de La Libertad; conserva simultáneamente la última cobertura regional/local disponible; devuelve los cortes utilizados; prueba de regresión reproduce el caso de dos cortes.
- **Dependencias:** GOV-01.
- **Prioridad:** P0.
- **Esfuerzo:** M.
- **Sprint/fase:** Sprint 1 — Ahora.

#### GOV-03 — Corregir agregados y cruces presupuestales

- **Objetivo:** aplicar GOV-02 a `execution`, `benchmark`, `radar-inversiones/crossref`, `compras-publicas/crossref`, `infobras/crossref`, `actividad-agraria/crossref`, `ceplan-estrategico/crossref` y `salud-institucional/score`.
- **Criterios de aceptación:** cada ruta declara `coberturaTemporal`; ninguna suma de PIM/devengado duplica cortes; compatibilidad de campos existente; pruebas API por ruta afectada.
- **Dependencias:** GOV-02.
- **Prioridad:** P0.
- **Esfuerzo:** L.
- **Sprint/fase:** Sprint 1 — Ahora.

#### GOV-04 — CLI de integridad presupuestal

- **Objetivo:** exponer `integrity:report --scope presupuesto`.
- **Criterios de aceptación:** muestra partición, corte, filas, PIA/PIM/devengado, alertas de corte múltiple y comando de reproducción; salida JSON opcional; no escribe datos.
- **Dependencias:** GOV-01, GOV-02.
- **Prioridad:** P1.
- **Esfuerzo:** S.
- **Sprint/fase:** Sprint 1 — Ahora.

### Épica B — Vínculos institucionales verificables

#### GOV-05 — Contrato y tabla de identidad institucional

- **Objetivo:** crear `entity_identity_links` con tipos de identificador, método, fuerza, vigencia y evidencia.
- **Criterios de aceptación:** soporta MEF, OECE, RUC y ubigeo; evita duplicados de la misma relación/evidencia; no permite promover una candidata a verificada sin fuente/método; data contract documentado.
- **Dependencias:** ninguna.
- **Prioridad:** P1.
- **Esfuerzo:** M.
- **Sprint/fase:** Sprint 2 — Siguiente.

#### GOV-06 — Semilla controlada de entidades La Libertad

- **Objetivo:** poblar primero relaciones directas ya observables y dejar una cola de revisión para las ambiguas.
- **Criterios de aceptación:** separa exactas, verificadas, candidatas y rechazadas; no llena `municipalities.entity_code_mef` sin evidencia; registra cobertura antes/después; cada fila tiene procedencia.
- **Dependencias:** GOV-05, acceso de lectura a compras, ejecución y padrón.
- **Prioridad:** P1.
- **Esfuerzo:** M.
- **Sprint/fase:** Sprint 2 — Siguiente.

#### GOV-07 — Endpoint/CLI de resolución institucional

- **Objetivo:** consultar una entidad por cualquier identificador sin convertir una candidata en match definitivo.
- **Criterios de aceptación:** retorna todas las claves conocidas, fuerza y fuentes; soporta `--solo-verificadas`; indica ausencia de RUC/MEF/OECE de manera explícita.
- **Dependencias:** GOV-05, GOV-06.
- **Prioridad:** P2.
- **Esfuerzo:** S.
- **Sprint/fase:** Sprint 2 — Siguiente.

### Épica C — Proyecto, obra y territorio

#### GOV-08 — Registro persistente de evidencia CUI–territorio

- **Objetivo:** sustituir el catálogo estático de proyectos territoriales por una tabla versionada de evidencia oficial.
- **Criterios de aceptación:** conserva CUI, título literal, entidad, territorios, tipo de monto, fuente URL/recurso, fecha y alerta de consistencia; no exige un PIM cuando la fuente solo publica PIA; migración y prueba con CUI 2539202.
- **Dependencias:** GOV-01 para declarar corte presupuestal; fuentes oficiales ya citadas.
- **Prioridad:** P1.
- **Esfuerzo:** M.
- **Sprint/fase:** Sprint 2 — Siguiente.

#### GOV-09 — Regla de unión CUI–actividad presupuestal

- **Objetivo:** crear una tabla de relaciones explícitas entre actividad MEF y CUI, con estado `NO_VINCULADO`, `VINCULO_OFICIAL` o `CANDIDATO_NO_USADO`.
- **Criterios de aceptación:** está prohibido crear relación por embeddings o similitud léxica; solo `VINCULO_OFICIAL` alimenta agregados; respuesta distingue PIA legal, PIM y devengado; test negativo con títulos parecidos sin clave común.
- **Dependencias:** GOV-08.
- **Prioridad:** P1.
- **Esfuerzo:** M.
- **Sprint/fase:** Sprint 2 — Siguiente.

#### GOV-10 — Terminal territorial de contratos menores

- **Objetivo:** crear agregado por territorio de ejecución, no por domicilio del proveedor ni sede de la entidad.
- **Criterios de aceptación:** filtros departamento/provincia/distrito/año/categoría; informa cobertura de `execution_district`; muestra monto, contratos, proveedores y fuente; no enlaza automáticamente con CUI/obra.
- **Dependencias:** datos de `minor_contracts.execution_*` ya materializados.
- **Prioridad:** P1.
- **Esfuerzo:** S.
- **Sprint/fase:** Sprint 2 — Siguiente.

### Épica D — Cumplimiento y revisión responsable

#### GOV-11 — Estado de inhabilitación a la fecha de adjudicación

- **Objetivo:** distinguir inhabilitación vigente hoy de inhabilitación vigente al adjudicar.
- **Criterios de aceptación:** compara fecha de adjudicación con `desde/hasta`; devuelve `true`, `false` o `NO_VERIFICABLE`; mantiene estado actual como campo separado; pruebas para periodos antes/durante/después y fecha ausente.
- **Dependencias:** fechas normalizadas de awards e inhabilitaciones.
- **Prioridad:** P0.
- **Esfuerzo:** S.
- **Sprint/fase:** Sprint 1 — Ahora.

#### GOV-12 — Estado tributario con alcance temporal explícito

- **Objetivo:** impedir que el padrón SUNAT actual se interprete como historial de una adjudicación.
- **Criterios de aceptación:** campos `estadoActualFuente`, `fechaExtraccionPadron` y `estadoHistoricoNoDisponible`; textos de API/MCP actualizados; pruebas de lenguaje/contrato.
- **Dependencias:** metadata de lotes SUNAT.
- **Prioridad:** P1.
- **Esfuerzo:** XS.
- **Sprint/fase:** Sprint 3 — Después.

#### GOV-13 — Bitácora append-only de revisión de señales

- **Objetivo:** registrar revisión humana de S11–S13 sin borrar la señal original.
- **Criterios de aceptación:** tabla con decisión, nota, actor/rol, fecha y evidencia; múltiples revisiones por señal; comando `signals:review`; endpoint de lectura; no hay acción que declare irregularidad.
- **Dependencias:** `contract_signals` y evidencia documental existentes.
- **Prioridad:** P1.
- **Esfuerzo:** M.
- **Sprint/fase:** Sprint 3 — Después.

#### GOV-14 — Informe integral de integridad y cobertura

- **Objetivo:** entregar un solo comando de lectura para controlar el ecosistema antes de publicar análisis.
- **Criterios de aceptación:** combina resultados de GOV-04, identidad, CUI, territorio, RUC y señales; soporta `--json` y `--strict`; reporta app no disponible sin inventar cero; pruebas con conexiones simuladas.
- **Dependencias:** GOV-04, GOV-06, GOV-08, GOV-10, GOV-13.
- **Prioridad:** P1.
- **Esfuerzo:** M.
- **Sprint/fase:** Sprint 3 — Después.

## 9. Capacidad, dependencias y riesgos

| Riesgo | Efecto | Mitigación |
|---|---|---|
| Usar un último corte global | Excluye una cobertura válida con fecha distinta | Particiones activas y arreglo de cortes por respuesta. |
| Convertir match de nombre en identidad legal | Falsos enlaces entre entidades | Registro de fuerza, evidencia y cola de revisión. |
| Confundir PIA, PIM, devengado, costo y solicitud | Comparaciones engañosas | Tipo de monto obligatorio y prohibición de suma entre naturalezas distintas. |
| Usar territorio de proveedor como destino del contrato | Lectura territorial errónea | Dimensiones separadas y nombres de campo explícitos. |
| Interpretar señal o sanción actual como hecho histórico | Riesgo reputacional y jurídico | Comparación temporal trivalente y lenguaje de evidencia. |
| Dependencia de varias bases locales | El informe integral puede quedar incompleto | Modo no estricto, estados `NO_VERIFICADA` y salida parcial. |

## 10. Requisitos no funcionales

- **Solo terminal/API:** no se modifica ninguna interfaz web en esta iniciativa.
- **Lectura antes que escritura:** los reportes, diagnósticos y cruces no alteran lotes crudos ni hechos normalizados.
- **Append-only:** evidencia, cortes y revisiones se agregan; no se reescriben hechos fuente para “corregir” una interpretación.
- **Seguridad:** URLs o mensajes no exponen secretos; las operaciones de revisión registran actor lógico, no credenciales.
- **Rendimiento:** índices por identificador y corte; paginación para registros de evidencia; ninguna consulta terminal recorre payloads JSONB crudos.
- **Compatibilidad:** se mantienen los campos actuales mientras se añade `coberturaTemporal` y `vinculo`.

## 11. Definition of Done

- Tickets P0 integrados y con pruebas que reproducen el doble conteo hallado.
- Ningún agregado de presupuesto consume cortes múltiples sin manifestarlo.
- CUI, territorio y presupuesto conservan relación explícita o ausencia explícita; no hay inferencia por nombre.
- El cruce de sanciones distingue presente, pasado verificable y no verificable.
- Los comandos terminales generan salida reproducible con fuente, corte, cobertura y limitaciones.
- Data contracts y catálogo MCP actualizados para cualquier endpoint nuevo o modificado.
- No se realizan cambios de interfaz, no se versionan secretos y no se publican conclusiones jurídicas automáticas.
