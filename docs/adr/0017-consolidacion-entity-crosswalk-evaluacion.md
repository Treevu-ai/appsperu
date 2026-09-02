# ADR-0017: Consolidación de los matchers difusos de entidad — evaluación (CX-05)

- Estado: Evaluado — recomienda consolidar, sin implementación en esta iteración.
- Fecha: 2026-09-02
- Ámbito: `apps/compras-publicas/api/src/crossref/match.ts`, `apps/infobras/api/src/crossref/match.ts`,
  `apps/identidad-fiscal/api/src/crossref/match.ts`.
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

**Se recomienda consolidar, pero no se implementa en esta iteración.** El análisis muestra que
el costo de mantener 3 copias no es hipotético (ya generó una divergencia de documentación
real), y `packages/http-client` ya establece el patrón de paquete compartido en este monorepo —
extender ese patrón a un matcher de entidades es coherente con la arquitectura existente, no una
excepción nueva.

Se difiere la implementación porque: (1) es P2 en el backlog de origen, sin fecha comprometida;
(2) el algoritmo actual funciona correctamente en las 3 apps — esto es deuda técnica de
mantenibilidad, no un bug activo que esté produciendo resultados incorrectos hoy; (3) requiere
decidir primero el mecanismo de paquete compartido (workspace npm a nivel raíz vs. `file:`
dependency vs. otro), que es una decisión de arquitectura del monorepo más amplia que el propio
matcher, y no debe tomarse como efecto secundario de este ticket.

## Recomendación para una futura iteración

1. Decidir el mecanismo de paquete compartido a nivel de monorepo (probablemente npm workspaces
   a nivel raíz, dado que no existe ninguno hoy — pero esa decisión afecta más que solo este
   matcher, amerita su propio ADR).
2. Extraer `packages/entity-matcher` con el algoritmo genérico (`normalize`, `coreTokens`,
   `jaccard`, `matchEntities<A, B>` parametrizado por los shapes de entrada/salida en vez de
   hardcodear `MefEntityInput`/`OeceEntityInput` por app).
3. Migrar las 3 apps una por una, verificando que cada suite de tests existente
   (`match.test.ts`) siga pasando con el mismo resultado antes/después — el algoritmo no debe
   cambiar de comportamiento en la migración, solo de ubicación.
4. Corregir el comentario desactualizado de `compras-publicas/match.ts` (línea sobre "2 tokens
   compartidos") como parte de esa migración, ya que el paquete consolidado tendría un solo
   comentario en vez de tres potencialmente inconsistentes.

## Referencias

- Ticket: [`docs/TICKETS_Confiabilidad_Conectores_y_Cruces_v1.md#CX-05`](../TICKETS_Confiabilidad_Conectores_y_Cruces_v1.md)
- Precedente de paquete compartido en el monorepo: `packages/http-client`
