# PRD — Observatorio Electoral y de Riesgo: cierre de brechas de la sesión 2026-09-10

**Estado:** Propuesto; pendiente de owner y fecha comprometida
**Fecha:** 2026-09-10
**Ámbito:** `apps/compras-publicas/api/src/minor-contracts`, `apps/proveedores-sancionados/api/src/routes`, nueva app `apps/candidatos-erm`, `apps/seguridad-ciudadana`, `docs/conectores.md`
**Horizonte:** dos a tres sprints; sin fecha comprometida ni owner asignado
**Origen:** ejercicio en vivo de cruce contrataciones×sanciones×candidatos para La Libertad y Lima (2026-09-10), documentado en `acuba/downloads/nota-editorial-la-libertad-rastro-datos-2026-09-10.md`, `acuba/downloads/nota-editorial-lima-rastro-datos-2026-09-10.md` y `acuba/downloads/nota-editorial-lima-seguridad-gasto-2026-09-10.md`, y en la memoria de sesión `project_rastro_sesion_2026-09-10_cruces_electorales`

## 1. Decisión de producto

El ejercicio del 2026-09-10 reutilizó infraestructura ya construida de Rastro (cruce por RUC contra el Tribunal de Contrataciones, detector de señales de riesgo, conformación societaria) y la combinó por primera vez con un dato que Rastro no tenía integrado: candidatos a las Elecciones Regionales y Municipales 2026. El resultado fue útil —ocho candidatos en Lima con sanción directa del Tribunal, tres con inhabilitación vigente durante la propia campaña— pero se construyó con improvisación deliberada: un script de riesgo con un cuello de botella real que lo hace impráctico a escala Lima, y una fuente de candidatos que depende de la buena voluntad de un tercero (Datapol) en vez de un conector propio.

Este PRD convierte esas improvisaciones en capacidad permanente de la plataforma: que el cruce candidato↔sanción se pueda repetir para cualquier región sin depender de un ejercicio manual de un día, y que el detector de señales corra a la escala real del país, no solo a la escala de la región más pequeña donde se probó.

Este PRD no autoriza scraping de plataformas protegidas contra automatización (Cloudflare Turnstile en `votoinformado.jne.gob.pe`, Incapsula en `web.jne.gob.pe`) — esa línea no se cruza bajo ninguna circunstancia. Tampoco introduce un dataset de "brechas de defensa militar": esa fuente no existe hoy en ningún portal público verificable, y no se aprueba inventar un proxy que aparente cubrir ese vacío.

## 2. Problema y oportunidad

El ejercicio del 2026-09-10 encontró cinco fricciones concretas:

1. **El detector de señales de riesgo (`run-signals.ts`, S01–S13 en `compras-publicas`) nunca había corrido para ninguna región del país**, y cuando se corrió manualmente para La Libertad (2,021 contratos) tardó varios minutos por un cuello de botella real: inserta cada señal encontrada con un `INSERT` separado, en un loop secuencial, dentro de la misma transacción. Al intentar repetirlo para Lima (20,352 contratos, un solo organismo —la Universidad Nacional Agraria La Molina— aportando 5,061) el costo se volvió impráctico y se decidió no correrlo.
2. **No existe un conector propio de candidatos electorales.** El cruce candidato↔sanción de hoy dependió de descargar a mano un JSON estático publicado por un tercero (Datapol), sin garantía de que siga disponible, actualizado o correctamente derivado de la fuente oficial en el futuro.
3. **El cruce persona↔sanción existente (`personas-sancionadas.ts` en `proveedores-sancionados`) solo compara contra personas ya sancionadas directamente** — no está diseñado para recibir una lista externa de DNI (como un padrón de candidatos) y decir cuáles de ellos tienen vínculo societario o sanción. Hoy ese cruce se hizo con un script de Node ad-hoc fuera de la plataforma, no con un endpoint reusable.
4. **La cobertura de conformación societaria (1,358 RUC a nivel nacional) es una muestra, no el universo.** Cualquier conclusión de "no se encontró vínculo" depende de esa cobertura parcial, y hoy no hay visibilidad de qué tan lejos está esa muestra del universo real de proveedores del Estado.
5. **El patrón de "varias resoluciones de inhabilitación en meses consecutivos"** (visto en Serpaem, Mejesa y Protektor en Lima) no tiene una señal dedicada — se encontró leyendo filas una por una, no porque el sistema lo señalara.

Cerrar estas brechas convierte un ejercicio periodístico de un día en una capacidad que Rastro puede repetir para cualquiera de las 25 regiones del Perú, de forma más rápida y sin depender de terceros para el dato más sensible (candidatos electorales).

## 3. Objetivo, no objetivos y métricas de éxito

### Objetivo

Que el cruce contrataciones×sanciones×candidatos, y el detector de señales de riesgo, se puedan ejecutar para cualquier región del país —incluyendo Lima— sin intervención manual ad-hoc ni dependencia de una fuente de terceros no auditada.

### No objetivos

- No se automatiza la ejecución periódica (cron/scheduler) de ningún conector como parte obligatoria de este PRD — eso es una decisión aparte, ya evaluada como P1 diferido en `PRD_Confiabilidad_Conectores_y_Cruces_v1.md` (CX-04).
- No se construye ninguna interfaz de usuario ni cambio en `apps/rastro-web` — este PRD es backend/ingesta/documentación únicamente.
- No se intenta obtener datos de `votoinformado.jne.gob.pe` ni `plataformaelectoral.jne.gob.pe` de forma automatizada, ni se solicita o gestiona ningún acceso especial a esas plataformas.
- No se construye ningún dataset o proxy de "brechas de capacidad de defensa militar" — se documenta como fuente inexistente, no se inventa un sustituto.
- No se ejecuta en este PRD el rollout completo a las 22 regiones restantes del país — eso es un ticket operativo de seguimiento (ver §9), no un cambio de código.

### Métricas de éxito

| Métrica | Meta de aceptación |
|---|---|
| Rendimiento del detector de señales | `npm run signals:minor-contracts` para un departamento con >15,000 órdenes menores (ej. Lima) completa en menos de 5 minutos, sin exceder la memoria disponible de un contenedor estándar. |
| Conector de candidatos | Existe una app `candidatos-erm` con ingesta propia, sin depender de un tercero no oficial, con al menos La Libertad y Lima verificadas contra `votoinformado.jne.gob.pe` de forma manual (no automatizada) como control de calidad. |
| Cruce persona↔sanción reusable | `GET /api/crossref/candidatos-sancionados` (o equivalente) acepta un departamento o lista de DNI y devuelve vínculos societarios y sanciones directas, sin script ad-hoc fuera de la API. |
| Cobertura de conformación societaria documentada | `docs/conectores.md` expone una cifra actualizada de cobertura (RUC ingeridos / estimado de universo) para que cualquier hallazgo futuro pueda citar el límite real, no una cifra fija desactualizada. |
| Señal de sancionado recurrente | El detector de señales expone una nueva señal (o extiende una existente) que marca a un proveedor con ≥2 resoluciones de inhabilitación distintas dentro de una ventana de 6 meses. |

## 4. Usuarios y casos de uso

| Usuario | Necesidad | Resultado esperado |
|---|---|---|
| Analista de riesgo de proveedores | Correr el detector de señales para cualquier región sin que tarde horas ni se cuelgue. | `run-signals.ts` optimizado, tiempo de corrida acotado y documentado. |
| Persona redactando una nota editorial sobre otra región | Tener el mismo cruce candidato↔sanción disponible sin repetir el trabajo manual de hoy. | Conector de candidatos propio + endpoint de cruce reusable. |
| Futuro mantenedor | Saber qué tan completa es la conformación societaria antes de citar "no se encontró vínculo" como si fuera exhaustivo. | Cifra de cobertura visible en `docs/conectores.md`. |
| Analista de patrones de sanciones | Detectar proveedores con sanciones repetidas sin releer manualmente el registro completo. | Señal dedicada de "sancionado recurrente" en el detector. |

## 5. Alcance funcional: seis issues

### OE-01 — Inserción por lotes en el detector de señales de riesgo

**Prioridad:** P0 · **Esfuerzo:** S · **Dependencias:** ninguna

`apps/compras-publicas/api/src/minor-contracts/run-signals.ts` inserta cada señal (`contract_signals`) y cada evidencia (`contract_evidence`) con una consulta `INSERT` separada, `await`-eada una por una dentro del mismo loop. Para La Libertad (2,021 contratos, 21,293 señales generadas) esto ya tardó varios minutos; para Lima (20,352 contratos) se decidió no correrlo por impráctico. Cambiar a inserción por lotes (`INSERT ... VALUES (...), (...), ...` con un tamaño de lote razonable, ej. 500 filas, o `pg-copy-streams`/`UNNEST` si el volumen lo justifica).

**Criterios de aceptación**

- La corrida completa para un departamento con >15,000 órdenes menores completa en menos de 5 minutos en un entorno de desarrollo estándar (no en producción con recursos ilimitados).
- El resultado (cantidad de señales generadas, distribución por tipo) es idéntico al que produciría la versión secuencial — este cambio es de rendimiento, no de lógica de negocio.
- Se mantiene la garantía transaccional actual (si la corrida falla a la mitad, no quedan señales parciales de ese `signal_run_id`).
- Test de regresión que compara el conteo de señales generadas para un fixture fijo antes y después del cambio.

### OE-02 — Conector propio de candidatos ERM

**Prioridad:** P1 · **Esfuerzo:** L · **Dependencias:** ninguna

Construir `apps/candidatos-erm` como app standalone, siguiendo el patrón de `apps/autoridades-electas` (Postgres propio, ingesta con `raw_*_batches`, tabla `_rejected`). La fuente de datos real —dado que no existe un dataset abierto oficial (CKAN/PNDA) para candidatos ERM 2026 y las plataformas interactivas del JNE están protegidas contra automatización— requiere una decisión explícita de fuente antes de escribir el conector: evaluar si JNE ofrece un canal de acceso a datos no interactivo (ej. una API pública documentada, un convenio de datos abiertos) antes de decidir seguir usando una republicación de terceros como Datapol. Si la única fuente viable sigue siendo un tercero, el conector debe declarar esa dependencia explícitamente (en `docs/conectores.md`, con la fecha de verificación y una nota de riesgo de disponibilidad), no ocultarla.

**Criterios de aceptación**

- Existe una fuente de datos identificada y documentada, con la decisión (oficial vs. tercero) justificada en `docs/conectores.md`.
- El esquema captura, como mínimo, los campos ya usados el 2026-09-10: nombre, DNI, cargo, organización política, ubigeo/circunscripción, estado (inscrito/tachado/excluido/renuncia).
- La ingesta para La Libertad y Lima reproduce, dentro de un margen de discrepancia documentado, los conteos ya verificados manualmente hoy (4,637 y 12,770 candidatos inscritos respectivamente).
- Ningún paso de la ingesta automatiza el acceso a `votoinformado.jne.gob.pe` ni a `plataformaelectoral.jne.gob.pe`.

### OE-03 — Endpoint reusable de cruce candidato↔sanción

**Prioridad:** P1 · **Esfuerzo:** M · **Dependencias:** OE-02

Generalizar el cruce que hoy vive en `apps/proveedores-sancionados/api/src/routes/personas-sancionadas.ts` (que solo parte de personas ya sancionadas) para aceptar también una lista de candidatos —vía `entityCode`/departamento contra la nueva app `candidatos-erm`— y devolver, para cada uno: vínculos societarios (`supplier_conformacion`) y sanciones directas (RUC-10 en `inhabilitaciones`/`multas`). Mismo criterio de enmascarado de documento ya usado en el endpoint existente.

**Criterios de aceptación**

- `GET /api/crossref/candidatos-sancionados?departamento=LIMA` (o ruta equivalente) devuelve el mismo tipo de resultado que se armó a mano el 2026-09-10, sin script de Node fuera de la API.
- El cruce es por DNI exacto, nunca por coincidencia de nombre.
- La respuesta distingue explícitamente "vínculo societario sin sanción en la empresa" de "sanción directa" — no los mezcla en una sola categoría de "hallazgo".
- Documentado en `docs/conectores.md` como nuevo cruce, con nota de la limitación de cobertura de `supplier_conformacion` (ver OE-05).

### OE-04 — Señal de "sancionado recurrente"

**Prioridad:** P2 · **Esfuerzo:** M · **Dependencias:** ninguna

Agregar al detector de señales de `compras-publicas` (o al cruce de `proveedores-sancionados`, lo que resulte más natural en el código existente) una señal que marque a un proveedor con **dos o más resoluciones de inhabilitación distintas dentro de una ventana de 6 meses** — el patrón observado manualmente en Serpaem, Mejesa y Protektor durante el cruce de Lima. Mismo criterio del resto del detector: es una preselección para revisión humana, no una conclusión.

**Criterios de aceptación**

- La señal se calcula sobre `inhabilitaciones` agrupando por RUC y comparando fechas `desde` entre resoluciones distintas.
- Corrida de prueba contra los datos reales de Lima confirma que Serpaem, Mejesa y Protektor quedan marcados.
- La explicación de la señal es tan explícita como las demás (ej. "N resoluciones de inhabilitación distintas en M meses; no determina patrón de conducta, requiere revisión humana").

### OE-05 — Documentar y, si es viable, ampliar la cobertura de conformación societaria

**Prioridad:** P2 · **Esfuerzo:** L (la ampliación; S si solo se documenta la cobertura actual) · **Dependencias:** ninguna

Como mínimo, documentar en `docs/conectores.md` la cobertura real de `supplier_conformacion` (1,358 RUC a la fecha) frente a una estimación del universo de proveedores activos del Estado, para que "no se encontró vínculo societario" se lea siempre junto a ese límite. Si se decide ampliar la cobertura, evaluar el costo de ingesta contra OSCE perfilprov a mayor escala antes de comprometerse a un volumen específico.

**Criterios de aceptación**

- `docs/conectores.md` incluye una cifra de cobertura actualizada y la fecha de la última medición.
- Si se ejecuta la ampliación, el ADR correspondiente documenta el criterio usado para seleccionar qué RUC ingerir (¿todos los adjudicatarios de `awards`/`minor_contracts`? ¿una muestra aleatoria? ¿priorizado por monto?).
- Ningún hallazgo futuro de Rastro puede citar "no se encontró vínculo societario" sin enlazar a esta cifra de cobertura.

### OE-06 — Nota de alcance: sin dataset de brechas de defensa militar

**Prioridad:** P3 (documentación únicamente) · **Esfuerzo:** S · **Dependencias:** ninguna

Registrar explícitamente en `docs/conectores.md` (ficha de `mindef`) que la app cubre convenios de compensación industrial, misiones de paz y entrenamiento en el extranjero — no brechas de capacidad, equipamiento ni cobertura territorial de las Fuerzas Armadas — y que no se ha encontrado, a la fecha, una fuente abierta oficial que cubra eso. Objetivo: que la próxima vez que alguien pida ese ángulo, la respuesta sea inmediata y no requiera repetir la investigación de hoy.

**Criterios de aceptación**

- `docs/conectores.md` refleja esta limitación en la ficha de `mindef`.
- No se crea ningún conector ni dato nuevo como parte de este ticket — es puramente documentación de un límite ya confirmado.

## 6. Priorización y secuencia

| Fase | Entregables | Resultado que desbloquea |
|---|---|---|
| **Ahora** | OE-01, OE-06 | El detector de señales deja de ser impráctico a escala Lima/nacional; el límite de "brechas de defensa" queda documentado para no reinvestigarlo. |
| **Siguiente** | OE-02, OE-03 | El cruce candidato↔sanción deja de depender de un ejercicio manual de un día y de una fuente de terceros no auditada. |
| **Después** | OE-04, OE-05 | Nueva señal de sancionado recurrente y cobertura de conformación societaria documentada (o ampliada). |

## 7. Requisitos no funcionales

- **Trazabilidad:** toda señal o cruce nuevo de este PRD debe distinguir explícitamente lo que es evidencia verificada de lo que es preselección para revisión humana — mismo principio ya aplicado en el detector de señales existente y en las notas editoriales del 2026-09-10.
- **No automatización de accesos protegidos:** ningún ticket de este PRD puede implicar, directa o indirectamente, bypasear Cloudflare Turnstile, Incapsula, o cualquier otro mecanismo anti-bot de una plataforma oficial.
- **Honestidad de cobertura:** cualquier cifra de "no se encontró X" debe poder citarse junto a la cobertura real de la fuente que la produjo (aplica en particular a OE-03 y OE-05).
- **Rendimiento verificado a escala real:** ningún cambio de este PRD se considera terminado si solo se probó con datos de La Libertad — debe verificarse contra el volumen de Lima como mínimo (criterio ya aprendido de la sesión que originó este PRD).

## 8. Riesgos y mitigaciones

| Riesgo | Mitigación |
|---|---|
| La única fuente viable para candidatos (OE-02) sigue siendo un tercero no oficial, y deja de estar disponible o cambia de formato sin aviso | Documentar la dependencia explícitamente con fecha de verificación; diseñar el conector para fallar de forma visible (no silenciosa) si el formato de origen cambia. |
| OE-01 (inserción por lotes) introduce un bug que genera señales duplicadas o incompletas | Test de regresión que compara el conteo y contenido de señales entre la versión secuencial (ya validada en La Libertad) y la nueva versión por lotes, sobre el mismo fixture. |
| OE-05 (ampliar conformación societaria) resulta más costoso de lo estimado si OSCE perfilprov no tiene un modo de consulta masiva | El criterio de aceptación mínimo de OE-05 es solo documentar la cobertura actual — la ampliación es condicional a que la evaluación de costo la justifique. |
| OE-03 expone datos de candidatos de forma que permita inferir su DNI completo | Mismo enmascarado ya usado en `personas-sancionadas.ts` (últimos 3 dígitos visibles) — no se expone DNI completo bajo ninguna circunstancia, incluyendo el de candidatos (aunque su hoja de vida electoral ya sea pública, se mantiene consistencia con el resto de la plataforma). |

## 9. Fuera de este PRD

- Rollout del cruce contrataciones×sanciones×candidatos a las 22 regiones restantes del Perú — es un ticket operativo de ejecución repetida, no de ingeniería; se vuelve trivial una vez completado OE-01 a OE-03, pero no es parte de este alcance.
- Leer y analizar el contenido completo (más allá del título) de los informes de Contraloría citados en la nota de inseguridad de Lima — requeriría descargar y procesar los PDF de `url_informe_completo`, fuera del alcance de este PRD.
- Tasas de criminalidad per cápita (cruzar SIDPOL con población por distrito) — requiere incorporar una fuente de población por ubigeo que hoy no está evaluada; queda como PRD separado si se decide perseguir.
- Automatización periódica (cron/scheduler) de cualquier conector tocado por este PRD — sigue las reglas ya establecidas en CX-04 de `PRD_Confiabilidad_Conectores_y_Cruces_v1.md`.
- Cualquier cambio en `apps/rastro-web` o en el catálogo MCP — si OE-02/OE-03 requieren exponer nuevas tools, eso queda como ticket de seguimiento fuera de este backlog.

## 10. Definition of Done

- Cada issue tiene PR, revisión y pruebas automatizadas asociadas.
- `docs/conectores.md` refleja el estado real (nuevo conector, nueva señal, cobertura documentada) después de cada PR mergeado de este PRD.
- OE-01 se verifica corriendo contra datos reales de Lima, no solo de La Libertad.
- OE-02 se verifica manualmente contra `votoinformado.jne.gob.pe` para al menos una muestra de candidatos, con el mismo estándar de verificación cruzada ya aplicado el 2026-09-10.
- Ningún cambio de este PRD automatiza el acceso a una plataforma protegida contra bots, ni introduce un dataset de brechas de defensa militar que no exista realmente en una fuente oficial.
