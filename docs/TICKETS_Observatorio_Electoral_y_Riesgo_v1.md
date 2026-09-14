# Tickets — Observatorio Electoral y de Riesgo v1

**Producto:** AppsPerú / Rastro (backend/ingesta)
**PRD:** [`docs/PRD_Observatorio_Electoral_y_Riesgo_v1.md`](PRD_Observatorio_Electoral_y_Riesgo_v1.md)
**Serie de tickets:** **OE-** (Observatorio Electoral — nueva serie, no colisiona con AE-/CG-/CT-/CX-/DQ-/GOV-/IF-/IR-/PN-/PS-/RF-/RUC-/SC-/SGR-/SI-/SS- ya usadas en otros backlogs)
**Regla transversal:** ningún ticket de esta serie automatiza el acceso a una plataforma protegida contra bots (Cloudflare Turnstile, Incapsula); todo cruce nuevo distingue evidencia verificada de preselección para revisión humana; `docs/conectores.md` se actualiza en el mismo PR que introduce o cambia un conector/cruce.
**Estimación:** XS ≤ medio día · S ≤ 1 día · M 2–3 días · L 4–6 días (esfuerzo relativo, no calendario).

**Origen:** ejercicio en vivo de cruce contrataciones×sanciones×candidatos para La Libertad y Lima (2026-09-10) — ver memoria de sesión `project_rastro_sesion_2026-09-10_cruces_electorales` y las tres notas editoriales en `acuba/downloads/`.

> **Estado real (2026-09-10, actualizado):** OE-01 y OE-02 implementados y verificados contra datos reales.
>
> **OE-01**: `run-signals.ts` inserta ahora por lotes de 500 (`jsonb_to_recordset`) en vez de una query por señal. Verificado dos veces: (1) La Libertad reproduce exactamente los mismos números que la corrida secuencial de hoy (2,021 contratos, 21,293 señales, 93,577 filas de evidencia) en 69s (antes: 15+ minutos, con un intento colgado). (2) Lima —el caso que antes se decidió no intentar— corre completo en 5m47s (11,572 contratos tras el filtro de monto ≤8 UIT, 85,032 señales), consistente en base. Tests: 3 nuevos en `run-signals.test.ts` (batching, no-regresión de señales generadas, rollback ante fallo), suite completa de `compras-publicas/api` en 116/116. Nota: el objetivo de "<5 min" del PRD se cumple para La Libertad pero no exactamente para Lima (5m47s) — mejora real y reportada tal cual, sin forzar la cifra.
>
> **OE-02**: nueva app `apps/candidatos-erm` (puerto 4027/postgres 5458), mismo patrón de `autoridades-electas` (Postgres propio, `raw_*_batches`, `*_rejected`). Fuente: Datapol (JSON estático, tercero no oficial — se investigó primero si el JNE ofrecía un canal no interactivo y no lo tiene), documentada explícitamente en `docs/conectores.md` con la fecha de verificación y el riesgo de disponibilidad. DNI sin enmascarar a nivel de almacenamiento (mismo dato que el JNE ya publica sin enmascarar en la hoja de vida pública) pero enmascarado en `GET /api/candidatos`. Verificado en vivo: 101,948 candidatos nacionales, 0 rechazados; La Libertad (4,637) y Lima (12,770) coinciden exactamente con el conteo manual del 2026-09-10. 18 tests (normalize, aplanado del JSON anidado, API con DNI enmascarado), TypeScript limpio. Query real probada: `GET /api/candidatos?departamento=LIMA&distrito=VEGUETA&cargo=ALCALDE` devuelve a Alicia Mercedes Ríos Padilla con `dniEnmascarado: "*****775"`.
>
> **OE-03**: nuevo `GET /api/crossref/candidatos-sancionados` en `proveedores-sancionados` (`candidatos-pool.ts` + `candidatos-sancionados.ts`), acepta `departamento` o lista de `dni`. Cruza contra `supplier_conformacion` (vínculos) e `inhabilitaciones`/`multas` (sanción directa por DNI), y además revisa si el RUC de cada empresa vinculada tiene sus propias sanciones (`empresaTieneSancion`) — sin fusionar ambas categorías. Reemplaza el script de Node ad-hoc de la sesión anterior. Verificado en vivo: reproduce exactamente los mismos casos ya encontrados a mano — La Libertad 4,637 revisados → 6 resultados; Lima 12,770 revisados → 9 resultados (3 con sanción vigente hoy: Inga Zapata, Canto Vidal, Ríos Padilla). 6 tests nuevos + 2 tests preexistentes actualizados (necesitaban mockear el pool nuevo), suite completa de `proveedores-sancionados/api` en 30/30, TypeScript limpio.
>
> **OE-04**: nuevo `GET /api/crossref/sancionado-recurrente?minResoluciones=2&ventanaDias=180` en `proveedores-sancionados`. Agrupa `inhabilitaciones` por RUC, marca ≥N resoluciones distintas dentro de M días. Verificado en vivo contra el registro nacional completo: Serpaem (4/142d), Mejesa (2/81d) y Protektor (2/22d) —los 3 casos ya conocidos— aparecen con los mismos números exactos, dentro de **637 resultados a nivel nacional** con los parámetros por defecto (sin analizar ese universo completo — fuera del alcance de este ticket de infraestructura). 3 tests nuevos, suite completa en 33/33.
>
> **OE-05 (mínimo obligatorio, cumplido)**: `docs/conectores.md` documenta la cobertura real actualizada — al ingerir Lima completa hoy, el universo de proveedores (`awards`+`minor_contracts`) creció a 21,119 RUC, mientras `supplier_conformacion_lookup` sigue en 3,809 (18.0%, sin recorrer desde 2026-09-04). La cifra histórica de "100%" queda marcada como no vigente. La parte condicional (ampliar la cobertura) **no se ejecutó** — queda como trabajo pendiente evaluable, tal como permite el propio ticket.
>
> **OE-06 (cumplido)**: `docs/conectores.md` (ficha de `mindef`) documenta explícitamente que la app no tiene ni nunca tuvo datos de capacidad/brechas militares, y que se investigó y no se encontró fuente oficial abierta para eso. Sin código nuevo, tal como pedía el ticket.
>
> **Los 6 tickets de este PRD quedan cerrados el mismo día que se escribieron.**



---

## ÉPICA 1 — El detector de señales debe correr a escala real

### OE-01 · Inserción por lotes en el detector de señales de riesgo

- **Historia:** Como analista de riesgo, quiero correr el detector de señales de contrataciones menores (S01–S13) para cualquier departamento del país sin que tarde una eternidad ni se vuelva impráctico, para no depender de correrlo solo en las regiones más pequeñas.
- **Contexto verificado en código:** `apps/compras-publicas/api/src/minor-contracts/run-signals.ts` — dentro del loop `for (const signal of signals)` hace un `INSERT INTO contract_signals` por cada señal individual (`await client.query(...)`), y si `evidenceInputs.length > 0` un segundo `INSERT INTO contract_evidence` también uno por uno, todo dentro de la misma transacción (`BEGIN`/`COMMIT` al inicio/final de `runMinorContractSignals`). El 2026-09-10 esto tardó varios minutos para La Libertad (2,021 contratos, 21,293 señales generadas) y se decidió no correrlo para Lima (20,352 contratos; solo la Universidad Nacional Agraria La Molina aporta 5,061 filas a un solo `entity_code`, lo que además dispara el costo cuadrático de las señales S06–S08 dentro de `derive-signals.ts`).
- **Criterios de aceptación:**
  - Los `INSERT` de `contract_signals` y `contract_evidence` se agrupan en lotes (`INSERT ... VALUES (...), (...), ...` con tamaño de lote configurable, ej. 500 filas por lote) en vez de una fila por `await`.
  - La corrida completa para un departamento con >15,000 órdenes menores (Lima como caso de prueba real) termina en menos de 5 minutos en un entorno de desarrollo estándar.
  - El conteo y contenido de señales generadas para un fixture fijo es idéntico antes y después del cambio (test de regresión) — este ticket es de rendimiento, no cambia `derive-signals.ts` ni la lógica de qué cuenta como señal.
  - Se preserva la garantía transaccional: si la corrida falla a la mitad, no quedan señales parciales de ese `signal_run_id` en la base.
  - `RunSignalsSummary` (el resumen que imprime `console.log` al final) sigue reportando `contractsConsidered`/`signalsCreated`/`unavailableSignals` sin cambios de forma.
- **Dependencias:** ninguna.
- **Prioridad:** P0 · **Esfuerzo:** S

---

## ÉPICA 2 — Candidatos electorales como capacidad propia de Rastro

### OE-02 · Conector propio de candidatos ERM 2026

- **Historia:** Como persona que redacta un hallazgo sobre otra región, quiero que Rastro tenga su propio conector de candidatos electorales, para no depender de descargar a mano un JSON publicado por un tercero cada vez que se necesite este dato.
- **Contexto verificado en código y en la investigación del 2026-09-10:** no existe hoy ningún conector de candidatos en el repo. `apps/autoridades-electas/api/src/ingest/autoridades-connector.ts` es el patrón más cercano (JNE, vía CKAN `package_show` contra `datosabiertos.gob.pe`) pero cubre autoridades ya proclamadas del proceso nacional 2026 (Presidencia/Congreso), no candidatos a Elecciones Regionales y Municipales. Se verificó en vivo que `votoinformado.jne.gob.pe` está protegido con Cloudflare Turnstile y `web.jne.gob.pe/reporteinscripcionlistaserm2026/` con Incapsula — ninguno de los dos es una fuente viable sin automatizar un bypass, lo cual está prohibido por la regla transversal de este backlog. La fuente que sí se usó el 2026-09-10, de forma manual y sin automatizar acceso protegido, fue un JSON estático republicado por un tercero (Datapol) en `datapol.lat/articulos/erm-2026-candidatos/buscador/data/candidatos.json` (candidatos a nivel nacional, con campos `pos`, `nombre`, `dni`, `cargo`, `sexo`, `edad`, `prov_consejero`, `estado`, `edu`, `sent`, agrupados por `circ` → tipo (4 regional / 5 provincial / 6 distrital) → ubigeo → lista de organización política) y hojas de vida detalladas en `.../data/hdv/{tipoId}-{ubigeo}.json`.
- **Criterios de aceptación:**
  - Antes de escribir código: investigar explícitamente si el JNE ofrece algún canal de datos no interactivo (API documentada, convenio de datos abiertos, publicación futura en el PNDA) — documentar el resultado de esa investigación en `docs/conectores.md` aunque la conclusión sea "no existe, se usa fuente de terceros".
  - Nueva app `apps/candidatos-erm` (Postgres propio, `docker-compose.yml`, `.env.example`), con tablas `candidatos_erm`, `raw_candidatos_erm_batches`, `candidatos_erm_rejected` — mismo patrón de `autoridades-electas`.
  - Esquema captura como mínimo: nombres/apellidos, DNI, cargo, organización política, ubigeo/circunscripción (tipo regional/provincial/distrital), estado (inscrito/tachado/excluido/renuncia/retiro).
  - La ingesta para La Libertad y Lima reproduce, con discrepancia documentada si la hay, los conteos ya verificados manualmente el 2026-09-10 (4,637 y 12,770 candidatos inscritos respectivamente).
  - Si la fuente sigue siendo un tercero no oficial: `docs/conectores.md` documenta esa dependencia explícitamente, con fecha de verificación y una nota de riesgo de disponibilidad (qué pasa si Datapol deja de publicar el JSON o cambia su estructura sin aviso).
  - Ningún paso de la ingesta automatiza `votoinformado.jne.gob.pe` ni `plataformaelectoral.jne.gob.pe`.
- **Dependencias:** ninguna.
- **Prioridad:** P1 · **Esfuerzo:** L

### OE-03 · Endpoint reusable de cruce candidato↔sanción

- **Historia:** Como analista, quiero un endpoint que cruce cualquier lista de candidatos contra vínculos societarios y sanciones del Tribunal de Contrataciones, para no tener que escribir un script de Node ad-hoc cada vez que se necesite repetir este cruce para otra región.
- **Contexto verificado en código:** `apps/proveedores-sancionados/api/src/routes/personas-sancionadas.ts` ya hace la mitad de este trabajo, pero parte de `inhabilitaciones`/`multas` (personas *ya* sancionadas directamente) y busca sus vínculos en `supplier_conformacion` — no acepta una lista externa de DNI (como un padrón de candidatos) para preguntar lo inverso: "¿alguno de estos DNI tiene vínculo o sanción?". El 2026-09-10 este cruce se armó fuera de la API, con un script de Node que leía el JSON de candidatos, extraía DNI únicos, los cargaba en una tabla temporal de Postgres vía `docker cp` + `\copy`, y corría el `JOIN` a mano contra `supplier_conformacion` e `inhabilitaciones`/`multas`.
- **Criterios de aceptación:**
  - Nueva ruta (ej. `GET /api/crossref/candidatos-sancionados` en `proveedores-sancionados`, o donde resulte más natural dado que ya tiene acceso a `comprasPool` para `supplier_conformacion`) que acepta un departamento (vía la nueva app `candidatos-erm` de OE-02) o una lista de DNI, y devuelve para cada uno: vínculos societarios (rol, RUC, empresa) y sanciones directas (RUC-10, estado, resolución, vigencia).
  - El cruce es siempre por DNI exacto — nunca por coincidencia de nombre.
  - La respuesta distingue explícitamente "vínculo societario sin sanción en la empresa vinculada" de "sanción directa de la persona" — no los mezcla en una sola categoría de "hallazgo" (mismo criterio ya aplicado el 2026-09-10 al reportar los casos de La Libertad y Lima donde el vínculo societario no tenía sanción).
  - Mismo enmascarado de documento que ya usa `personas-sancionadas.ts` (`maskDocumento`, últimos 3 dígitos visibles) se aplica también a los DNI de candidatos en la respuesta.
  - `docs/conectores.md` documenta el nuevo cruce, con nota explícita de que la cobertura de `supplier_conformacion` es una muestra (ver OE-05), no el universo.
- **Dependencias:** OE-02 (necesita el conector de candidatos para no depender del script ad-hoc de la sesión anterior).
- **Prioridad:** P1 · **Esfuerzo:** M

---

## ÉPICA 3 — Señales y cobertura de riesgo

### OE-04 · Señal de "sancionado recurrente"

- **Historia:** Como analista de patrones de sanciones, quiero que el sistema marque por sí solo a un proveedor con varias resoluciones de inhabilitación en poco tiempo, para no tener que encontrar ese patrón leyendo el registro completo fila por fila.
- **Contexto verificado en la investigación del 2026-09-10:** el patrón se encontró manualmente en Lima — Serpaem S.A.C. (4 resoluciones distintas en 2025: jun, oct ×2, nov), Mejesa S.R.L. (2 resoluciones, oct-2025 y ene-2026) y Protektor Seguridad Integral S.A.C. (2 resoluciones en un mes, jul-ago 2025) — revisando `inhabilitaciones` a mano por RUC. El detector de señales de `compras-publicas` (S01–S13, ver `derive-signals.ts`) no tiene hoy ninguna señal equivalente porque opera sobre `minor_contracts`/`contract_signals`, no sobre el registro de `inhabilitaciones` de `proveedores-sancionados` — este ticket puede implementarse en cualquiera de las dos apps, lo que resulte más natural dado que `proveedores-sancionados` ya tiene el pool de `inhabilitaciones` como fuente primaria.
- **Criterios de aceptación:**
  - Se agrega una señal (nueva, o una consulta expuesta como parte del cruce existente) que agrupa `inhabilitaciones` por RUC y marca los casos con ≥2 resoluciones distintas (`resolucion` distinta) cuya fecha `desde` cae dentro de una ventana de 6 meses entre sí.
  - Corrida de prueba contra los datos reales de Lima confirma que Serpaem, Mejesa y Protektor quedan marcados, y que un proveedor con una sola inhabilitación no lo es.
  - La explicación de la señal sigue el mismo estilo que las señales S01–S13 existentes: describe el hecho observable (ej. "N resoluciones de inhabilitación distintas en M meses") y aclara explícitamente que no determina un patrón de conducta ni una conclusión — requiere revisión humana.
  - Test de regresión con fixture que incluya un caso con 1 resolución (no debe marcarse) y un caso con 2+ dentro de la ventana (debe marcarse).
- **Dependencias:** ninguna.
- **Prioridad:** P2 · **Esfuerzo:** M

### OE-05 · Documentar (y evaluar ampliar) la cobertura de conformación societaria

- **Historia:** Como cualquier persona que lea un hallazgo de Rastro con "no se encontró vínculo societario", quiero saber qué tan completa es esa base antes de leer la ausencia de vínculo como una conclusión fuerte.
- **Contexto verificado en código:** `supplier_conformacion`/`supplier_conformacion_lookup` (en `compras-publicas`, poblada desde OSCE — Buscador de Proveedores del Estado / perfilprov) tiene 1,358 RUC ingeridos a nivel nacional a la fecha de la sesión (`SELECT count(DISTINCT ruc) FROM supplier_conformacion` → 1358). No hay hoy, en `docs/conectores.md` ni en ningún otro documento, una cifra de cuántos RUC forman el universo real de proveedores activos del Estado, así que no hay forma de decir si 1,358 es una cobertura razonable o mínima.
- **Criterios de aceptación (mínimo, obligatorio):**
  - `docs/conectores.md` (ficha del conector de conformación societaria en `compras-publicas`) incluye una cifra actualizada de cobertura (RUC ingeridos) y la fecha de la medición, con una nota explícita de que "no encontrado" no equivale a "no existe vínculo" mientras esta cifra sea una muestra.
- **Criterios de aceptación (si se decide ampliar, opcional y condicional):**
  - ADR que documenta el criterio de selección de qué RUC ampliar primero (ej. todos los adjudicatarios de `awards`/`minor_contracts` de las últimas N regiones analizadas, priorizado por monto, o muestra aleatoria) antes de comprometerse a un volumen de ingesta específico.
  - La ampliación no depende de scraping de una plataforma protegida — verificar el mecanismo real de acceso a OSCE perfilprov usado hoy (`apps/compras-publicas/api/src/ingest/*conformacion*`) y confirmar que escala sin necesidad de evadir ninguna protección.
- **Dependencias:** ninguna. La parte de ampliación puede diferirse indefinidamente sin bloquear el resto del backlog.
- **Prioridad:** P2 · **Esfuerzo:** S (solo documentar) / L (si se ejecuta la ampliación)

---

## ÉPICA 4 — Documentación de límites ya confirmados

### OE-06 · Registrar que `mindef` no cubre brechas de capacidad militar

- **Historia:** Como persona que reciba en el futuro la misma pregunta de hoy ("¿hay datos de brechas de defensa?"), quiero que la respuesta esté ya documentada, para no repetir la misma investigación.
- **Contexto verificado en código:** `apps/mindef/api/src/routes/` contiene exactamente tres rutas: `offset.ts` (convenios de compensación industrial — `offset_agreements`, campos `tipoConvenio`/`institucion`/`entidadContraparte`/`anioInicio`), `peace-missions.ts` (misiones de paz) y `training-abroad.ts` (entrenamiento militar en el extranjero). Ninguna de las tres mide capacidad, equipamiento, cobertura territorial ni brechas de las Fuerzas Armadas. No se encontró, en la investigación del 2026-09-10, ninguna fuente abierta oficial peruana que publique ese tipo de dato.
- **Criterios de aceptación:**
  - `docs/conectores.md` (ficha de `mindef`) agrega una nota explícita: qué cubre la app (compensación industrial, misiones de paz, entrenamiento en el extranjero) y qué no cubre (capacidad/brechas militares), con la fecha en que se confirmó la ausencia de fuente.
  - No se crea ningún conector, dato ni proxy nuevo como parte de este ticket — es puramente una nota de límite ya confirmado.
- **Dependencias:** ninguna.
- **Prioridad:** P3 · **Esfuerzo:** XS
