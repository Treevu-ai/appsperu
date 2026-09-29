/**
 * Score de salud institucional — copiado tal cual desde
 * apps/salud-institucional/api/src/score/compute.ts (sin dependencias de
 * runtime, solo lógica pura). Combina 5 señales ya cruzadas y probadas en
 * vivo en las otras apps del proyecto (ver docs/data-contracts/
 * salud-institucional-score.md). Cada componente es independiente: si una
 * fuente no tiene dato para una entidad (ej. sin obras registradas en
 * INFOBRAS), ese componente se omite del promedio — nunca se asume 0 ni 100.
 * Promedio simple entre componentes disponibles, no ponderado.
 */

export interface EjecucionInput {
  pim: number;
  devengado: number;
}

export interface ObrasInput {
  total: number;
  paralizadas: number;
  distritoSospechoso: number;
}

export interface InversionesInput {
  total: number;
  conSobrecosto: number;
}

export interface ComprasInput {
  totalAdjudicado: number;
  maxProveedorAdjudicado: number;
}

export interface FiscalInput {
  evaluables: number;
  regulares: number;
}

export interface EntityScoreInputs {
  entityCode: string;
  nombre: string;
  nivelGobierno: string | null;
  provincia: string | null;
  distrito: string | null;
  ejecucion: EjecucionInput | null;
  obras: ObrasInput | null;
  inversiones: InversionesInput | null;
  compras: ComprasInput | null;
  fiscal: FiscalInput | null;
}

export interface ComponentScore {
  valor: number | null;
  disponible: boolean;
}

export interface EntityScore {
  entityCode: string;
  nombre: string;
  nivelGobierno: string | null;
  provincia: string | null;
  distrito: string | null;
  scoreCompuesto: number | null;
  banda: Banda | null;
  componentesUsados: number;
  componentes: {
    ejecucion: ComponentScore;
    obrasNoParalizadas: ComponentScore;
    inversionesSinSobrecosto: ComponentScore;
    comprasNoConcentradas: ComponentScore;
    saludTributariaProveedores: ComponentScore;
  };
  rankingEnNivelGobierno: { posicion: number; total: number } | null;
  advertencias: {
    obrasConDistritoSospechoso: number | null;
  };
}

function pct(numerator: number, denominator: number): number | null {
  if (denominator <= 0) return null;
  return Math.round((numerator / denominator) * 1000) / 10;
}

export type Banda = "Sobresaliente" | "Alto" | "Medio" | "Bajo" | "Crítico";

const BANDA_THRESHOLDS: ReadonlyArray<{ min: number; banda: Banda }> = [
  { min: 72.3, banda: "Sobresaliente" },
  { min: 67.9, banda: "Alto" },
  { min: 55.8, banda: "Medio" },
  { min: 45.9, banda: "Bajo" },
  { min: -Infinity, banda: "Crítico" },
];

function bandaDe(scoreCompuesto: number | null): Banda | null {
  if (scoreCompuesto === null) return null;
  for (const { min, banda } of BANDA_THRESHOLDS) {
    if (scoreCompuesto >= min) return banda;
  }
  return "Crítico";
}

export function computeEntityScore(input: EntityScoreInputs): EntityScore {
  const ejecucionScore: ComponentScore =
    input.ejecucion && input.ejecucion.pim > 0
      ? { valor: Math.min(100, pct(input.ejecucion.devengado, input.ejecucion.pim) ?? 0), disponible: true }
      : { valor: null, disponible: false };

  const obrasScore: ComponentScore = input.obras
    ? { valor: pct(input.obras.total - input.obras.paralizadas, input.obras.total), disponible: true }
    : { valor: null, disponible: false };

  const inversionesScore: ComponentScore = input.inversiones
    ? { valor: pct(input.inversiones.total - input.inversiones.conSobrecosto, input.inversiones.total), disponible: true }
    : { valor: null, disponible: false };

  const comprasScore: ComponentScore = input.compras
    ? { valor: pct(input.compras.totalAdjudicado - input.compras.maxProveedorAdjudicado, input.compras.totalAdjudicado), disponible: true }
    : { valor: null, disponible: false };

  const fiscalScore: ComponentScore = input.fiscal
    ? { valor: pct(input.fiscal.regulares, input.fiscal.evaluables), disponible: true }
    : { valor: null, disponible: false };

  const componentes = {
    ejecucion: ejecucionScore,
    obrasNoParalizadas: obrasScore,
    inversionesSinSobrecosto: inversionesScore,
    comprasNoConcentradas: comprasScore,
    saludTributariaProveedores: fiscalScore,
  };

  const disponibles = Object.values(componentes).filter((c): c is ComponentScore & { valor: number } => c.valor !== null);

  const scoreCompuesto =
    disponibles.length === 0 ? null : Math.round((disponibles.reduce((sum, c) => sum + c.valor, 0) / disponibles.length) * 10) / 10;

  return {
    entityCode: input.entityCode,
    nombre: input.nombre,
    nivelGobierno: input.nivelGobierno,
    provincia: input.provincia,
    distrito: input.distrito,
    scoreCompuesto,
    banda: bandaDe(scoreCompuesto),
    componentesUsados: disponibles.length,
    componentes,
    rankingEnNivelGobierno: null,
    advertencias: {
      obrasConDistritoSospechoso: input.obras ? input.obras.distritoSospechoso : null,
    },
  };
}
