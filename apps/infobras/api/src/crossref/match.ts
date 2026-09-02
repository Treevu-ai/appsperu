import { matchEntities as matchEntitiesGeneric } from "@appsperu/entity-matcher";

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

/**
 * Empareja entidades de radar-ejecucion (MEF) con entidades de INFOBRAS por
 * nombre — no existe un ID compartido entre ambas fuentes. El algoritmo
 * (normalizar, tokenizar, Jaccard con umbral de confianza) vive en
 * `@appsperu/entity-matcher` (ADR-0017, consolidado desde 3 copias casi
 * idénticas) — este adaptador solo traduce los shapes propios de esta app.
 */
export function matchEntities(
  ejecucionEntities: EjecucionEntityInput[],
  infobrasEntities: InfobrasEntityInput[],
): CrosswalkMatch[] {
  const matches = matchEntitiesGeneric(
    ejecucionEntities.map((e) => ({ id: e.entityCode, nombre: e.nombre })),
    infobrasEntities.map((i) => ({ id: i.codigoEntidad, nombre: i.entidadNombre })),
  );
  return matches.map((m) => ({
    ejecucionEntityCode: m.a.id,
    ejecucionNombre: m.a.nombre,
    infobrasCodigoEntidad: m.b.id,
    infobrasEntidadNombre: m.b.nombre,
    confidence: m.confidence,
    score: m.score,
  }));
}
