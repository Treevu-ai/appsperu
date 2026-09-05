import { matchEntities as matchEntitiesGeneric } from "@appsperu/entity-matcher";

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

/**
 * Empareja entidades del MEF (presupuesto) con compradoras de OECE (compras
 * públicas) por nombre — no existe un ID compartido entre ambas fuentes.
 * El algoritmo (normalizar, tokenizar, Jaccard con umbral de confianza) vive
 * en `@appsperu/entity-matcher` (ADR-0017) — este adaptador solo traduce los
 * shapes de entrada/salida propios de esta app.
 */
export function matchEntities(mefEntities: MefEntityInput[], oeceEntities: OeceEntityInput[]): CrosswalkMatch[] {
  const matches = matchEntitiesGeneric(
    mefEntities.map((m) => ({ id: m.entityCode, nombre: m.nombre })),
    oeceEntities.map((o) => ({ id: o.buyerId, nombre: o.buyerName })),
  );
  return matches.map((m) => ({
    mefEntityCode: m.a.id,
    mefNombre: m.a.nombre,
    oeceBuyerId: m.b.id,
    oeceBuyerName: m.b.nombre,
    confidence: m.confidence,
    score: m.score,
  }));
}
