export type BudgetMovementRow = {
  sectorId: string;
  sector: string;
  entidad: string;
  reglaTerritorial: "META_DEPARTAMENTO" | "SEDE_EJECUTORA";
  pia: number;
  pim: number;
  devengado: number;
  cortesUsados: string[];
};

type Universe = "NACIONAL_DIRIGIDO" | "REGIONAL_EJECUTADO";

function round(value: number): number { return Math.round(value * 100) / 100; }
function soles(value: number): string { return new Intl.NumberFormat("es-PE", { style: "currency", currency: "PEN", maximumFractionDigits: 0 }).format(value); }
function universeOf(row: BudgetMovementRow): Universe { return row.reglaTerritorial === "META_DEPARTAMENTO" ? "NACIONAL_DIRIGIDO" : "REGIONAL_EJECUTADO"; }
function label(universe: Universe): string { return universe === "NACIONAL_DIRIGIDO" ? "Gobierno Nacional dirigido a La Libertad" : "Gobierno Regional La Libertad ejecutado por sus unidades"; }

export function summarizeBudgetMovement(rows: BudgetMovementRow[]) {
  const groups = new Map<Universe, BudgetMovementRow[]>();
  for (const row of rows) {
    const universe = universeOf(row);
    groups.set(universe, [...(groups.get(universe) ?? []), row]);
  }

  const universes = (["NACIONAL_DIRIGIDO", "REGIONAL_EJECUTADO"] as const).map((universe) => {
    const members = groups.get(universe) ?? [];
    const pia = round(members.reduce((sum, row) => sum + row.pia, 0));
    const pim = round(members.reduce((sum, row) => sum + row.pim, 0));
    const devengado = round(members.reduce((sum, row) => sum + row.devengado, 0));
    const avancePct = pim > 0 ? round((devengado / pim) * 100) : null;
    const variacionPimPia = round(pim - pia);
    const topEntidades = [...members].sort((a, b) => b.pim - a.pim || a.entidad.localeCompare(b.entidad)).slice(0, 3)
      .map((row) => ({ sectorId: row.sectorId, sector: row.sector, entidad: row.entidad, pim: row.pim, devengado: row.devengado, avancePct: row.pim > 0 ? round((row.devengado / row.pim) * 100) : null }));
    return { universo: universe, etiqueta: label(universe), entidades: members.length, pia, pim, devengado, avancePct, variacionPimPia, topEntidades };
  }).filter((item) => item.entidades > 0);

  const bySector = new Map<string, BudgetMovementRow[]>();
  for (const row of rows) bySector.set(`${row.sectorId}:${universeOf(row)}`, [...(bySector.get(`${row.sectorId}:${universeOf(row)}`) ?? []), row]);
  const sectores = [...bySector.values()].map((members) => {
    const first = members[0]; const pim = round(members.reduce((sum, row) => sum + row.pim, 0)); const devengado = round(members.reduce((sum, row) => sum + row.devengado, 0));
    return { sectorId: first.sectorId, sector: first.sector, universo: universeOf(first), pim, devengado, avancePct: pim > 0 ? round((devengado / pim) * 100) : null };
  }).sort((a, b) => b.pim - a.pim || a.sector.localeCompare(b.sector));

  const narrativa = universes.map((item) => {
    const movement = item.variacionPimPia === 0 ? "se mantuvo igual al PIA" : item.variacionPimPia > 0 ? `aumentó ${soles(item.variacionPimPia)} frente al PIA` : `disminuyó ${soles(Math.abs(item.variacionPimPia))} frente al PIA`;
    const execution = item.avancePct === null ? "no tiene PIM publicado para calcular avance" : `ha devengado ${soles(item.devengado)} (${item.avancePct}% del PIM)`;
    return `${item.etiqueta}: ${item.entidades} entidades verificadas registran ${soles(item.pim)} de PIM; ${movement} y ${execution}.`;
  });

  return {
    universos: universes,
    sectores,
    narrativa,
    limitacion: "Describe presupuesto y devengado registrados en el alcance materializado. Devengado no equivale necesariamente a pago, avance físico, beneficio entregado ni calidad del gasto; los universos nacional y regional no se suman como una sola bolsa.",
  };
}
