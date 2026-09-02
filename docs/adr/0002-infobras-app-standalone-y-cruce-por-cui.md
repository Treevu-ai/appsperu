# ADR 0002 — INFOBRAS como app standalone, parser propio y cruce por CUI

- Estado: Aceptado
- Fecha: 2026-08-16 (actualizado 2026-09-02 — ver "Actualización" al final)
- Ámbito: App 04 (INFOBRAS — obras públicas), su relación con las apps existentes.

## Contexto

El usuario trajo un PRD completo para integrar INFOBRAS (obras públicas, Contraloría) a
Follow the Sol, con 6 sprints y un alcance amplio (resolución de CUI con niveles de confianza,
señales de Cost Drift/Gap físico-financiero/Paralización, MCP tools). El PRD exige su propio
Sprint 0 de investigación en vivo ("gate obligatorio") antes de comprometerse con un esquema.

## Decisiones

### 1. App standalone, no extensión de una app existente

INFOBRAS es su propio dominio (obras físicas), distinto de presupuesto (radar-ejecucion),
inversiones (radar-inversiones) y contrataciones (compras-publicas). Se creó
`apps/infobras/{api,web}` (API 4003, web 3003, Postgres 5435) siguiendo el mismo patrón
establecido: Postgres propio vía Docker Compose con `name:` explícito (evita la colisión de
proyecto ya sufrida entre radar-ejecucion y compras-publicas), Express propio con
`asyncHandler` + middleware de error desde el día uno, Next.js propio con el mismo
`globals.css`.

### 2. Alcance recortado: una rebanada vertical, no el PRD completo

Se construyó conector → schema → API → frontend con datos reales de La Libertad, verificado
end-to-end — el mismo patrón de entrega incremental de App01-03. ~~El resto del PRD (6 sprints,
MCP tools, resolución de identidad avanzada) queda fuera; se retoma si el usuario lo pide.~~
**Actualizado 2026-09-02**: la mayor parte de "el resto del PRD" ya se construyó en sesiones
posteriores sin que se actualizara esta ADR — señales Cost Drift/Gap físico-financiero/
Paralización (`signals/signals.ts`, expuestas en `GET /api/public-works`) y la resolución de
identidad avanzada (crosswalk INFOBRAS↔radar-ejecucion por nombre, con niveles de confianza)
están hechas y probadas. Ver sección 4 y "Actualización" al final. El único ítem del PRD
original que sigue sin construirse es el frontend dedicado (`apps/infobras/web`, mencionado en
la decisión 1) — nunca se materializó; `rastro-web` (que no existía cuando se escribió esta ADR)
consume los datos de INFOBRAS pero no expone las señales visualmente todavía.

### 3. Parser XLSX propio en vez de una librería estándar

El plan original proponía `exceljs`'s `WorkbookReader` (streaming, la opción "battle-tested"
recomendada por las reglas de estilo). **Falló en la práctica**: devolvió 0 filas contra el
archivo real. El XML interno del export de INFOBRAS usa el prefijo de namespace `x:` en cada
etiqueta (`<x:row>`, `<x:c>`, `<x:v>`) en vez del namespace por defecto que `exceljs` espera —
un export no estándar de este sistema en particular. Se reemplazó por un parser streaming
propio (regex sobre el XML crudo, extraído del zip vía `unzipper` sin escribir a disco aparte),
el mismo enfoque ya validado a mano durante la investigación de Sprint 0.

**Lección**: "preferir librería battle-tested" es la heurística correcta por defecto, pero no
sustituye la verificación contra el archivo real — se probó contra datos reales antes de
confiar en el resultado, y el fallo se detectó ahí, no en producción.

### 4. Cruce con radar-inversiones por CUI, no por nombre

La hipótesis inicial (Sprint 0) era cruzar con `radar-ejecucion`/`radar-inversiones` por nombre
de entidad, reutilizando el matcher difuso de `compras-publicas` — porque `codigo Entidad` de
INFOBRAS no calza en formato con `SEC_EJEC` de MEF. Pero INFOBRAS sí trae CUI directo
(`Codigo unico de inversión`), y `radar-inversiones` también (`investments.cui`, de
Invierte.pe) — un match exacto por ID es más fuerte que cualquier matching por nombre. Se
implementó `GET /api/crossref` en `infobras/api` con este patrón (mismo que el cruce SEC_EJEC
de App02: agregación en vivo + join en la capa de aplicación, sin tabla de crosswalk
persistida, porque la clave es exacta y no hace falta cachear un score de confianza).

~~El cruce con `radar-ejecucion` por nombre (la idea original) queda pendiente — no descartada,
solo no priorizada porque el cruce por CUI ya cubre el caso de uso principal (avance físico
+ dato financiero del proyecto).~~ **Hecho (fecha exacta no registrada, confirmado 2026-09-02)**:
se implementó con el mismo matcher difuso de `compras-publicas`, persistido en
`entity_crosswalk` (`confidence`: `confirmada`/`candidata`, recalculable con
`npm run crossref:build`) — expuesto en `GET /api/crossref/ejecucion`, que trae devengado,
obras y obras paralizadas por entidad ya cruzada. Sin tool MCP hasta 2026-09-02
(`infobras_crossref_ejecucion`, PR #60) — el endpoint funcionaba y estaba testeado, pero un
agente IA no podía descubrirlo.

## Consecuencias

- Cualquier futura ingesta de un dataset XLSX de otra fuente gubernamental peruana debe
  **verificar el XML crudo primero**, no asumir que una librería estándar funcionará — este es
  el segundo caso en el proyecto (tras el CSV "space-as-decimal" del mismo dataset) de un
  formato no estándar en una fuente de datos abiertos del Estado.
- El patrón de cruce "por ID exacto cuando existe, por nombre difuso cuando no" ya tiene tres
  implementaciones reales en el proyecto (SEC_EJEC en App02, CUI en App04, nombre en App03) —
  es candidato a extraerse como utilidad compartida si aparece una cuarta.

## Actualización (2026-09-02)

Esta ADR describía el estado de `infobras/api` al 2026-08-16, con el resto del PRD de 6
sprints marcado explícitamente como "fuera de alcance". Una auditoría de código contra ese
resumen (motivada por `docs/ESTADO.md` pendiente #3) encontró que casi todo se construyó
en sesiones posteriores sin que nadie volviera a esta ADR para actualizarla — el texto llevaba
semanas desactualizado. Estado real al 2026-09-02:

| Ítem del PRD original | Estado |
|---|---|
| Cruce por CUI (INFOBRAS↔radar-inversiones) | ✅ Hecho desde el origen de esta ADR (sección 4) |
| Señal Cost Drift | ✅ Hecho — `signals/signals.ts`, expuesta en `GET /api/public-works` |
| Señal Gap físico-financiero | ✅ Hecho — ídem |
| Señal Paralización | ✅ Hecho — campos crudos desde el conector original (`existeParalizacion`, `causal`, `fecha`, `dias`) |
| Resolución de identidad avanzada (crosswalk por nombre, con confianza) | ✅ Hecho — `entity_crosswalk`, `GET /api/crossref/ejecucion` (ver sección 4 actualizada) |
| MCP tools sobre lo anterior | ✅ Hecho — 5 tools (`infobras_public_works`, `_resumen`, `_by_codigo`, `crossref`, `crossref_ejecucion`); el último se agregó recién en PR #60 |
| Frontend dedicado (`apps/infobras/web`) | ❌ Nunca se construyó — no existe en el repo |
| Dashboard consolidado mostrando las señales | ❌ Pendiente — `rastro-web` (`/distrito/:ubigeo`) consume datos de INFOBRAS pero no expone Cost Drift, Gap físico-financiero ni el crosswalk de confianza en la UI |

**Pendiente real que queda del PRD original**: solo el dashboard visual. Todo lo demás
(el backend completo: señales, cruces, MCP) está hecho, probado y documentado en
`docs/data-contracts/infobras-obras-publicas.md`.
