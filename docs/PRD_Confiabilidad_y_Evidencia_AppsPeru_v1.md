# PRD — Confiabilidad y evidencia operativa de AppsPerú

**Estado:** Implementado localmente; pendiente de commit, PR y ejecución en GitHub Actions
**Fecha:** 2026-08-23
**Ámbito:** Aplicaciones `apps/*`, `compras-publicas` y `mcp-server`
**Horizonte:** dos iteraciones cortas; sin fecha comprometida ni owner asignado

## 1. Decisión de producto

AppsPerú reúne datos públicos de fuentes con distintas coberturas y frecuencias. El siguiente incremento debe mejorar la **confiabilidad operativa**, la **trazabilidad visible** y la **calidad de entrega**, sin ampliar silenciosamente la cobertura ni convertir señales analíticas en conclusiones.

Este PRD convierte ocho oportunidades de bajo esfuerzo y alto impacto en requisitos verificables. No autoriza cambios en fuentes, scraping adicional, nuevas afirmaciones legales ni una automatización que publique resultados sin control.

## 2. Problema y oportunidad

Hoy existen tres fricciones repetidas:

1. Una falla de red o una API local caída puede dejar una vista o ingesta esperando más de lo razonable.
2. La persona usuaria no siempre ve con claridad si una respuesta proviene de una ingesta reciente, parcial o de una fuente que requiere actualización manual.
3. La validación de calidad no está centralizada en CI y los contratos del MCP no tienen pruebas propias.

Resolverlas reduce regresiones, hace más honesta la lectura del dato y disminuye el costo de operar varias aplicaciones independientes.

## 3. Objetivo, no objetivos y métrica de éxito

### Objetivo

Entregar una base común de entrega y observabilidad que permita detectar fallas antes del merge, responder de forma controlada ante dependencias no disponibles y mostrar la frescura/cobertura de cada dato antes de interpretarlo.

### No objetivos

- No crear un "score de irregularidad", ni modificar las etiquetas jurídicas de las señales existentes.
- No inferir que datos no localizados equivalen a incumplimiento.
- No incorporar al presente alcance la funcionalidad local de `bidders/postores`; requiere un PRD aparte por sus requisitos de cobertura, trazabilidad y lenguaje analítico.
- No poner secretos, claves de proveedores ni configuraciones locales de Ollama en el repositorio.
- No sustituir las decisiones de fuente y periodicidad documentadas en los data contracts.

### Métricas de éxito

| Métrica | Meta de aceptación |
|---|---|
| Validación antes de merge | El workflow CI ejecuta typecheck, tests y build donde aplique, y bloquea un PR si alguna etapa falla. |
| Falla controlada de dependencias | Toda llamada HTTP nueva o migrada tiene timeout y error distinguible entre timeout, red y respuesta no exitosa. |
| Lectura responsable | Las vistas que usan datos ingeridos muestran fuente, fecha de última corrida, alcance y advertencia de cobertura cuando exista. |
| Operación reproducible | `compras-publicas/api` se construye y arranca sin depender de `tsx watch`. |
| MCP verificable | El catálogo y cliente MCP tienen pruebas automatizadas para URL, timeout, respuesta no JSON y tamaño de salida. |

## 4. Usuarios y casos de uso

| Usuario | Necesidad | Resultado esperado |
|---|---|---|
| Analista público | Saber si puede interpretar una cifra y de qué periodo/fuente proviene. | Ve frescura, cobertura y enlace a metodología antes de usarla. |
| Operador de datos | Distinguir app caída, base no disponible y fuente externa lenta. | Usa `/health` y `/readyz`, con errores acotados por timeout. |
| Equipo de desarrollo | Evitar regresiones al modificar una de las apps. | CI homogéneo y scripts de build/start verificables. |
| Agente MCP | Consultar datos sin asumir frescura ni recibir respuestas ilimitadas. | Herramientas con contratos probados, timeout y límites explícitos. |
| Revisor de contratos menores | Ver grupos comparables sin una lista opaca de acusaciones. | Clusters explicables, enlaces a contratos y limitación visible. |

## 5. Alcance funcional: ocho issues

### IR-01 — CI de repositorio

**Prioridad:** P0 · **Esfuerzo:** S · **Dependencias:** ninguna

Crear un workflow de GitHub Actions para los paquetes que existan en el repositorio. Debe instalar dependencias desde cada `package-lock.json`, ejecutar typecheck y pruebas, y ejecutar build sólo cuando el paquete declare el script.

**Criterios de aceptación**

- El workflow se dispara en `pull_request` y `push` a `master`.
- Reporta con claridad qué paquete y fase falló.
- Usa versión Node fijada y cache de npm por lockfile.
- Un fallo de test/typecheck/build deja el check en rojo.
- No ejecuta ingestas, migraciones ni llamadas a fuentes externas.

### IR-02 — Política común de timeout para HTTP

**Prioridad:** P0 · **Esfuerzo:** S · **Dependencias:** IR-08 para los clientes web

Definir una utilidad de timeout/cancelación para llamadas HTTP. Aplicarla primero a los conectores e interfaces de mayor uso. El valor por defecto debe configurarse por entorno, tener máximo seguro y permitir una excepción documentada para descargas grandes.

**Criterios de aceptación**

- `AbortController` cancela las requests al vencer el timeout.
- El error indica `timeout`, `red` o `HTTP no exitoso`, sin imprimir secretos.
- Cada conector de descarga pesada declara su timeout excepcional y prueba al menos el caso de aborto.
- Ninguna interfaz web queda esperando indefinidamente si la API local no responde.

### IR-03 — Readiness de aplicación y base de datos

**Prioridad:** P0 · **Esfuerzo:** S · **Dependencias:** acceso de lectura a cada base local

Mantener `/health` como prueba de proceso vivo y agregar `/readyz` para verificar que la aplicación puede atender consultas: conexión a base, esquema de migración mínimo y dependencias estrictamente necesarias.

**Criterios de aceptación**

- `/health` no consulta la base y devuelve 200 mientras el proceso esté vivo.
- `/readyz` devuelve 200 sólo con conexión y migración requerida disponibles; 503 con causa no sensible cuando no lo estén.
- Hay prueba automatizada para estado listo y no listo.
- Las guías de arranque usan `/readyz` antes de declarar una app disponible.

### IR-04 — Frescura y cobertura visibles

**Prioridad:** P0 · **Esfuerzo:** M · **Dependencias:** IR-03; tablas/lotes de fuente ya existentes

Exponer por app un resumen de frescura: fuente, última ingesta exitosa, periodo/cobertura y advertencia de actualización manual. La interfaz debe usarlo en las vistas principales sin afirmar completitud cuando el conector sea parcial.

**Criterios de aceptación**

- Un endpoint de metadata devuelve fecha de extracción, fuente, cobertura y estado de última corrida.
- La interfaz muestra esos campos y un enlace a metodología/data contract.
- Si no hubo ingesta o la metadata está ausente, muestra “sin dato de frescura”, no una fecha inventada.
- Los textos diferencian cobertura nacional, departamental, muestra/páginas y periodo.

### IR-05 — Build y arranque reproducibles de Compras Públicas

**Prioridad:** P0 · **Esfuerzo:** XS · **Dependencias:** IR-01

Agregar scripts `build` y `start` a `apps/compras-publicas/api`; `dev` permanece para desarrollo. El runtime compilado debe funcionar con las migraciones y variables ya documentadas, sin depender de `tsx watch`.

**Criterios de aceptación**

- `npm run build` produce `dist/` sin errores de TypeScript.
- `npm run start` sirve `/health` y `/readyz` desde el artefacto compilado.
- CI ejecuta ambos pasos para este API.
- No se incorpora `.env` ni credenciales al artefacto o repositorio.

### IR-06 — Contratos y límites del MCP

**Prioridad:** P1 · **Esfuerzo:** S · **Dependencias:** IR-02, IR-01

Agregar pruebas al MCP y un límite explícito de tamaño/paginación de respuesta. El catálogo debe validar que sus paths y parámetros sólo apunten a aplicaciones/base URLs permitidas.

**Criterios de aceptación**

- Pruebas cubren `buildUrl`, codificación de path, query opcional, timeout y cuerpo no JSON.
- Una respuesta excedida se trunca de forma señalizada o requiere paginación; nunca se corta silenciosamente.
- Un 4xx de dominio se diferencia de un 5xx o una caída de infraestructura.
- La descripción de cada tool mantiene fuente, cobertura y frescura sin sobreafirmar.

### IR-07 — Clusters explicables de revisión semántica

**Prioridad:** P1 · **Esfuerzo:** M · **Dependencias:** embeddings existentes, evidencia de contratos y revisión humana

Complementar la bandeja de pares S12/S13 con clusters: municipalidad, objeto comparable, rango temporal, monto agregado, contratos que lo conforman y cobertura de evidencia. El cluster organiza trabajo de revisión; no califica una conducta.

**Criterios de aceptación**

- No agrupa ítems del mismo `source_contracting_id` como si fueran compras distintas.
- Cada cluster conserva IDs, textos originales, modelo de embedding, umbral y links a la fuente.
- El monto agregado se presenta como suma descriptiva, sin etiqueta automática de fraccionamiento.
- La interfaz permite abrir cada contrato y registrar estado humano: pendiente, revisado, descartado o evidencia adicional requerida.
- Incluye pruebas para duplicados, distintas versiones de modelo y ausencia de embeddings.

### IR-08 — Cliente HTTP común para frontends

**Prioridad:** P1 · **Esfuerzo:** M · **Dependencias:** IR-02

Extraer un cliente común para los frontends que centralice URL base, timeout, mensajes de error, codificación de paths, `cache: "no-store"` y contrato mínimo de fuente. Las apps conservan sus tipos de dominio.

**Criterios de aceptación**

- Se elimina la duplicación de helpers `getJson` equivalentes sin cambiar endpoints públicos.
- Paths dinámicos se codifican una vez y no se doble-escapan.
- Las vistas muestran un error entendible y no exponen stack traces o variables.
- Hay pruebas de path, timeout y respuesta no exitosa reutilizables.

## 6. Priorización y secuencia

| Fase | Entregables | Resultado que desbloquea |
|---|---|---|
| **Ahora** | IR-01, IR-02, IR-03, IR-05 | PRs verificables, despliegue reproducible y diagnóstico básico. |
| **Siguiente** | IR-04, IR-06, IR-08 | Datos interpretables, MCP confiable y UX homogénea. |
| **Después** | IR-07 | Revisión semántica más útil, una vez que las bases operativas estén estables. |

IR-02 e IR-08 se implementan en una misma rama técnica: la primera define la política y la segunda migra los adaptadores. No deben crear dos utilidades equivalentes.

## 7. Requisitos no funcionales

- **Seguridad:** claves sólo por variables de entorno; errores no exponen tokens, URLs con credenciales ni payloads sensibles.
- **Rendimiento:** metadata y readiness deben tener respuesta acotada; los clusters deben paginarse y no ejecutar comparación cuadrática en cada request.
- **Trazabilidad:** todo dato de fuente debe identificar sistema, fecha de extracción, alcance y transformación relevante.
- **Lenguaje:** “requiere revisión”, “patrón observable” y “evidencia no localizada” se mantienen separados de conclusiones jurídicas.
- **Compatibilidad:** endpoints actuales siguen funcionando durante la migración del cliente HTTP.

## 8. Riesgos y mitigaciones

| Riesgo | Mitigación |
|---|---|
| Convertir un timeout global en falla prematura de descargas grandes | Timeout configurable y excepción documentada por conector. |
| Mostrar una fecha de fuente como si fuera cobertura completa | Campos separados: extracción, periodo, método y alcance. |
| CI demasiado lento o frágil | Cache por lockfile; fases independientes; no ejecutar ingestas reales. |
| Cluster semántico interpretado como acusación | Copia obligatoria de limitación, evidencia enlazada y estado humano. |
| Migración del cliente rompe una URL ya escapada | Pruebas de doble codificación y despliegue gradual por app. |

## 9. Fuera de este PRD: postores/bidders

La funcionalidad local de postores queda deliberadamente fuera. Antes de proponerla para merge necesita un PRD específico que incluya: filtro territorial consistente, `source_batch_id` en los registros persistidos, inserción por lote, prueba de identidad postor/adjudicatario, cobertura declarada y lenguaje descriptivo —no inferencias de competencia o colusión sin metodología calibrada.

## 10. Definition of Done

- Cada issue tiene PR, revisión y pruebas automatizadas asociadas.
- CI en verde con rutas de build aplicables.
- Se valida en runtime la respuesta de `/readyz` y la metadata de frescura.
- Se inspecciona visualmente al menos una vista principal por app migrada.
- Documentación y data contracts actualizados cuando cambie el alcance o la temporalidad de una fuente.
- No hay secretos, datasets crudos ni resultados de embeddings versionados.
