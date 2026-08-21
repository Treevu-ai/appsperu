/**
 * Score de salud institucional — combina 5 señales ya cruzadas y probadas en
 * vivo en las otras apps del proyecto (ver docs/data-contracts/
 * salud-institucional-score.md). Cada componente es independiente: si una
 * fuente no tiene dato para una entidad (ej. sin obras registradas en
 * INFOBRAS), ese componente se omite del promedio — nunca se asume 0 ni 100.
 * Promedio simple entre componentes disponibles, no ponderado — una entidad
 * con menos fuentes disponibles no queda en desventaja automática, pero su
 * score trae explícito cuántos componentes lo sostienen (`componentesUsados`).
 */

export interface EjecucionInput {
  pim: number;
  devengado: number;
}

export interface ObrasInput {
  total: number;
  paralizadas: number;
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
  scoreCompuesto: number | null;
  componentesUsados: number;
  componentes: {
    ejecucion: ComponentScore;
    obrasNoParalizadas: ComponentScore;
    inversionesSinSobrecosto: ComponentScore;
    comprasNoConcentradas: ComponentScore;
    saludTributariaProveedores: ComponentScore;
  };
}

function pct(numerator: number, denominator: number): number | null {
  if (denominator <= 0) return null;
  return Math.round((numerator / denominator) * 1000) / 10; // 1 decimal
}

export function computeEntityScore(input: EntityScoreInputs): EntityScore {
  const ejecucionScore: ComponentScore = input.ejecucion
    ? { valor: Math.min(100, pct(input.ejecucion.devengado, input.ejecucion.pim) ?? 0), disponible: true }
    : { valor: null, disponible: false };

  const obrasScore: ComponentScore = input.obras
    ? { valor: pct(input.obras.total - input.obras.paralizadas, input.obras.total), disponible: true }
    : { valor: null, disponible: false };

  const inversionesScore: ComponentScore = input.inversiones
    ? {
        valor: pct(input.inversiones.total - input.inversiones.conSobrecosto, input.inversiones.total),
        disponible: true,
      }
    : { valor: null, disponible: false };

  const comprasScore: ComponentScore = input.compras
    ? {
        valor: pct(
          input.compras.totalAdjudicado - input.compras.maxProveedorAdjudicado,
          input.compras.totalAdjudicado
        ),
        disponible: true,
      }
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

  const disponibles = Object.values(componentes).filter(
    (c): c is ComponentScore & { valor: number } => c.valor !== null
  );

  const scoreCompuesto =
    disponibles.length === 0
      ? null
      : Math.round((disponibles.reduce((sum, c) => sum + c.valor, 0) / disponibles.length) * 10) / 10;

  return {
    entityCode: input.entityCode,
    nombre: input.nombre,
    scoreCompuesto,
    componentesUsados: disponibles.length,
    componentes,
  };
}
