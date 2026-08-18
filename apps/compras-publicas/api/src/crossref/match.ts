export interface MefEntityInput {
  entityCode: string;
  nombre: string;
}

export interface OeceEntityInput {
  buyerId: string;
  buyerName: string;
}

export type Confidence = "confirmada" | "candidata";

export interface CrosswalkMatch {
  mefEntityCode: string;
  mefNombre: string;
  oeceBuyerId: string;
  oeceBuyerName: string;
  confidence: Confidence;
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

function normalize(name: string): string {
  return name
    .toUpperCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^A-Z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function coreTokens(name: string): Set<string> {
  return new Set(normalize(name).split(" ").filter((t) => t.length > 1 && !STOPWORDS.has(t)));
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let shared = 0;
  for (const t of a) if (b.has(t)) shared += 1;
  const union = a.size + b.size - shared;
  return shared / union;
}

const CANDIDATE_MIN_SCORE = 0.4;

/**
 * Empareja entidades del MEF (presupuesto) con compradoras de OECE (compras
 * públicas) por nombre — no existe un ID compartido entre ambas fuentes.
 * Pase 1: igualdad exacta tras normalizar -> "confirmada". Pase 2: similitud
 * Jaccard sobre tokens, exige >= 2 tokens compartidos para evitar falsos
 * positivos por una sola palabra genérica -> "candidata". Sin match: se omite,
 * no se fuerza una relación de baja confianza.
 */
export function matchEntities(mefEntities: MefEntityInput[], oeceEntities: OeceEntityInput[]): CrosswalkMatch[] {
  const mefNormalized = mefEntities.map((m) => ({ ...m, norm: normalize(m.nombre), tokens: coreTokens(m.nombre) }));
  const matches: CrosswalkMatch[] = [];

  for (const oece of oeceEntities) {
    const oeceNorm = normalize(oece.buyerName);
    const oeceTokens = coreTokens(oece.buyerName);

    const exact = mefNormalized.find((m) => m.norm === oeceNorm);
    if (exact) {
      matches.push({
        mefEntityCode: exact.entityCode,
        mefNombre: exact.nombre,
        oeceBuyerId: oece.buyerId,
        oeceBuyerName: oece.buyerName,
        confidence: "confirmada",
        score: 1,
      });
      continue;
    }

    let best: { mef: (typeof mefNormalized)[number]; score: number } | null = null;
    for (const mef of mefNormalized) {
      let sharedDistinctive = 0;
      for (const t of oeceTokens) {
        if (mef.tokens.has(t) && !ENTITY_TYPE_WORDS.has(t)) sharedDistinctive += 1;
      }
      const score = jaccard(oeceTokens, mef.tokens);
      if (sharedDistinctive >= 1 && score >= CANDIDATE_MIN_SCORE && (!best || score > best.score)) {
        best = { mef, score };
      }
    }

    if (best) {
      matches.push({
        mefEntityCode: best.mef.entityCode,
        mefNombre: best.mef.nombre,
        oeceBuyerId: oece.buyerId,
        oeceBuyerName: oece.buyerName,
        confidence: "candidata",
        score: best.score,
      });
    }
  }

  return matches;
}
