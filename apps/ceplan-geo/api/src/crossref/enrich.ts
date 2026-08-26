import type { TerritoryMatchStatus, TerritoryRecord } from "./territory-lookup.js";
import type { NearbyInfrastructure } from "./nearby-infrastructure.js";

export type CoberturaEstado = "COMPLETA_VERIFICADA" | "PARCIAL" | "SIN_DATOS_EN_FUENTE" | "BLOQUEADA";

export function serializeTerritory(territory: TerritoryRecord | null) {
  if (!territory) return null;
  return {
    ubigeo: territory.ubigeo,
    departamento: territory.departamento,
    provincia: territory.provincia,
    distrito: territory.distrito,
    geometry: territory.geometryGeojson ? JSON.parse(territory.geometryGeojson) : null,
  };
}

export function crossrefEnvelope(input: {
  matcher: string;
  cobertura: CoberturaEstado;
  restriccion: string;
  dependencias: Array<{ app: string; url: string; ok: boolean; error?: string }>;
  corte?: Record<string, unknown>;
  resultados: unknown[];
}) {
  return {
    matcher: input.matcher,
    cobertura: input.cobertura,
    restriccion: input.restriccion,
    dependencias: input.dependencias,
    corte: input.corte ?? { generadoEl: new Date().toISOString() },
    resultados: input.resultados,
  };
}

export function enrichWithTerritory(input: {
  territory: TerritoryRecord | null;
  matchStatus: TerritoryMatchStatus;
  nearbyInfrastructure?: NearbyInfrastructure[];
  payload: Record<string, unknown>;
}) {
  return {
    ...input.payload,
    territorio: serializeTerritory(input.territory),
    matcher: input.matchStatus === "confirmada" ? "territorio_nombre" : input.matchStatus,
    nearbyInfrastructure: input.nearbyInfrastructure ?? [],
    restriccion:
      input.matchStatus === "sin_match"
        ? "No se pudo resolver UBIGEO oficial; no afirmar ubicación territorial exacta."
        : input.matchStatus === "candidata"
          ? "Tríada territorial ambigua; el UBIGEO es candidato, no confirmado."
          : "Pertenencia territorial por nombre normalizado; no implica coordenadas de la obra/inversión.",
  };
}
