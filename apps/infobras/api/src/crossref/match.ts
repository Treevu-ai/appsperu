export interface EjecucionEntityInput {
  entityCode: string;
  nombre: string;
}

export interface InfobrasEntityInput {
  codigoEntidad: string;
  entidadNombre: string;
}

export type Confidence = "confirmada" | "candidata";

export interface CrosswalkMatch {
  ejecucionEntityCode: string;
  ejecucionNombre: string;
  infobrasCodigoEntidad: string;
  infobrasEntidadNombre: string;
  confidence: Confidence;
  score: number;
}

// Solo se quitan palabras verdaderamente redundantes (preposiciones/artículos).
// "MUNICIPALIDAD", "PROVINCIAL", "DISTRITAL", "GOBIERNO", "REGIONAL" SE
// CONSERVAN a propósito: distinguen tipo de entidad. Quitarlas causó un falso
// positivo real en el matcher equivalente de compras-publicas (Chilia ~
// Agallpampa, matcheaban solo por "MUNICIPALIDAD DISTRITAL").
const STOPWORDS = new Set(["DE", "LA", "LIBERTAD", "DEL", "Y", "UE"]);

// Palabras que describen el TIPO de entidad, no cuál entidad es. Se cuentan
// para el score de similitud, pero NUNCA alcanzan por sí solas el mínimo de
// tokens compartidos — ver nota equivalente en compras-publicas/src/crossref/match.ts.
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
 * Empareja entidades de radar-ejecucion (MEF) con entidades de INFOBRAS por
 * nombre — no existe un ID compartido entre ambas fuentes. Pase 1: igualdad
 * exacta tras normalizar -> "confirmada". Pase 2: similitud Jaccard sobre
 * tokens, exige >= 1 token distintivo compartido para evitar falsos
 * positivos por una sola palabra genérica -> "candidata". Sin match: se
 * omite, no se fuerza una relación de baja confianza.
 *
 * Mismo algoritmo que `compras-publicas/src/crossref/match.ts` (copiado, no
 * compartido por paquete — mismo criterio del resto del monorepo).
 */
export function matchEntities(
  ejecucionEntities: EjecucionEntityInput[],
  infobrasEntities: InfobrasEntityInput[]
): CrosswalkMatch[] {
  const ejecucionNormalized = ejecucionEntities.map((e) => ({
    ...e,
    norm: normalize(e.nombre),
    tokens: coreTokens(e.nombre),
  }));
  const matches: CrosswalkMatch[] = [];

  for (const infobras of infobrasEntities) {
    const infobrasNorm = normalize(infobras.entidadNombre);
    const infobrasTokens = coreTokens(infobras.entidadNombre);

    const exact = ejecucionNormalized.find((e) => e.norm === infobrasNorm);
    if (exact) {
      matches.push({
        ejecucionEntityCode: exact.entityCode,
        ejecucionNombre: exact.nombre,
        infobrasCodigoEntidad: infobras.codigoEntidad,
        infobrasEntidadNombre: infobras.entidadNombre,
        confidence: "confirmada",
        score: 1,
      });
      continue;
    }

    let best: { ejecucion: (typeof ejecucionNormalized)[number]; score: number } | null = null;
    for (const ejecucion of ejecucionNormalized) {
      let sharedDistinctive = 0;
      for (const t of infobrasTokens) {
        if (ejecucion.tokens.has(t) && !ENTITY_TYPE_WORDS.has(t)) sharedDistinctive += 1;
      }
      const score = jaccard(infobrasTokens, ejecucion.tokens);
      if (sharedDistinctive >= 1 && score >= CANDIDATE_MIN_SCORE && (!best || score > best.score)) {
        best = { ejecucion, score };
      }
    }

    if (best) {
      matches.push({
        ejecucionEntityCode: best.ejecucion.entityCode,
        ejecucionNombre: best.ejecucion.nombre,
        infobrasCodigoEntidad: infobras.codigoEntidad,
        infobrasEntidadNombre: infobras.entidadNombre,
        confidence: "candidata",
        score: best.score,
      });
    }
  }

  return matches;
}
