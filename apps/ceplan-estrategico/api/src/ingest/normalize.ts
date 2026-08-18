import type { ObservaCollectionRaw } from "./field-mapping.js";

export interface CanonicalIndicatorRow {
  indicatorCode: string;
  indicatorName: string;
  serieId: string;
  serieLabel: string;
  nivelGobierno: string | null;
  measurementDate: string;
  value: number;
  unitOfMeasure: string | null;
  frequency: string;
  source: string;
}

export interface RejectedRow {
  raw: Record<string, unknown>;
  reason: string;
}

export interface NormalizeResult {
  rows: CanonicalIndicatorRow[];
  rejected: RejectedRow[];
}

function periodoToDate(periodo: string): string | null {
  if (!/^\d{4}$/.test(periodo)) return null;
  return `${periodo}-01-01`;
}

/**
 * Aplana `indicadores[].series[].observaciones[]` del JSON de ObservaPerú al modelo
 * canónico de `strategic_indicators`. Una observación con `periodo`/`valor` inválido se
 * aísla en `rejected` con su motivo, nunca se descarta silenciosamente (mismo criterio
 * que `radar-ejecucion/ingest/normalize.ts`). `nivelGobierno` queda `null` cuando la serie
 * no trae ese filtro (ej. series por `pais`, `ambito`, `riesgo`, etc.) — solo las series
 * con `filtros.nivelGobierno` son elegibles para el cruce con radar-ejecucion.
 */
export function normalizeObservaIndicadores(raw: ObservaCollectionRaw): NormalizeResult {
  const rejected: RejectedRow[] = [];
  const rows: CanonicalIndicatorRow[] = [];

  for (const indicador of raw.indicadores) {
    if (!indicador.codigo || !indicador.nombre) {
      rejected.push({ raw: indicador as unknown as Record<string, unknown>, reason: "indicador sin código o nombre" });
      continue;
    }

    for (const serie of indicador.series ?? []) {
      if (!serie.id) {
        rejected.push({
          raw: { indicador: indicador.codigo, serie } as unknown as Record<string, unknown>,
          reason: "serie sin id",
        });
        continue;
      }

      for (const obs of serie.observaciones ?? []) {
        const measurementDate = periodoToDate(obs.periodo);
        if (measurementDate === null) {
          rejected.push({
            raw: { indicador: indicador.codigo, serie: serie.id, obs } as unknown as Record<string, unknown>,
            reason: `periodo no es un año de 4 dígitos: ${obs.periodo}`,
          });
          continue;
        }
        if (typeof obs.valor !== "number" || !Number.isFinite(obs.valor)) {
          rejected.push({
            raw: { indicador: indicador.codigo, serie: serie.id, obs } as unknown as Record<string, unknown>,
            reason: "valor no numérico",
          });
          continue;
        }

        rows.push({
          indicatorCode: indicador.codigo,
          indicatorName: indicador.nombre,
          serieId: serie.id,
          serieLabel: serie.nombre ?? serie.id,
          nivelGobierno: serie.filtros?.nivelGobierno ?? null,
          measurementDate,
          value: obs.valor,
          unitOfMeasure: obs.unidad ?? indicador.unidad?.simbolo ?? null,
          frequency: indicador.frecuencia,
          source: "ObservaPerú",
        });
      }
    }
  }

  return { rows, rejected };
}
