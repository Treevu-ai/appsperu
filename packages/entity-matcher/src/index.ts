/**
 * Matcher difuso de nombres de entidad, consolidado desde 3 copias casi
 * idénticas (ADR-0017: docs/adr/0017-consolidacion-entity-crosswalk-evaluacion.md)
 * que vivían en `apps/compras-publicas/api/src/crossref/match.ts`,
 * `apps/infobras/api/src/crossref/match.ts` e
 * `apps/identidad-fiscal/api/src/crossref/match.ts`.
 *
 * El algoritmo es genérico sobre `{ id, nombre }` — cada app sigue
 * exponiendo su propia función con sus propios nombres de campo
 * (`mefEntityCode`, `oeceBuyerId`, etc.), pero delega el cálculo acá. Ver
 * cada `match.ts` de app para el adaptador correspondiente.
 */

export interface MatchInputSide {
  id: string;
  nombre: string;
}

export type MatchConfidence = "confirmada" | "candidata";

export interface EntityMatch<A extends MatchInputSide, B extends MatchInputSide> {
  a: A;
  b: B;
  confidence: MatchConfidence;
  score: number;
}

// Solo se quitan palabras verdaderamente redundantes (preposiciones/artículos).
// "MUNICIPALIDAD", "PROVINCIAL", "DISTRITAL", "GOBIERNO", "REGIONAL" SE
// CONSERVAN a propósito: distinguen tipo de entidad. Quitarlas causó un falso
// positivo real en la primera versión de este matcher (Chilia ~ Agallpampa,
// matcheaban solo por "MUNICIPALIDAD DISTRITAL").
const STOPWORDS = new Set(["DE", "LA", "LIBERTAD", "DEL", "Y", "UE"]);

// Palabras que describen el TIPO de entidad, no cuál entidad es. Se cuentan
// para el score de similitud (dos municipalidades distritales sí se parecen
// más entre sí que a un gobierno regional), pero NUNCA alcanzan por sí solas
// el mínimo de tokens compartidos — si no, "MUNICIPALIDAD DISTRITAL DE
// AGALLPAMPA" y "... DE CHILIA" matchean por ser ambas "municipalidades
// distritales", sin que sus nombres de lugar tengan nada en común (bug real
// detectado antes de persistir este matcher — ver test de regresión).
const ENTITY_TYPE_WORDS = new Set(["MUNICIPALIDAD", "PROVINCIAL", "DISTRITAL", "GOBIERNO", "REGIONAL", "REGION"]);

const CANDIDATE_MIN_SCORE = 0.4;

export function normalize(name: string): string {
  return name
    .toUpperCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^A-Z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function coreTokens(name: string): Set<string> {
  return new Set(normalize(name).split(" ").filter((t) => t.length > 1 && !STOPWORDS.has(t)));
}

export function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let shared = 0;
  for (const t of a) if (b.has(t)) shared += 1;
  const union = a.size + b.size - shared;
  return shared / union;
}

/**
 * Empareja el lado A (ej. entidades MEF) contra el lado B (ej. compradoras
 * OECE, contribuyentes del padrón) por nombre — no existe un ID compartido
 * entre las fuentes reales que consumen esto. Pase 1: igualdad exacta tras
 * normalizar -> "confirmada". Pase 2: similitud Jaccard sobre tokens, exige
 * >= 1 token distintivo compartido (excluyendo ENTITY_TYPE_WORDS) para
 * evitar falsos positivos por una sola palabra genérica -> "candidata". Sin
 * match: se omite, no se fuerza una relación de baja confianza.
 */
export function matchEntities<A extends MatchInputSide, B extends MatchInputSide>(
  as: readonly A[],
  bs: readonly B[],
): EntityMatch<A, B>[] {
  const aNormalized = as.map((item) => ({ item, norm: normalize(item.nombre), tokens: coreTokens(item.nombre) }));
  const matches: EntityMatch<A, B>[] = [];

  for (const b of bs) {
    const bNorm = normalize(b.nombre);
    const bTokens = coreTokens(b.nombre);

    const exact = aNormalized.find((a) => a.norm === bNorm);
    if (exact) {
      matches.push({ a: exact.item, b, confidence: "confirmada", score: 1 });
      continue;
    }

    let best: { a: (typeof aNormalized)[number]; score: number } | null = null;
    for (const a of aNormalized) {
      let sharedDistinctive = 0;
      for (const t of bTokens) {
        if (a.tokens.has(t) && !ENTITY_TYPE_WORDS.has(t)) sharedDistinctive += 1;
      }
      const score = jaccard(bTokens, a.tokens);
      if (sharedDistinctive >= 1 && score >= CANDIDATE_MIN_SCORE && (!best || score > best.score)) {
        best = { a, score };
      }
    }

    if (best) {
      matches.push({ a: best.a.item, b, confidence: "candidata", score: best.score });
    }
  }

  return matches;
}
