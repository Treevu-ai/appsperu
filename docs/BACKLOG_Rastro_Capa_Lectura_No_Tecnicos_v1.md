# Backlog ejecutable — Rastro Capa de Lectura para No-Técnicos v1

**Producto:** Rastro / Follow the Sol
**PRD:** [`docs/PRD_Rastro_Capa_Lectura_No_Tecnicos_v1.md`](PRD_Rastro_Capa_Lectura_No_Tecnicos_v1.md)
**Tickets:** [`docs/TICKETS_Rastro_Capa_Lectura_v1.md`](TICKETS_Rastro_Capa_Lectura_v1.md)
**Regiones en alcance:** **LA LIBERTAD** (única vigente tras Sprint 26-08). Los otros 4 departamentos (LAMBAYEQUE, PIURA, CAJAMARCA, CUSCO) se renderizan **solo si la API responde con datos verificados** y siempre con `cobertura: PARCIAL` explícita.
**Reglas transversales (del PRD §3.2):**
- Cero endpoint nuevo en `apps/*/api`. Cero migración nueva.
- La UI no accede a BD; consume exclusivamente las 14 APIs.
- "Vacío de evidencia, no conclusión" se preserva literalmente: la UI muestra el texto del tool.
- Sin login, sin tracking individual, sin cookies de marketing en v1.
- Cobertura parcial ≠ error: se renderiza con texto explícito, no como spinner.

**Estimación:** S ≤ 1 día · M 2–3 días · L 4–6 días (esfuerzo relativo, no calendario).

> **Estado real (2026-08-31):** este backlog se escribió antes de construir `apps/rastro-web`. La app ya existe, está mergeada en `master` y desplegada en `rastro.fyi` — pero el build real no siguió los 4 sprints en orden ni al pie de la letra. Auditoría ticket por ticket contra el código en [`docs/TICKETS_Rastro_Capa_Lectura_v1.md`](TICKETS_Rastro_Capa_Lectura_v1.md#estado-real-auditoría-de-código-2026-08-31): **6 hechos, 9 parciales, 5 pendientes** de 20. Las columnas "Estado" de las tablas de sprint abajo resumen lo mismo; el detalle de qué falta en cada ticket parcial vive en el otro doc.

---

## Resumen de sprints

| Sprint | Objetivo | Tickets | Puerta de salida |
|---|---|---|---|
| **11** | Fundación de la UI + disciplina de honestidad | AL3-01, AL3-02, AL3-03, AL3-13, AL3-16, AL3-19 | `npm run dev` levanta `/` con header de frescura; CI corre linter; linter bloquea números sin metadata |
| **12** | Lector GORE La Libertad + página de docs API | AL3-04, AL3-05, AL3-06, AL3-15 | `/gore/la-libertad` navega 3 vistas; `/docs/api` lista los 82 tools con su nota `SIN_SCHEDULER` |
| **13** | Lectores Prensa y Auditoría + búsqueda | AL3-07, AL3-08, AL3-09, AL3-10, AL3-11 | `/proveedor/{ruc}`, `/distrito/{ubigeo}`, `/buscar` funcionan con datos reales; vacío de evidencia se ve literalmente |
| **14** | Estado del producto, despliegue, smoke test | AL3-12, AL3-14, AL3-17, AL3-18, AL3-20 | App desplegada en Cloudflare Pages; tests E2E verdes; reporte de smoke firmado; release v1.0 |

---

## Secuencia estratégica

```text
Sprint 11: Vite + React Router + cliente HTTP + header de frescura + linter + CI
            ↓
Sprint 12: Lector GORE (3 vistas) + página /docs/api
            ↓
Sprint 13: Lector Prensa (2 vistas) + Lector Auditoría (2 vistas) + búsqueda
            ↓
Sprint 14: Estado del producto + tests E2E + rate limit + deploy + smoke
```

Cada sprint deja una **puerta de salida verificable**: si la puerta no se cumple, no se abre el siguiente sprint.

---

## Sprint 11 — Fundación y disciplina de honestidad

| ID | Épica | Objetivo | Criterios de aceptación | Dep. | P | Esf. | Estado |
|---|---|---|---|---|---|---|---|
| AL3-01 | Fundación | Proyecto Vite 5 + React Router 6 + Tailwind v4 con layout raíz. | App corre en `localhost:5173`; header global con nav (GORE / Proveedor / Distrito / Estado / Docs); 14 vars `VITE_API_BASE_URL_*` validadas en build. | — | P0 | M | ✅ Hecho |
| AL3-02 | Fundación | Cliente HTTP tipado a las 14 APIs. | `apps/Rastro-web/lib/api-client.ts` con 14 funciones; timeout 8 s; errores tipados (`timeout` / `network` / `http_5xx` / `http_4xx`); sin retry silencioso; tests con MSW. | AL3-01 | P0 | M | 🟡 Parcial — 6/14 apps con función de datos real |
| AL3-03 | Honestidad | Header global con frescura honesta. | `<DataFreshnessBar>` consulta `radar_ejecucion_meta_sources` en SSR; color ámbar si > 7 d, rojo si > 30 d; si API caída, muestra "API no disponible" sin spinner. | AL3-02 | P0 | S | 🟡 Parcial — falta modal al clic |
| AL3-13 | Honestidad | Linter de UI "no número sin metadata". | `npm run lint:meta` falla el build si alguna vista renderiza un número sin `matcher`/`cobertura`/`corte`/`fuente`; documentado con ejemplos. | AL3-02 | P0 | M | ✅ Hecho |
| AL3-16 | Docs | Manual de uso para citar Rastro. | `apps/Rastro-web/public/citar-Rastro.md` con 4 secciones (informe, noticia, qué NO concluir, reportar vacío); ejemplo de bloque de citación. | — | P1 | S | ✅ Hecho |
| AL3-19 | Calidad | CI GitHub Actions. | Workflow `Rastro-web-ci.yml` con jobs `typecheck` + `unit` + `lint-meta`; cache por lockfile; falla PR si algo falla. | AL3-13 | P0 | S | 🟡 Parcial — sin job `e2e` (no existe la suite) |

**Puerta Sprint 11:** `npm run dev` levanta `/` con header de frescura visible; CI corre linter; linter bloquea un PR de prueba con un número sin metadata. **Demostración:** video de 60 s o captura.

---

## Sprint 12 — Lector GORE La Libertad + documentación pública

| ID | Épica | Objetivo | Criterios de aceptación | Dep. | P | Esf. | Estado |
|---|---|---|---|---|---|---|---|
| AL3-04 | Lector GORE | Ficha de sector por departamento. | `/gore/la-libertad` consume `radar_ejecucion_sector_ficha`; tabla con PIA/PIM/devengado + `matcher`/`cobertura`/`corte`; 422 se muestra literal. | AL3-02, AL3-03 | P0 | M | ✅ Hecho |
| AL3-05 | Lector GORE | Comparativo de sectores verificados. | `/gore/la-libertad/comparativo?sectores=...` consume `radar_ejecucion_sector_comparativo`; copy del tool ("mantiene separadas la responsabilidad nacional dirigida…") textual. | AL3-04 | P0 | S | ✅ Hecho |
| AL3-06 | Lector GORE | Benchmark de entidad vs cohorte. | `/gore/la-libertad/benchmark?entityCode=...` consume `radar_ejecucion_benchmark`; `datos_insuficientes` se ve con badge explícito; tooltip explica `criterios`. | AL3-04 | P1 | S | ✅ Hecho |
| AL3-15 | Docs | Página `/docs/api` con los 82 tools. | Generada desde `mcp-server/src/catalog.ts` en build-time; tabla con nombre / app / descripción / path; tooltip con `SIN_SCHEDULER`. | AL3-01 | P1 | S | 🟡 Parcial — copia manual estática, sin buscador ni tooltip |

**Puerta Sprint 12:** `/gore/la-libertad` navega 3 vistas (ficha, comparativo, benchmark) con datos reales de la API; `/docs/api` lista los 82 tools con su descripción y nota de no-scheduler. **Demostración:** navegación QA manual sin tocar terminal.

---

## Sprint 13 — Lectores Prensa y Auditoría + búsqueda transversal

| ID | Épica | Objetivo | Criterios de aceptación | Dep. | P | Esf. | Estado |
|---|---|---|---|---|---|---|---|
| AL3-07 | Lector Prensa | Perfil de proveedor por RUC. | `/proveedor/{ruc}` consume 3 APIs en paralelo (identidad, compras, sanciones); vacío con nota del tool; botón "Citar Rastro" abre modal. | AL3-02, AL3-13 | P0 | M | 🟡 Parcial — contrataciones sin filtro real, sin botón/modal de cita |
| AL3-08 | Lector Prensa | Ranking de proveedores con concentración. | `/prensa/proveedores?departamento=...` consume `compras_publicas_suppliers`; tabla con CR3/CR5/HHI; sin score de riesgo. | AL3-07 | P1 | S | ⬜ Pendiente |
| AL3-09 | Lector Auditoría | Activos por distrito. | `/distrito/{ubigeo}` consume `infobras_public_works` + `radar_ejecucion_infrastructure_assets`; chip "PARALIZADA" literal; sin score de calidad. | AL3-02, AL3-13 | P0 | M | 🟡 Parcial — solo infobras, filtrado por departamento no por distrito |
| AL3-10 | Lector Auditoría | Integridad con `estricto=true`. | `/distrito/{ubigeo}/integridad?estricto=true` muestra 409 con mensaje textual; página `/docs/integridad` explica la semántica. | AL3-09 | P0 | S | ⬜ Pendiente |
| AL3-11 | Búsqueda | Buscador `/buscar` con 3 sources. | `/buscar?q=...` une resultados de `radar_inversiones` + `identidad_fiscal` + `infobras_public_works` con rank; rate limit 30 req/min. | AL3-02, AL3-13 | P1 | M | 🟡 Parcial — solo redirige por regex RUC/UBIGEO, sin búsqueda libre |

**Puerta Sprint 13:** Los 3 lectores funcionan end-to-end con datos reales. Una consulta como *"pegar RUC de un proveedor sancionado"* y *"abrir distrito con obras paralizadas"* se completan sin tocar terminal. **Demostración:** capturas de pantalla + JSON crudo comparado.

---

## Sprint 14 — Estado del producto, despliegue, validación

| ID | Épica | Objetivo | Criterios de aceptación | Dep. | P | Esf. | Estado |
|---|---|---|---|---|---|---|---|
| AL3-12 | Estado | Página `/estado` con `meta_sources` agregadas. | Tabla con 14 filas (una por app): URL base, último `runAt`, conteo, cobertura; refresh 60 s; sin caché. | AL3-02, AL3-03 | P1 | S | 🟡 Parcial — sin refresh automático de 60s |
| AL3-14 | Calidad | Tests E2E "JSON de API = JSON renderizado". | Suite Playwright que compara JSON crudo vs HTML renderizado en 5 fichas + 3 perfiles + 2 distritos; diff visible en log de CI. | AL3-04, AL3-07, AL3-09 | P0 | M | ⬜ Pendiente |
| AL3-17 | Operación | Rate limit en rutas sensibles. | Middleware 60 req/min en `/proveedor`, 30 req/min en `/buscar`; HTTP 429 con `Retry-After`; métrica pública `429Count24h` en `/estado`. | AL3-07, AL3-11 | P2 | S | ⬜ Pendiente |
| AL3-18 | Despliegue | Deploy en Cloudflare Pages + vars de entorno. | Proyecto `Rastro-web` en Cloudflare Pages; 14 vars `VITE_API_BASE_URL_*`; dominio personalizado; preview → production gate con E2E. **No Vercel.** Fly.io queda como plan B documentado. | AL3-14 | P0 | S | 🟡 Parcial — deployado con dominio propio; falta deploy hook secret y gate E2E |
| AL3-20 | Validación | Reporte de smoke test de los 3 lectores. | `docs/validacion-smoke-Rastro-web-v1.md` con capturas/HTML, JSON crudo y texto renderizado lado a lado; divergencias marcadas explícitas, no omitidas. | AL3-04, AL3-07, AL3-09, AL3-12 | P0 | S | ⬜ Pendiente |

**Puerta Sprint 14:** App desplegada en **Cloudflare Pages**; tests E2E verdes; reporte de smoke firmado por Ricardo; release v1.0 etiquetado y comunicado en el siguiente `MEMO` regional.

---

## Definition of Done (por ticket)

- Código mergeado con tests donde aplique.
- Sin nuevos endpoints en `apps/*/api` ni migraciones nuevas (este PRD **no toca el backend**).
- Si la UI renderiza un número, el test E2E (AL3-14) demuestra que viene verbatim de la API.
- Sin login, sin tracking individual, sin cookies de marketing.
- Documentación pública (manual de uso, `/docs/api`) actualizada si cambia el contrato de cara al usuario.
- Captura o salida de smoke test adjunta al PR.

---

## Riesgos del backlog

| Riesgo | Mitigación |
|---|---|
| Que la UI "rellene" vacíos para verse más prolija | Linter AL3-13 + tests E2E AL3-14 + revisión humana del PR |
| Que el hosting (Cloudflare Pages) cobre más de lo previsto | Rate limit AL3-17 antes de salir a producción |
| Que el dato esté desactualizado y se muestre como vigente | Header AL3-03 + página `/estado` AL3-12 con `meta_sources` |
| Que la audiencia pida expansión nacional inmediata | `cobertura: LA LIBERTAD` siempre visible; el roadmap no se promete con fecha |
| Que el linter de UI sea ruidoso y se desactive | Reglas progresivas: warnings primero, errores después; documentado en `apps/Rastro-web/docs/linter-meta.md` |
| Que el equipo intente meter LLM en v1 | Decisión explícita: **no LLM en v1**. Se reabre en PRD v2 si hay demanda real |

---

## Métricas de éxito del backlog (acumulado, evaluadas al cierre de Sprint 14)

| Métrica | Meta | Cómo se mide |
|---|---|---|
| Los 3 lectores navegan sin terminal | 100% | QA manual con 5 consultas por lector |
| Cero números en UI sin metadata | 0 infracciones | `npm run lint:meta` en CI |
| Tests E2E verde | 12/12 | Suite Playwright |
| Cobertura de los 82 tools en `/docs/api` | 100% (82/82) | Build genera página desde `catalog.ts` |
| Latencia P95 | < 1.5 s en vista 50 filas; < 3 s en vista 500 | Logs de Cloudflare (Workers Analytics) |
| Reporte de smoke firmado | 1 doc con 12 capturas | `docs/validacion-smoke-Rastro-web-v1.md` |
| Cero endpoint nuevo en backend | 0 | `git diff master..feature/Rastro-web` sobre `apps/*/api/src/routes/**` |

---

## Próximo paso sugerido (actualizado 2026-08-31)

Sprints 11-13 ya están en producción (fundación, lector GORE completo, perfil de proveedor y distrito parciales). Los tres huecos con más impacto para cerrar v1, en orden sugerido:

1. **AL3-14 (tests E2E)** — sin esto no hay red de seguridad para tocar `Proveedor.tsx`/`Distrito.tsx` sin romper lo que ya funciona; agregar Playwright es la base para todo lo demás en esta lista.
2. **AL3-07 y AL3-09 (cerrar los parciales de los lectores Prensa/Auditoría)** — reemplazar el filtro placeholder de "Contrataciones" por `compras_publicas_supplier_by_id` real, agregar el segundo fetch a `radar_ejecucion_infrastructure_assets`, y el modal "Citar Rastro".
3. **AL3-18 (cerrar el deploy)** — crear el Deploy Hook de Cloudflare y el secret `CLOUDFLARE_DEPLOY_HOOK_URL` en GitHub (pendiente #7 de `docs/ESTADO.md`); sin esto, cada push a `master` que toque `apps/rastro-web` deja el workflow de deploy en rojo.

AL3-08 (ranking de proveedores), AL3-10 (integridad de infraestructura) y AL3-11 (búsqueda libre real) quedan como P1 detrás de esos tres — son features nuevas, no huecos que rompan algo ya publicado. AL3-17 (rate limit) y AL3-20 (smoke test firmado) son P0/P2 de cierre de v1 pero no bloquean el uso actual del sitio.
