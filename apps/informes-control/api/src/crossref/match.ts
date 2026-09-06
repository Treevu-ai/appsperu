import { matchEntities as matchEntitiesGeneric } from "@appsperu/entity-matcher";

export interface MefEntityInput {
  entityCode: string;
  nombre: string;
}

export interface InformesEntidadInput {
  entidad: string;
  totalInformes: number;
  informesConResponsabilidad: number;
}

export type Confidence = "confirmada" | "candidata";

export interface CrosswalkMatch {
  mefEntityCode: string;
  mefNombre: string;
  entidad: string;
  totalInformes: number;
  informesConResponsabilidad: number;
  confidence: Confidence;
  score: number;
}

/**
 * Empareja entidades de `radar-ejecucion` (MEF) con el nombre de entidad
 * que trae cada informe de Contraloría — no existe un ID compartido entre
 * ambas fuentes (la API de Contraloría confirmó en vivo que `CodigoEntidad`
 * viene `null`, ver `docs/data-contracts/contraloria-informes-control.md`).
 * El algoritmo (normalizar, tokenizar, Jaccard con umbral de confianza)
 * vive en `@appsperu/entity-matcher` (ADR-0017) — este adaptador solo
 * traduce los shapes propios de esta app, mismo patrón que
 * `identidad-fiscal/crossref/match.ts` (`matchEntitiesToPadron`).
 */
export function matchEntitiesToInformes(
  mefEntities: MefEntityInput[],
  informesEntidades: InformesEntidadInput[],
): CrosswalkMatch[] {
  const matches = matchEntitiesGeneric(
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
