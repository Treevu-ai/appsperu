import { describe, expect, it } from "vitest";
import {
  aggregateSectorBudget,
  summarizeSectorObras,
  type SectorFichaEntidad,
  type SectorFichaObra,
} from "../sector-ficha.js";

function entidad(
  regla: SectorFichaEntidad["reglaTerritorial"],
  pia: number,
  pim: number,
  devengado: number,
  cobertura: SectorFichaEntidad["cobertura"]["estado"] = "COMPLETA",
): SectorFichaEntidad {
  return {
    sectorId: "TRANSPORTE",
    sector: "Transporte",
    entityCode: regla === "META_DEPARTAMENTO" ? "108" : "831",
    entidad: regla === "META_DEPARTAMENTO" ? "MTC" : "GR Transporte LL",
    tipoEntidad: "PLIEGO",
    nivelGobierno: regla === "META_DEPARTAMENTO" ? "GOBIERNO NACIONAL" : "GOBIERNOS REGIONALES",
    reglaTerritorial: regla,
    alcance: regla,
    pia,
    pim,
    devengado,
    saldoPorDevengar: pim - devengado,
    cobertura: { estado: cobertura, fechaCorteParticion: "2026-08-20", registrosParticion: 10 },
    cortesUsados: ["2026-08-20"],
    recursos: ["R1"],
  };
}

describe("aggregateSectorBudget", () => {
  it("suma por regla territorial sin mezclar GN dirigido y GR por sede", () => {
    const agg = aggregateSectorBudget([
      entidad("META_DEPARTAMENTO", 10_000_000, 12_000_000, 6_000_000),
      entidad("SEDE_EJECUTORA", 2_500_000, 6_300_000, 3_100_000),
    ]);

    expect(agg.metaDepartamento).toEqual({
      pia: 10_000_000,
      pim: 12_000_000,
      devengado: 6_000_000,
      entidades: 1,
    });
    expect(agg.sedeEjecutora).toEqual({
      pia: 2_500_000,
      pim: 6_300_000,
      devengado: 3_100_000,
      entidades: 1,
    });
    expect(agg.metaDepartamento.pim + agg.sedeEjecutora.pim).toBe(18_300_000);
  });

  it("elige la peor cobertura entre entidades", () => {
    const agg = aggregateSectorBudget([
      entidad("META_DEPARTAMENTO", 1, 1, 1, "COMPLETA"),
      entidad("SEDE_EJECUTORA", 1, 1, 1, "PARCIAL"),
    ]);
    expect(agg.cobertura).toBe("PARCIAL");
  });

  it("devuelve ceros en una regla sin entidades", () => {
    const agg = aggregateSectorBudget([entidad("SEDE_EJECUTORA", 100, 200, 50)]);
    expect(agg.metaDepartamento.entidades).toBe(0);
    expect(agg.metaDepartamento.pim).toBe(0);
    expect(agg.sedeEjecutora.entidades).toBe(1);
  });
});

describe("summarizeSectorObras", () => {
  const obra = (overrides: Partial<SectorFichaObra>): SectorFichaObra => ({
    codigoInfobras: "INF-1",
    cui: "123",
    nombre: "Obra",
    estadoEjecucion: "EN EJECUCION",
    departamento: "LA LIBERTAD",
    provincia: null,
    distrito: null,
    avanceFisicoRealPct: 50,
    ejecucionFinancieraPct: 40,
    existeParalizacion: false,
    diasParalizado: null,
    fechaParalizacion: null,
    costDriftPct: null,
    gapFisicoFinanciero: 10,
    ...overrides,
  });

  it("cuenta paralizadas y gap por encima del umbral", () => {
    const resumen = summarizeSectorObras([
      obra({ existeParalizacion: true, gapFisicoFinanciero: 35 }),
      obra({ gapFisicoFinanciero: 5 }),
    ]);
    expect(resumen).toEqual({ total: 2, paralizadas: 1, conGapAlto: 1 });
  });
});
