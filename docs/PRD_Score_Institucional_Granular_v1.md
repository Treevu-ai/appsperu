# PRD — Score institucional: granularidad de nivel y evaluación

**Estado:** Propuesto; pendiente de confirmar 2 decisiones de producto (SI-04, SI-05) antes de implementar
**Fecha:** 2026-09-07
**Ámbito:** `apps/salud-institucional/api` (score compuesto), `apps/infobras/api` y `apps/compras-publicas/api` (operación del crossref que lo alimenta)
**Horizonte:** dos sprints
**Origen:** pedido explícito de actualizar el score institucional "más granular en la clasificación de nivel y evaluación", aclarado con el usuario (2026-09-07): granularidad de **nivel** = nivel de gobierno + nivel territorial + bandas de score; granularidad de **evaluación** = arreglar los componentes rotos (ya resuelto, ver DQ-05 en `docs/TICKETS_Calidad_Datos_Auditoria_La_Libertad_v1.md`) + más sub-métricas + metodología de ponderación. Alcance: La Libertad.

## 1. Decisión de producto

Al investigar el pedido se encontraron dos cosas antes de diseñar nada:

1. **El score ya no está roto.** El componente `obrasNoParalizadas`/`comprasNoConcentradas`/`saludTributariaProveedores` aparecía vacío para el 100% de las entidades del país porque los jobs `npm run crossref:build` de `infobras` y `compras-publicas` nunca se habían corrido en este entorno — no era un bug de código. Se corrieron ambos (ver DQ-05, cerrado): el score de La Libertad pasó de 0/130 entidades con 3+ de 5 componentes a **93/130 (49 con 5/5)**. Este PRD ya no parte de un score estructuralmente pobre.
2. **El mismo patrón de "columna ya disponible, nunca expuesta" que se corrigió en `radar-ejecucion` (DQ-02) existe también aquí.** `apps/salud-institucional/api/src/routes/score.ts` ya hace `JOIN territories t ON t.ubigeo = e.ubigeo` y filtra por `t.departamento`, pero nunca selecciona `e.nivel_gobierno`, `t.provincia` ni `t.distrito`. Igual que en DQ-02, gran parte de la "granularidad de nivel" pedida no requiere una fuente de datos nueva — requiere exponer columnas que la query ya toca.

Este PRD separa explícitamente lo que es trabajo de ingeniería directo (exponer nivel de gobierno y territorio, agrupar/rankear por cohorte) de lo que es una **decisión de producto que el usuario debe confirmar antes de implementar** (los umbrales exactos de las bandas de score, y si el score pasa de promedio simple a ponderado). No se implementa SI-04 ni SI-05 sin esa confirmación explícita — consistente con la regla de validación adoptada para este proyecto ("¿cómo sabré que funciona?" no tiene una respuesta objetivamente correcta para un umbral de banda; es una elección de negocio).

## 2. Problema y oportunidad

Hoy `GET /api/score` devuelve una lista plana de 130 entidades ordenada por `scoreCompuesto` de mayor a menor, sin distinguir que comparar una Municipalidad Distrital de 3,000 habitantes contra la Sede Central del Gobierno Regional en el mismo ranking mezcla realidades muy distintas. Tampoco hay forma de leer "cómo le va a la provincia de Otuzco" o "cómo le va a los gobiernos locales en particular" sin descargar las 130 filas y agruparlas a mano — el mismo problema de agregación manual que motivó DQ-06/DQ-08 en el PRD de Calidad de Datos.

Además, un número solo (`scoreCompuesto: 76.8`) no comunica qué tan bueno es ese 76.8 sin una referencia — una clasificación cualitativa (banda) ayuda a un lector no técnico a interpretar el número sin tener que conocer la distribución completa.

## 3. Objetivo, no objetivos y métricas de éxito

### Objetivo

Exponer nivel de gobierno y territorio (provincia/distrito) en `GET /api/score`, permitir comparar/rankear dentro de cada cohorte de nivel de gobierno, agregar el score a nivel provincia, y clasificar cada entidad en una banda cualitativa — todo para La Libertad, sin romper el contrato de respuesta actual (aditivo).

### No objetivos

- No se cambia la fórmula de cada componente individual (`ejecucion`, `obrasNoParalizadas`, etc.) — eso es un PRD aparte si se decide.
- No se implementan sub-métricas nuevas (SI-06) sin evaluación previa — la auditoría encontró categorías nuevas (causal de paralización, modalidad de control, tipo de infracción) que podrían ser componentes 6+, pero convertir cualquiera de ellas en un componente del score es una decisión de producto, no una extensión automática.
- No se decide unilateralmente pasar a promedio ponderado (SI-05) — se evalúa y se presenta al usuario, igual que las bandas.
- No se automatiza `crossref:build` como parte obligatoria de este PRD (queda relacionado con DQ-11 redefinido, en el backlog de Calidad de Datos) — pero si no se automatiza, este PRD sí exige un chequeo de salud mínimo (SI-07), porque un score "granular" construido sobre un crossref que puede volver a vaciarse en silencio sería un paso adelante y dos atrás.

### Métricas de éxito

| Métrica | Meta de aceptación |
|---|---|
| Nivel de gobierno expuesto | `GET /api/score` incluye `nivelGobierno` por entidad; soporta agrupar/filtrar por él. |
| Territorio expuesto | `GET /api/score` incluye `provincia`/`distrito` por entidad, derivados del mismo JOIN que la query ya hace. |
| Ranking por cohorte | Es posible obtener el ranking de una entidad *dentro de su nivel de gobierno* (ej. "3° de 85 Gobiernos Locales"), no solo su posición en el ranking mezclado. |
| Agregación provincial | Existe un endpoint o parámetro que devuelve el score promedio (de las entidades con score disponible) por provincia. |
| Bandas de score | Cada entidad con `scoreCompuesto` no nulo recibe una banda cualitativa, con los umbrales confirmados explícitamente por el usuario antes de mergear. |
| Salud del crossref | Existe una forma de verificar (endpoint o chequeo) si `entity_crosswalk` de infobras/compras-publicas está vacío o desactualizado, para no repetir silenciosamente lo que pasó con DQ-05. |

## 4. Usuarios y casos de uso

| Usuario | Necesidad | Resultado esperado |
|---|---|---|
| Analista comparando municipalidades | Rankear solo Gobiernos Locales entre sí, no contra sedes regionales/nacionales. | `nivelGobierno` expuesto + ranking por cohorte (SI-01, SI-02). |
| Analista territorial | Saber qué provincia de La Libertad tiene, en promedio, mejor score institucional. | Endpoint de agregación provincial (SI-03). |
| Lector no técnico de un reporte | Entender "76.8" sin memorizar la distribución completa. | Banda cualitativa con umbral documentado (SI-04, tras confirmación). |
| Equipo de datos | No repetir el episodio de DQ-05 (score colapsado meses sin que nadie lo note). | Chequeo de salud del crossref (SI-07). |

## 5. Alcance funcional: ocho issues

Ver detalle en [`docs/TICKETS_Score_Institucional_Granular_v1.md`](TICKETS_Score_Institucional_Granular_v1.md). Resumen:

- **SI-01** (P0, S) — Exponer `nivelGobierno`, `provincia`, `distrito` en `GET /api/score`.
- **SI-02** (P0, M) — Ranking/posición dentro de la cohorte de nivel de gobierno.
- **SI-03** (P1, M) — Agregación de score por provincia.
- **SI-04** (P0, decisión + S implementación) — Bandas de score cualitativas — **requiere confirmar umbrales con el usuario antes de implementar**.
- **SI-05** (P1, evaluación) — Evaluar promedio ponderado vs. simple — **requiere confirmar con el usuario si se implementa tras la evaluación**.
- **SI-06** (P2, evaluación) — Evaluar sub-métricas nuevas como componentes adicionales del score.
- **SI-07** (P1, S) — Chequeo de salud del crossref (filas y fecha de última construcción).
- **SI-08** (P1, S) — Corregir la imputación silenciosa de 0 cuando el PIM de una entidad está registrado en cero — hallazgo encontrado el 2026-09-08 al documentar la metodología del score, contradice el propio principio de diseño del código ("nunca se asume 0 ni 100").

## 6. Priorización y secuencia

| Fase | Entregables | Resultado que desbloquea |
|---|---|---|
| **Ahora (Sprint 1)** | SI-01, SI-02, SI-07 | Score expone nivel/territorio y rankings por cohorte; existe forma de detectar si el crossref vuelve a vaciarse. |
| **Ahora (Sprint 1.5, sin bloqueo de confirmación)** | SI-08 | El componente de ejecución deja de imputar 0 cuando el PIM real es 0 — no requiere decisión de producto, es una corrección de un defecto que contradice el diseño ya documentado del código. |
| **Siguiente (Sprint 2, sujeto a confirmación)** | SI-04 (con umbrales confirmados), SI-03 | Bandas cualitativas visibles; agregación provincial disponible. |
| **Después (evaluación, sin fecha comprometida)** | SI-05, SI-06 | Ponderación y sub-métricas nuevas, solo si la evaluación y la confirmación del usuario lo justifican. |

## 7. Requisitos no funcionales

- **Aditivo:** ningún campo nuevo reemplaza uno existente en la respuesta de `/api/score`; `componentesUsados` y `componentes` mantienen su forma actual.
- **Sin inventar:** una entidad sin `ubigeo` resoluble sigue devolviendo `provincia`/`distrito` en `null`, nunca un valor supuesto — mismo estándar que DQ-02.
- **Bandas trazables:** los umbrales de banda quedan documentados en `docs/data-contracts` (no solo en el código), con la fecha y quién los confirmó.
- **No repetir DQ-05:** SI-07 es un requisito de este PRD, no opcional, precisamente porque este PRD se apoya en que el crossref siga poblado.

## 8. Riesgos y mitigaciones

| Riesgo | Mitigación |
|---|---|
| Los umbrales de banda se eligen arbitrariamente sin sentido estadístico | Antes de fijarlos, calcular la distribución real de `scoreCompuesto` en las 93 entidades con 3+ componentes (percentiles), y proponer umbrales basados en esa distribución real, no en números redondos sin base — presentado al usuario para confirmar, no decidido unilateralmente. |
| SI-05 (ponderado) cambia el orden del ranking de forma que parezca arbitraria | Si se implementa, mostrar explícitamente los pesos usados en la respuesta (`pesos: {...}`), nunca ocultos. |
| El crossref se vacía de nuevo entre el chequeo de salud (SI-07) y su próxima revisión manual | SI-07 es un mínimo (detectar), no una garantía — si se quiere prevenir en vez de solo detectar, esa es la automatización evaluada en DQ-11 (backlog de Calidad de Datos), fuera de este PRD. |

## 9. Fuera de este PRD

- Automatización de `crossref:build` (relacionado, vive en DQ-11 del backlog de Calidad de Datos).
- Cambiar la fórmula de cualquiera de los 5 componentes existentes.
- Implementar SI-05/SI-06 sin confirmación explícita previa del usuario.
- Cambios en `apps/rastro-web` — si SI-01/SI-04 requieren ajuste de frontend, quedan como ticket de seguimiento.

## 10. Definition of Done

- Cada ticket tiene PR, revisión y tests automatizados (suite completa de `salud-institucional/api` en verde, no solo el archivo tocado).
- SI-04 y SI-05 no se mergean sin la confirmación explícita del usuario sobre umbrales/pesos, documentada en el PR o en `docs/data-contracts`.
- `docs/conectores.md`/`docs/data-contracts` reflejan el estado real en el mismo PR.
- Verificado en vivo contra el servidor local (puerto 4007) antes de dar por cerrado cualquier ticket — no basta con que los tests unitarios pasen si el endpoint real no se probó.
