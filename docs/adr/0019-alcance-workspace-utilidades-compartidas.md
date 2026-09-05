# ADR-0019: Alcance del workspace npm para utilidades compartidas no relacionadas a entity-matching

**Estado:** Aceptado
**Fecha:** 2026-09-04
**Ticket origen:** CX-07 (`docs/TICKETS_Consolidacion_Logica_Compartida_y_Rigor_Temporal_v1.md`)

## Contexto

ADR-0017 consolidó el matcher difuso de entidades en `packages/entity-matcher`, consumido solo
por las 3 apps que ya estaban en `workspaces` del `package.json` raíz (`compras-publicas`,
`infobras`, `identidad-fiscal`) — decisión deliberadamente acotada, documentada en la propia
`description` del `package.json`: *"ninguna otra se agregó a workspaces a propósito, para no
ampliar el alcance de este cambio"*.

Este PRD (Consolidación de Lógica Compartida) identificó 3 utilidades más que hoy están
duplicadas entre apps que **no** están en el workspace: `LATEST_BUDGET_CTE` (`radar-ejecucion`,
`salud-institucional`, `radar-inversiones`, `ceplan-estrategico`, `infobras`), `extractRuc()`
(`identidad-fiscal`, `proveedores-sancionados`, `salud-institucional`) y
`temporal-status.ts` (`proveedores-sancionados`, necesaria también en `identidad-fiscal`).

**Hallazgo adicional durante este spike, no contemplado en el PRD original**:
`packages/http-client/src/index.ts` ya existe en el repo (comiteado, presente tanto en esta
rama como en `master`) — exporta `fetchJson<T>()` con timeout configurable y una jerarquía de
error tipada (`HttpRequestError` con `kind: "timeout" | "network" | "http" | "invalid_json"`).
Es exactamente el mismo patrón reimplementado de forma independiente, con nombres distintos, en:
`apps/ceplan-geo/api/src/lib/api-clients.ts` (`fetchJson` local),
`apps/compras-publicas/api/src/ingest/perfilprov-conformacion-connector.ts` (`fetchJson` local),
y `apps/compras-publicas/api/src/ingest/seace-public-minor-contracts-connector.ts` (`fetchJson`
local). El paquete **no tiene `package.json`**, no está en ningún workspace, y **ningún archivo
lo importa** — es una consolidación empezada y abandonada antes de conectarse a un consumidor
real.

### El costo real de expandir `workspaces`, verificado en `.github/workflows/ci.yml` de `master`

A diferencia de lo asumido al abrir este ticket, el costo de sumar una app al workspace ya
está resuelto y documentado en CI, no es hipotético:

- Las apps del workspace **pierden su `package-lock.json` propio** — su lockfile pasa a vivir
  en la raíz. El `cache-dependency-path` de CI lista ambas rutas posibles y usa la que exista.
- El paso "Install dependencies" de CI se ramifica explícitamente: si existe
  `package-lock.json` local, `npm ci` normal; si no, corre desde la raíz del repo
  (`cd "$GITHUB_WORKSPACE" && npm ci && npm run build --workspace=packages/entity-matcher`).
- **Bug ya visto en CI real, documentado en el propio comentario del workflow**: `npm ci` en un
  workspace **enlaza** el paquete compartido pero no ejecuta su script `build` — sin `dist/`,
  `tsc --noEmit` de las apps consumidoras falla con *"Cannot find module
  '@appsperu/entity-matcher' or its corresponding type declarations"*. La mitigación fue
  compilar el paquete explícitamente después del `npm ci` del workspace.

Este costo es fijo (ya está pagado y funcionando para 3 apps) — el trabajo marginal de sumar
una app más es: quitar su lockfile local, agregarla a `workspaces`, y confirmar que sigue
cubierta por la rama `else` de CI que ya existe. No hay que reinventar el mecanismo.

## Decisión

**Se amplía `workspaces` incrementalmente, solo para las apps que realmente consuman un
paquete compartido**, no de forma preventiva para las 5 candidatas de una sola vez. Se
reutiliza el mecanismo de CI ya construido por ADR-0017 en vez de crear una alternativa
(`file:` dependency, publicación privada, etc.) — su costo ya está pagado y probado, y una
alternativa nueva pagaría el mismo problema de orden de build (paquete debe compilarse antes
que sus consumidores) sin ese trabajo ya hecho.

Reglas concretas:

1. **Un paquete por dominio de utilidad**, siguiendo el patrón ya establecido por
   `entity-matcher` (matching) y el ya iniciado `http-client` (HTTP): un nuevo
   `packages/shared-queries` para `LATEST_BUDGET_CTE`, y un nuevo `packages/shared-identity`
   (o nombre equivalente) para `extractRuc()` + `temporal-status.ts` — no se mezclan utilidades
   de dominios distintos en un solo paquete grande, ni se reabre el alcance declarado de
   `entity-matcher`.
2. **Una app entra a `workspaces` solo cuando CX-08 o CX-09 la toquen**, no antes:
   - CX-08 (`LATEST_BUDGET_CTE`) agrega `radar-ejecucion`, `salud-institucional`,
     `radar-inversiones`, `ceplan-estrategico` (`infobras` e `identidad-fiscal` ya están).
   - CX-09 (`extractRuc`/`temporal-status`) agrega `proveedores-sancionados`
     (`identidad-fiscal` ya está; `salud-institucional` ya habrá entrado por CX-08).
3. **`packages/http-client` se termina de conectar como parte del mismo esfuerzo**: se le
   agrega `package.json` (mismo shape que `entity-matcher`: `build`/`test` con `tsc`/`vitest`),
   y `ceplan-geo` y `compras-publicas` (ya en el workspace) reemplazan sus 3 copias locales de
   `fetchJson` por el import del paquete. Se registra como ticket de seguimiento **CX-13**
   (fuera del alcance original de CX-07/08/09, pero descubierto durante esta investigación —
   no se ignora un hallazgo real solo porque no estaba en el PRD original).
4. La `description` del `package.json` raíz se actualiza en cada PR que amplíe `workspaces`,
   seguiendo el mismo estilo textual que dejó ADR-0017 (declarar explícitamente qué apps están
   y por qué, para que la próxima persona no tenga que adivinar el criterio).
5. Ningún paquete nuevo de este ADR intenta ser un "shared kernel" general — cada uno resuelve
   exactamente la duplicación identificada en el PRD, nada más.

## Consecuencias

- CX-08 y CX-09 ya no están bloqueados por una evaluación abierta — pueden implementarse
  directamente siguiendo las reglas de este ADR.
- Nace **CX-13** (terminar de conectar `packages/http-client`) como ticket nuevo, agregado a
  `docs/TICKETS_Consolidacion_Logica_Compartida_y_Rigor_Temporal_v1.md`.
- El `package.json` raíz crecerá a 4 apps en el corto plazo (tras CX-08) y 5 tras CX-09 — sigue
  siendo un subconjunto acotado y explícito de las 14, no un cambio de arquitectura del
  monorepo.
- Si en el futuro aparece una utilidad que necesite las 14 apps a la vez, esta regla de
  "una app entra solo cuando la toca un ticket concreto" evita que `workspaces` termine
  incluyendo las 14 apps sin que nadie haya decidido eso explícitamente.
