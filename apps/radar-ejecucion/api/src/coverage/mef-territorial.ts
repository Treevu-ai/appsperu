import { canClaimCoverage, type CoverageState } from "./states.js";

export interface MefBudgetSnapshot {
  origenCobertura: "SEDE_EJECUTORA" | "META_DEPARTAMENTO";
  departamento: string;
  nivelGobierno: string;
  fechaCorte: string;
  lotes: readonly number[];
  registros: number;
}

export interface MefTerritorialCoverageRow {
  appName: "radar-ejecucion";
  sourceName: "MEF_GR_SEDE_EJECUTORA" | "MEF_GL_SEDE_EJECUTORA" | "MEF_GN_META_DEPARTAMENTO";
  departamento: string;
  requested: true;
  sourceRecords: number;
  persistedRecords: number;
  rejectedRecords: 0;
  completeness: CoverageState;
  sourceBatchRef: string | null;
  cutoffAt: string | null;
  restriction: string;
  coverageClaimable: boolean;
}

const SOURCES = [
  {
    sourceName: "MEF_GR_SEDE_EJECUTORA",
    origenCobertura: "SEDE_EJECUTORA",
    nivelGobierno: "GOBIERNOS REGIONALES",
    restriction:
      "Offsets HTTP Range observados para La Libertad en 2026-Gasto-Mensual.csv (GR, MES_EJE 0-7). No se afirma otra región ni el archivo nacional completo.",
  },
  {
    sourceName: "MEF_GL_SEDE_EJECUTORA",
    origenCobertura: "SEDE_EJECUTORA",
    nivelGobierno: "GOBIERNOS LOCALES",
    restriction:
      "Offsets HTTP Range observados para La Libertad en 2026-Gasto-Mensual.csv (GL, MES_EJE 0-7). No se afirma otra región ni el archivo nacional completo.",
  },
  {
    sourceName: "MEF_GN_META_DEPARTAMENTO",
    origenCobertura: "META_DEPARTAMENTO",
    nivelGobierno: "GOBIERNO NACIONAL",
    restriction:
      "Gobierno Nacional filtrado por DEPARTAMENTO_META. Completa en el alcance de las 8 secciones mensuales materializadas; no certifica el universo MEF ni otras regiones. Un lote cacheado no equivale a una recrawl en vivo del CSV.",
  },
] as const;

function matchSnapshot(snapshots: readonly MefBudgetSnapshot[], departamento: string, origen: string, nivel: string): MefBudgetSnapshot | undefined {
  const wanted = departamento.toUpperCase().trim();
  return snapshots.find(
    (row) =>
      row.departamento.toUpperCase().trim() === wanted &&
      row.origenCobertura === origen &&
      row.nivelGobierno === nivel
  );
}

function blockedRow(
  sourceName: MefTerritorialCoverageRow["sourceName"],
  departamento: string,
  restriction: string
): MefTerritorialCoverageRow {
  return {
    appName: "radar-ejecucion",
    sourceName,
    departamento,
    requested: true,
    sourceRecords: 0,
    persistedRecords: 0,
    rejectedRecords: 0,
    completeness: "BLOQUEADA",
    sourceBatchRef: null,
    cutoffAt: null,
    restriction,
    coverageClaimable: false,
  };
}

export function coverageRowsFromMefSnapshots(input: {
  departamento: string;
  snapshots: readonly MefBudgetSnapshot[];
}): MefTerritorialCoverageRow[] {
  const departamento = input.departamento.toUpperCase().trim();
  return SOURCES.map((source) => {
    const snapshot = matchSnapshot(input.snapshots, departamento, source.origenCobertura, source.nivelGobierno);
    if (!snapshot || snapshot.lotes.length === 0 || !snapshot.fechaCorte) {
      return blockedRow(source.sourceName, departamento, source.restriction);
    }
    const persisted = snapshot.registros;
    const completeness: CoverageState = persisted === 0 ? "SIN_DATOS_EN_FUENTE" : "COMPLETA_VERIFICADA";
    const sourceBatchRef = `mef:${source.sourceName}:${snapshot.lotes.join(",")}:${snapshot.fechaCorte.slice(0, 10)}`;
    const cutoffAt = snapshot.fechaCorte;
    return {
      appName: "radar-ejecucion",
      sourceName: source.sourceName,
      departamento,
      requested: true,
      sourceRecords: persisted,
      persistedRecords: persisted,
      rejectedRecords: 0,
      completeness,
      sourceBatchRef,
      cutoffAt,
      restriction: source.restriction,
      coverageClaimable: canClaimCoverage({
        state: completeness,
        batch: sourceBatchRef,
        cutoff: cutoffAt,
        persisted,
      }),
    };
  });
}
