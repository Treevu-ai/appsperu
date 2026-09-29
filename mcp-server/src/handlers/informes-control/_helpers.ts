/*
 * Matcher difuso de nombres de entidad, copiado tal cual desde
 * `packages/entity-matcher/src/index.ts` (@appsperu/entity-matcher, ADR-0017)
 * porque `mcp-server` no declara ese paquete como dependencia — mismo motivo
 * y mismo patrón que `proveedores-sancionados/_helpers.ts` (que copia
 * @appsperu/shared-identity). Si el algoritmo original diverge, este debe
 * actualizarse a mano.
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
// CONSERVAN a propósito: distinguen tipo de entidad.
const STOPWORDS = new Set(["DE", "LA", "LIBERTAD", "DEL", "Y", "UE"]);

// Palabras que describen el TIPO de entidad, no cuál entidad es. Se cuentan
// para el score de similitud pero NUNCA alcanzan por sí solas el mínimo de
// tokens compartidos.
const ENTITY_TYPE_WORDS = new Set([
  "MUNICIPALIDAD",
  "PROVINCIAL",
  "DISTRITAL",
  "GOBIERNO",
  "REGIONAL",
  "REGION",
  "PROYECTO",
  "ESPECIAL",
]);

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

/*
 * Adaptador copiado tal cual desde
 * apps/informes-control/api/src/crossref/match.ts (`matchEntitiesToInformes`).
 */
export interface MefEntityInput {
  entityCode: string;
  nombre: string;
}

export interface InformesEntidadInput {
  entidad: string;
  totalInformes: number;
  informesConResponsabilidad: number;
}

export interface CrosswalkMatch {
  mefEntityCode: string;
  mefNombre: string;
  entidad: string;
  totalInformes: number;
  informesConResponsabilidad: number;
  confidence: MatchConfidence;
  score: number;
}

export function matchEntitiesToInformes(
  mefEntities: MefEntityInput[],
  informesEntidades: InformesEntidadInput[],
): CrosswalkMatch[] {
  const matches = matchEntities(
    informesEntidades.map((i) => ({ id: i.entidad, nombre: i.entidad })),
    mefEntities.map((m) => ({ id: m.entityCode, nombre: m.nombre })),
  );
  const byEntidad = new Map(informesEntidades.map((i) => [i.entidad, i]));

  return matches.map((m) => {
    const informe = byEntidad.get(m.a.id)!;
    return {
      mefEntityCode: m.b.id,
      mefNombre: m.b.nombre,
      entidad: informe.entidad,
      totalInformes: informe.totalInformes,
      informesConResponsabilidad: informe.informesConResponsabilidad,
      confidence: m.confidence,
      score: m.score,
    };
  });
}
