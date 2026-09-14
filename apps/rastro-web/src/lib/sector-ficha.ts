import type { Cobertura } from "./types.js";

/** Una fila de presupuesto en `GET /api/sectores/:sectorId/ficha` — mismo shape que `mapBudget`. */
export interface SectorFichaEntidad {
  sectorId: string;
  sector: string;
  entityCode: string;
  entidad: string;
  tipoEntidad: string;
  nivelGobierno: string;
  reglaTerritorial: "META_DEPARTAMENTO" | "SEDE_EJECUTORA";
  alcance: string;
  pia: number;
  pim: number;
  devengado: number;
  saldoPorDevengar: number | null;
  cobertura: {
    estado: Cobertura | "NO_VERIFICADA";
    fechaCorteParticion: string | null;
    registrosParticion: number | null;
  };
  cortesUsados: string[];
  recursos: string[];
}

export interface SectorFichaInversion {
  cui: string;
  actividad: string;
  entidadResponsable: string | null;
  departamento: string | null;
  piaLegal: number | null;
  pim: number | null;
  devengado: number | null;
  estadoPim: string | null;
  entityCode: string;
  evidenceUrl: string | null;
  alertaConsistenciaTerritorial: string | null;
  fechaObservacion: string | null;
}

export interface SectorFichaObra {
  codigoInfobras: string;
  cui: string | null;
  nombre: string;
  estadoEjecucion: string | null;
  departamento: string | null;
  provincia: string | null;
  distrito: string | null;
  avanceFisicoRealPct: number | null;
  ejecucionFinancieraPct: number | null;
  existeParalizacion: boolean | null;
  diasParalizado: number | null;
  fechaParalizacion: string | null;
  costDriftPct: number | null;
  gapFisicoFinanciero: number | null;
}

/** Umbral de |gap físico − financiero| para el resumen de riesgo (pp). Misma regla que `/distrito`. */
export const GAP_FISICO_FINANCIERO_UMBRAL_PP = 20;

export interface SectorFichaContratacion {
  contractingId: string;
  ocid: string | null;
  awardId: string | null;
  objeto: string | null;
  montoAdjudicado: number | null;
  publicationDate: string | null;
  awardDate: string | null;
  entidadCompradora: string | null;
  provincia: string | null;
  distrito: string | null;
  fuenteUrl: string | null;
}

/** Respuesta real de `GET /api/sectores/:sectorId/ficha` (radar-ejecucion). */
export interface SectorFichaResponse {
  sector: { id: string; nombre: string };
  anio: number;
  departamento: string;
  entidades: SectorFichaEntidad[];
  inversiones: {
    estado: "VINCULO_OFICIAL" | "SIN_VINCULO_OFICIAL";
    resultados: SectorFichaInversion[];
  };
  obras:
    | {
        estado: "CUI_EXACTO" | "SIN_CUI_CON_VINCULO_OFICIAL" | "INFOBRAS_NO_CONFIGURADO";
        resultados: SectorFichaObra[];
      }
    | SectorFichaObra[];
  contrataciones: {
    estado:
      | "IDENTIDAD_MEF_COMPRAS_VERIFICADA"
      | "SIN_VINCULO_MEF_COMPRAS_VERIFICADO"
      | "SIN_ENTIDADES_VERIFICADAS"
      | "COMPRAS_NO_CONFIGURADO";
    resultados: SectorFichaContratacion[];
  };
  advertenciaGasto: string;
  limitation: string;
}

export interface SectorBudgetByRegla {
  pia: number;
  pim: number;
  devengado: number;
  entidades: number;
}

export interface SectorBudgetAggregate {
  metaDepartamento: SectorBudgetByRegla;
  sedeEjecutora: SectorBudgetByRegla;
  /** Peor estado de cobertura entre entidades (para badge de cabecera). */
  cobertura: Cobertura;
  /** Corte más reciente entre `cortesUsados` de todas las entidades, o "—". */
  corte: string;
  regla: string;
  matcher: string;
}

const COBERTURA_RANK: Record<Cobertura | "NO_VERIFICADA", number> = {
  COMPLETA: 0,
  NO_APLICA: 1,
  PARCIAL: 2,
  NO_VERIFICADA: 3,
  BLOQUEADA: 4,
};

function money(value: number): number {
  return Math.round(value * 100) / 100;
}

function sumRegla(entidades: SectorFichaEntidad[], regla: SectorFichaEntidad["reglaTerritorial"]): SectorBudgetByRegla {
  const rows = entidades.filter((row) => row.reglaTerritorial === regla);
  return {
    pia: money(rows.reduce((acc, row) => acc + row.pia, 0)),
    pim: money(rows.reduce((acc, row) => acc + row.pim, 0)),
    devengado: money(rows.reduce((acc, row) => acc + row.devengado, 0)),
    entidades: rows.length,
  };
}

function worstCobertura(entidades: SectorFichaEntidad[]): Cobertura {
  let worst: Cobertura | "NO_VERIFICADA" = "COMPLETA";
  for (const row of entidades) {
    const estado = row.cobertura.estado;
    const rankKey = estado === "NO_VERIFICADA" ? "NO_VERIFICADA" : estado;
    if (COBERTURA_RANK[rankKey] > COBERTURA_RANK[worst]) {
      worst = rankKey;
    }
  }
  if (worst === "NO_VERIFICADA") return "BLOQUEADA";
  return worst;
}

function latestCorte(entidades: SectorFichaEntidad[]): string {
  const fechas = entidades.flatMap((row) => row.cortesUsados).filter(Boolean);
  if (fechas.length === 0) {
    const fromSnapshot = entidades
      .map((row) => row.cobertura.fechaCorteParticion)
      .filter((value): value is string => Boolean(value));
    if (fromSnapshot.length === 0) return "—";
    return fromSnapshot.sort().at(-1) ?? "—";
  }
  return fechas.sort().at(-1) ?? "—";
}

/**
 * Agrega presupuesto por regla territorial — no mezcla META_DEPARTAMENTO y
 * SEDE_EJECUTORA en un solo total sin desglose (GORE-01a).
 */
export function aggregateSectorBudget(entidades: SectorFichaEntidad[]): SectorBudgetAggregate {
  return {
    metaDepartamento: sumRegla(entidades, "META_DEPARTAMENTO"),
    sedeEjecutora: sumRegla(entidades, "SEDE_EJECUTORA"),
    cobertura: worstCobertura(entidades),
    corte: latestCorte(entidades),
    regla: "PIA/PIM/Devengado agregados por sector, año fiscal y regla territorial.",
    matcher: "exacto-funcion",
  };
}

/** Normaliza `obras` cuando la API devuelve el objeto con `estado` + `resultados`. */
export function normalizeSectorObras(
  obras: SectorFichaResponse["obras"],
): { estado: string; resultados: SectorFichaObra[] } {
  if (Array.isArray(obras)) {
    return { estado: "CUI_EXACTO", resultados: obras };
  }
  return obras;
}

export function summarizeSectorObras(resultados: SectorFichaObra[]) {
  const paralizadas = resultados.filter((row) => row.existeParalizacion).length;
  const conGapAlto = resultados.filter(
    (row) =>
      row.gapFisicoFinanciero != null &&
      Math.abs(row.gapFisicoFinanciero) > GAP_FISICO_FINANCIERO_UMBRAL_PP,
  ).length;
  return { total: resultados.length, paralizadas, conGapAlto };
}
