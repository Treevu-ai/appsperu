# ADR-0017: Consolidación de los matchers difusos de entidad — evaluación (CX-05)

- Estado: **Implementado (2026-09-02, misma sesión)**. Evaluado primero como "sin implementación
  en esta iteración"; el usuario pidió retomarlo y se ejecutó el plan completo (pasos 1-4 de
  "Recomendación para una futura iteración").
- Fecha: 2026-09-02
- Ámbito: `packages/entity-matcher/` (nuevo), `package.json` raíz (nuevo, workspace acotado),
  `apps/compras-publicas/api/src/crossref/match.ts`, `apps/infobras/api/src/crossref/match.ts`,
  `apps/identidad-fiscal/api/src/crossref/match.ts`, `.github/workflows/ci.yml`.
- Origen: [`docs/PRD_Confiabilidad_Conectores_y_Cruces_v1.md`](../PRD_Confiabilidad_Conectores_y_Cruces_v1.md)
  §5 CX-05.

## Contexto

Tres apps mantienen un matcher difuso de nombres de entidad, cada una con su propio archivo
`crossref/match.ts` y su propia tabla `entity_crosswalk` (o, en el caso de `identidad-fiscal`,
sin tabla propia — corre el match en cada request de `GET /api/crossref/entidades`):

| App | Par que empareja | Tabla `entity_crosswalk` propia |
|---|---|---|
| `compras-publicas` | `mef_entity_code` ↔ `oece_buyer_id` | Sí |
| `infobras` | `ejecucion_entity_code` ↔ `infobras_codigo_entidad` | Sí |
| `identidad-fiscal` | `mef_entity_code` ↔ `ruc` (padrón) | No — corre en vivo por request |

## Hallazgo: los tres matchers son el mismo algoritmo, copiado tres veces

Comparación línea por línea de los tres `match.ts` (116-122 líneas cada uno): comparten
exactamente `normalize()`, `coreTokens()`, `ENTITY_TYPE_WORDS`, `jaccard()`,
`CANDIDATE_MIN_SCORE = 0.4`, y la lógica de dos pasadas (exacto → "confirmada"; Jaccard con
`sharedDistinctive >= 1` → "candidata"). Los comentarios del propio código lo confirman:
`identidad-fiscal/crossref/match.ts` dice explícitamente *"Copiado tal cual de
compras-publicas/src/crossref/match.ts (2026-08-20) — mismo patrón de este proyecto: cada app es
standalone, sin paquete compartido entre ellas"*; `infobras/crossref/match.ts` dice *"Mismo
algoritmo que compras-publicas/src/crossref/match.ts (copiado, no compartido por paquete)"*.

**Evidencia de que la copia ya generó divergencia real, no solo teórica**: el comentario de
`compras-publicas/match.ts` dice *"exige >= 2 tokens compartidos"*, pero el código de las tres
copias usa `sharedDistinctive >= 1`. La copia de `infobras` corrigió la redacción del comentario
a *"exige >= 1 token distintivo compartido"` al pegarla; la de `compras-publicas` (el original)
se quedó con el comentario desactualizado. Es un ejemplo concreto — encontrado al hacer esta
evaluación, no hipotético — de cómo mantener tres copias permite que la documentación inline se
desalinee del comportamiento real sin que nada lo detecte.

También comparten historia de bugs: el comentario sobre el falso positivo "Chilia ~ Agallpampa"
(dos municipalidades distritales que matcheaban solo por compartir el tipo de entidad, no el
nombre de lugar) aparece en las tres copias — la corrección se propagó manualmente a las tres, lo
que funcionó esta vez, pero es exactamente el tipo de fix que puede perderse en una futura copia
si alguien edita una sin acordarse de las otras dos.

## Costo de consolidar vs. costo de mantener 3 copias

**Costo de mantener 3 copias** (medido, no estimado): un bug encontrado en el algoritmo requiere
localizar y corregir 3 archivos en 3 apps distintas, y verificar que los 3 conjuntos de tests
(`match.test.ts` × 3) sigan pasando. Ya pasó una vez con el bug de Chilia/Agallpampa. El
desalineamiento de comentarios encontrado arriba es evidencia de que ese proceso manual no es
perfecto incluso cuando se sigue con cuidado.

**Costo de consolidar**: el repo no tiene un mecanismo de paquete compartido entre apps hoy
—cada app es standalone y se despliega independientemente (confirmado en los propios comentarios
de código citados arriba, y en la estructura de `apps/*/api` como proyectos npm separados sin
`workspaces` a nivel raíz: no existe `package.json` en la raíz del monorepo). Extraer un paquete
compartido real (`packages/entity-matcher`, análogo a `packages/http-client` que ya existe)
implicaría: (a) crear el paquete, (b) publicarlo de forma consumible por cada app (workspace npm,
`file:` dependency, o registro privado — el repo no tiene ninguno de los tres configurado hoy),
y (c) migrar las 3 apps a importarlo, con sus 3 suites de test verificando que el resultado no
cambie. Es un esfuerzo real (M, no S) pero acotado — el algoritmo mismo es correcto y estable;
lo que cambia es solo dónde vive.

## Decisión

**Se recomendó consolidar. Al retomar el ADR en la misma sesión, se implementó completo.**

**Corrección sobre el análisis original**: la sección anterior de este ADR afirmaba que
`packages/http-client` "ya establece el patrón de paquete compartido en este monorepo". Al
verificar antes de tocar la raíz del repo, resultó ser **falso** — `packages/http-client` es un
archivo huérfano (`src/index.ts`, sin `package.json`, sin `tsconfig.json`, sin ninguna app que lo
importe). No había ningún precedente real de paquete compartido en el monorepo; la decisión de
abajo se tomó sabiendo eso, no asumiendo un patrón que no existía.

## Implementación (2026-09-02)

1. ✅ **Mecanismo decidido: npm workspaces, acotado a solo lo necesario.** `package.json` en la
   raíz del repo con `"workspaces": ["packages/*", "apps/compras-publicas/api",
   "apps/infobras/api", "apps/identidad-fiscal/api"]` — las otras 11 apps del monorepo **no**
   se agregaron (decisión explícita del usuario, para minimizar el blast radius de un cambio de
   tooling a nivel monorepo). `packages/http-client` sigue huérfano — fuera de alcance de este
   ADR, no se resucitó de paso.
2. ✅ `packages/entity-matcher/` (con `package.json`, `tsconfig.json`, `vitest.config.ts`) expone
   `matchEntities<A, B>(as, bs)` genérico sobre `{ id, nombre }`, con `normalize`/`coreTokens`/
   `jaccard`/`STOPWORDS`/`ENTITY_TYPE_WORDS`/`CANDIDATE_MIN_SCORE` movidos verbatim desde la
   copia de `compras-publicas` (la primera, origen de las otras dos). 7 tests propios,
   incluyendo la regresión Chilia/Agallpampa.
3. ✅ Las 3 apps migradas a adaptadores delgados que llaman a `matchEntitiesGeneric` y traducen
   sus shapes de dominio — **sin cambiar su API pública** (mismo nombre de función, mismos
   campos de entrada/salida), así que ningún caller (`routes/crossref.ts` de cada app) se tocó.
   `identidad-fiscal/match.ts` requirió cuidado extra: su orden de argumentos originales tenía
   padrón como lado pre-normalizado y MEF como lado iterado (al revés que los otros dos) —
   preservado explícitamente en el adaptador con un comentario, porque invertirlo cambiaría el
   desempate en casos de score empatado, no solo la forma del código.
4. ✅ Se corrigió el comentario desactualizado de `compras-publicas/match.ts` (decía ">= 2 tokens
   compartidos", el código real usa ">= 1 token distintivo") — ya no aplica por separado, quedó
   consolidado en el comentario único de `packages/entity-matcher/src/index.ts`.

**Verificado**: `tsc --noEmit`, suite de tests completa y `npm run build` en las 3 apps, corridos
desde una instalación limpia (`rm -rf node_modules` en las 3 apps + raíz, reinstalación desde
cero) — compras-publicas 90/90, infobras 82/82, identidad-fiscal 9/9, entity-matcher 7/7. Una
app **no** incluida en el workspace (`radar-ejecucion`) se verificó sin cambios de comportamiento.

**Efecto colateral real, ya resuelto**: los `package-lock.json` propios de las 3 apps quedaron
obsoletos al agregar la dependencia nueva (`npm ci` local hubiera fallado por lockfile
desincronizado) — se eliminaron esos 3 archivos (ahora los gestiona el lockfile raíz del
workspace) y se actualizó `.github/workflows/ci.yml`: el paso de instalación detecta si la app
tiene su propio `package-lock.json` (las 11 apps + mcp-server no tocados, instalación sin
cambios) o no (las 3 apps del workspace, instala desde la raíz del repo). El resto de los pasos
de CI (typecheck, test, build) no cambiaron.

## Referencias

- Ticket: [`docs/TICKETS_Confiabilidad_Conectores_y_Cruces_v1.md#CX-05`](../TICKETS_Confiabilidad_Conectores_y_Cruces_v1.md)
- Precedente de paquete compartido en el monorepo: `packages/http-client`
