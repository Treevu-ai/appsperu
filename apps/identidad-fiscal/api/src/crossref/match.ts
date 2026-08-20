export interface MefEntityInput {
  entityCode: string;
  nombre: string;
}

export interface PadronEntityInput {
  ruc: string;
  razonSocial: string;
}

export type Confidence = "confirmada" | "candidata";

export interface CrosswalkMatch {
  mefEntityCode: string;
  mefNombre: string;
  ruc: string;
  razonSocial: string;
  confidence: Confidence;
  score: number;
}

// Copiado tal cual de compras-publicas/src/crossref/match.ts (2026-08-20) —
// mismo patrón de este proyecto: cada app es standalone, sin paquete
// compartido entre ellas. Probado en vivo contra el caso real que motivó
// esta función acá: "MUNICIPALIDAD PROVINCIAL DE SANCHEZ CARRION -
// HUAMACHUCO" (radar-ejecucion) <-> "MUNICIPALIDAD PROVINCIAL SANCHEZ
// CARRION" (padrón RUC, RUC 20141897935) — matchea "candidata", score 0.8,
// SIN modificar el matcher. No hizo falta extenderlo, solo reutilizarlo.
const STOPWORDS = new Set(["DE", "LA", "LIBERTAD", "DEL", "Y", "UE"]);
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
 * Empareja entidades de `radar-ejecucion` (MEF) con contribuyentes del
 * padrón RUC (personas jurídicas, RUC-20) por nombre — no existe un ID
 * compartido entre ambas fuentes (ver "RUC del lado entidad" en
 * docs/data-contracts/sunat-padron-ruc.md). Pase 1: igualdad exacta tras
 * normalizar -> "confirmada". Pase 2: similitud Jaccard sobre tokens, exige
 * >= 1 token compartido no genérico -> "candidata". Sin match: se omite.
 */
export function matchEntitiesToPadron(
  mefEntities: MefEntityInput[],
  padronEntities: PadronEntityInput[]
): CrosswalkMatch[] {
  const padronNormalized = padronEntities.map((p) => ({
    ...p,
    norm: normalize(p.razonSocial),
    tokens: coreTokens(p.razonSocial),
  }));
  const matches: CrosswalkMatch[] = [];

  for (const mef of mefEntities) {
    const mefNorm = normalize(mef.nombre);
    const mefTokens = coreTokens(mef.nombre);

    const exact = padronNormalized.find((p) => p.norm === mefNorm);
    if (exact) {
      matches.push({
        mefEntityCode: mef.entityCode,
        mefNombre: mef.nombre,
        ruc: exact.ruc,
        razonSocial: exact.razonSocial,
        confidence: "confirmada",
        score: 1,
      });
      continue;
    }

    let best: { padron: (typeof padronNormalized)[number]; score: number } | null = null;
    for (const padron of padronNormalized) {
      let sharedDistinctive = 0;
      for (const t of mefTokens) {
        if (padron.tokens.has(t) && !ENTITY_TYPE_WORDS.has(t)) sharedDistinctive += 1;
      }
      const score = jaccard(mefTokens, padron.tokens);
      if (sharedDistinctive >= 1 && score >= CANDIDATE_MIN_SCORE && (!best || score > best.score)) {
        best = { padron, score };
      }
    }

    if (best) {
      matches.push({
        mefEntityCode: mef.entityCode,
        mefNombre: mef.nombre,
        ruc: best.padron.ruc,
        razonSocial: best.padron.razonSocial,
        confidence: "candidata",
        score: best.score,
      });
    }
  }

  return matches;
}
