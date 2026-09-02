import { matchEntities as matchEntitiesGeneric } from "@appsperu/entity-matcher";

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

/**
 * Empareja entidades de `radar-ejecucion` (MEF) con contribuyentes del
 * padrón RUC (personas jurídicas, RUC-20) por nombre — no existe un ID
 * compartido entre ambas fuentes (ver "RUC del lado entidad" en
 * docs/data-contracts/sunat-padron-ruc.md). El algoritmo (normalizar,
 * tokenizar, Jaccard con umbral de confianza) vive en
 * `@appsperu/entity-matcher` (ADR-0017, consolidado desde 3 copias casi
 * idénticas) — este adaptador solo traduce los shapes propios de esta app.
 *
 * Probado en vivo contra el caso real que motivó esta función:
 * "MUNICIPALIDAD PROVINCIAL DE SANCHEZ CARRION - HUAMACHUCO" (radar-ejecucion)
 * <-> "MUNICIPALIDAD PROVINCIAL SANCHEZ CARRION" (padrón RUC, RUC
 * 20141897935) — matchea "candidata", score 0.8.
 *
 * Orden de argumentos preservado del original (padrón como lado A —
 * pre-normalizado y buscado; MEF como lado B — iterado): con múltiples
 * candidatos empatados en score, el desempate depende de cuál lado se
 * pre-normaliza primero, así que invertir el orden aquí cambiaría resultados
 * en casos de empate reales, no solo la forma del código.
 */
export function matchEntitiesToPadron(
  mefEntities: MefEntityInput[],
  padronEntities: PadronEntityInput[],
): CrosswalkMatch[] {
  const matches = matchEntitiesGeneric(
    padronEntities.map((p) => ({ id: p.ruc, nombre: p.razonSocial })),
    mefEntities.map((m) => ({ id: m.entityCode, nombre: m.nombre })),
  );
  return matches.map((m) => ({
    mefEntityCode: m.b.id,
    mefNombre: m.b.nombre,
    ruc: m.a.id,
    razonSocial: m.a.nombre,
    confidence: m.confidence,
    score: m.score,
  }));
}
