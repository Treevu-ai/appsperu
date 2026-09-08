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
  /** Nivel de gobierno, provincia y distrito de la entidad (derivados de
   * `entities.ubigeo` -> `territories` en la capa de rutas) — pass-through,
   * no se calculan acá. `null` explícito si `ubigeo` no resuelve; nunca se
   * infiere un valor. */
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
  componentesUsados: number;
  componentes: {
    ejecucion: ComponentScore;
    obrasNoParalizadas: ComponentScore;
    inversionesSinSobrecosto: ComponentScore;
    comprasNoConcentradas: ComponentScore;
    saludTributariaProveedores: ComponentScore;
  };
  /** Posición dentro de las entidades de su mismo nivel de gobierno con score
   * disponible (ej. "3° de 85 Gobiernos Locales") — se calcula en score.ts
   * sobre el conjunto completo de resultados, no acá; queda `null` hasta que
   * score.ts lo rellena, y se mantiene `null` si la entidad no tiene score. */
  rankingEnNivelGobierno: { posicion: number; total: number } | null;
}

function pct(numerator: number, denominator: number): number | null {
  if (denominator <= 0) return null;
  return Math.round((numerator / denominator) * 1000) / 10; // 1 decimal
}

export function computeEntityScore(input: EntityScoreInputs): EntityScore {
  // PIM=0 (a diferencia de PIM=null) significa que la entidad SÍ tiene fila de
  // ejecución, pero sin presupuesto modificado registrado en la fuente — un
  // vacío de dato, no un 0% de avance real. pct() ya devuelve null cuando el
  // denominador es <=0; antes de este fix, `?? 0` convertía ese null en un 0
  // literal marcado como `disponible: true`, violando la regla del propio
  // archivo de nunca imputar 0 ni 100 por ausencia de dato (SI-08, hallazgo
  // 2026-09-08 — ver docs/TICKETS_Score_Institucional_Granular_v1.md).
  const ejecucionScore: ComponentScore =
    input.ejecucion && input.ejecucion.pim > 0
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
    nivelGobierno: input.nivelGobierno,
    provincia: input.provincia,
    distrito: input.distrito,
    scoreCompuesto,
    componentesUsados: disponibles.length,
    componentes,
    rankingEnNivelGobierno: null,
  };
}
