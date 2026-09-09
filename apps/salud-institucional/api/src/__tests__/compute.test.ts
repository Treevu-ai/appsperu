import { describe, expect, it } from "vitest";
import { computeEntityScore } from "../score/compute.js";

function baseInput() {
  return {
    entityCode: "301189",
    nombre: "MUNICIPALIDAD PROVINCIAL DE SANCHEZ CARRION - HUAMACHUCO",
    nivelGobierno: "GOBIERNOS LOCALES",
    provincia: "SANCHEZ CARRION",
    distrito: "HUAMACHUCO",
    ejecucion: null,
    obras: null,
    inversiones: null,
    compras: null,
    fiscal: null,
  };
}

describe("computeEntityScore", () => {
  it("devuelve null cuando ninguna fuente tiene dato — nunca asume 0", () => {
    const result = computeEntityScore(baseInput());
    expect(result.scoreCompuesto).toBeNull();
    expect(result.componentesUsados).toBe(0);
  });

  it("calcula un componente aislado correctamente (ejecución 50%)", () => {
    const result = computeEntityScore({ ...baseInput(), ejecucion: { pim: 100, devengado: 50 } });
    expect(result.componentes.ejecucion.valor).toBe(50);
    expect(result.scoreCompuesto).toBe(50);
    expect(result.componentesUsados).toBe(1);
  });

  it("cap la ejecución en 100 aunque el devengado exceda el PIM (dato real posible)", () => {
    const result = computeEntityScore({ ...baseInput(), ejecucion: { pim: 100, devengado: 120 } });
    expect(result.componentes.ejecucion.valor).toBe(100);
  });

  it("PIM=0 (SI-08): no imputa 0 en ejecución cuando hay fila pero sin presupuesto registrado", () => {
    // Caso real: Municipalidad Provincial de Trujillo, PIM=0 en sus 27 filas de
    // ejecución 2026 pero S/116.3M de devengado real (ver docs/TICKETS_Score_Institucional_Granular_v1.md, SI-08).
    const result = computeEntityScore({ ...baseInput(), ejecucion: { pim: 0, devengado: 116313632.14 } });
    expect(result.componentes.ejecucion.disponible).toBe(false);
    expect(result.componentes.ejecucion.valor).toBeNull();
    expect(result.componentesUsados).toBe(0);
    expect(result.scoreCompuesto).toBeNull();
  });

  it("PIM=0 no contamina el promedio cuando hay otros componentes disponibles", () => {
    const result = computeEntityScore({
      ...baseInput(),
      ejecucion: { pim: 0, devengado: 5000000 },
      obras: { total: 10, paralizadas: 0, distritoSospechoso: 0 }, // 100
    });
    expect(result.componentes.ejecucion.disponible).toBe(false);
    expect(result.componentesUsados).toBe(1);
    expect(result.scoreCompuesto).toBe(100); // solo obras entra al promedio, no un 0 falso de ejecución
  });

  it("promedia solo los componentes disponibles, no todos los posibles", () => {
    const result = computeEntityScore({
      ...baseInput(),
      ejecucion: { pim: 100, devengado: 100 }, // 100
      obras: { total: 10, paralizadas: 5, distritoSospechoso: 0 }, // 50
    });
    expect(result.componentesUsados).toBe(2);
    expect(result.scoreCompuesto).toBe(75); // (100+50)/2
  });

  it("caso real: obras sin ninguna paralizada da 100 en ese componente", () => {
    const result = computeEntityScore({ ...baseInput(), obras: { total: 92, paralizadas: 8, distritoSospechoso: 0 } });
    // Sánchez Carrión real: 92 obras, 8 paralizadas (ver docs/analisis-la-libertad-2026-08.md)
    expect(result.componentes.obrasNoParalizadas.valor).toBeCloseTo(91.3, 1);
  });

  it("no divide por cero cuando el denominador es 0 — devuelve componente no disponible", () => {
    const result = computeEntityScore({ ...baseInput(), inversiones: { total: 0, conSobrecosto: 0 } });
    expect(result.componentes.inversionesSinSobrecosto.valor).toBeNull();
    expect(result.componentesUsados).toBe(0);
  });

  it("advertencia de distrito sospechoso (DQ-14) no afecta el score, solo se reporta aparte", () => {
    const result = computeEntityScore({
      ...baseInput(),
      obras: { total: 10, paralizadas: 0, distritoSospechoso: 3 },
    });
    expect(result.componentes.obrasNoParalizadas.valor).toBe(100); // el componente ignora distritoSospechoso
    expect(result.advertencias.obrasConDistritoSospechoso).toBe(3);
  });

  it("advertencia de distrito sospechoso es null, no 0, cuando no hay obras para la entidad", () => {
    const result = computeEntityScore(baseInput());
    expect(result.advertencias.obrasConDistritoSospechoso).toBeNull();
  });

  it("concentración de compras: un solo proveedor con todo el monto da score 0 (máxima concentración)", () => {
    const result = computeEntityScore({
      ...baseInput(),
      compras: { totalAdjudicado: 1000, maxProveedorAdjudicado: 1000 },
    });
    expect(result.componentes.comprasNoConcentradas.valor).toBe(0);
  });

  it("salud tributaria: todos los proveedores evaluables regulares da 100", () => {
    const result = computeEntityScore({ ...baseInput(), fiscal: { evaluables: 4, regulares: 4 } });
    expect(result.componentes.saludTributariaProveedores.valor).toBe(100);
  });

  it("expone nivelGobierno/provincia/distrito tal cual el input, sin transformarlos", () => {
    const result = computeEntityScore(baseInput());
    expect(result.nivelGobierno).toBe("GOBIERNOS LOCALES");
    expect(result.provincia).toBe("SANCHEZ CARRION");
    expect(result.distrito).toBe("HUAMACHUCO");
  });

  it("no inventa provincia/distrito cuando el input no los trae", () => {
    const result = computeEntityScore({ ...baseInput(), provincia: null, distrito: null });
    expect(result.provincia).toBeNull();
    expect(result.distrito).toBeNull();
  });

  it("rankingEnNivelGobierno queda null hasta que score.ts lo calcula sobre el conjunto completo", () => {
    const result = computeEntityScore(baseInput());
    expect(result.rankingEnNivelGobierno).toBeNull();
  });
});

describe("bandaDe (SI-04)", () => {
  function withEjecucion(pim: number, devengado: number) {
    return computeEntityScore({ ...baseInput(), ejecucion: { pim, devengado } });
  }

  it("scoreCompuesto: null recibe banda: null, nunca una banda por defecto", () => {
    expect(computeEntityScore(baseInput()).banda).toBeNull();
  });

  it("justo en el umbral de Sobresaliente (72.3, p90) cae en Sobresaliente", () => {
    expect(withEjecucion(1000, 723).scoreCompuesto).toBe(72.3);
    expect(withEjecucion(1000, 723).banda).toBe("Sobresaliente");
  });

  it("justo debajo del umbral de Sobresaliente cae en Alto", () => {
    expect(withEjecucion(1000, 722).scoreCompuesto).toBe(72.2);
    expect(withEjecucion(1000, 722).banda).toBe("Alto");
  });

  it("justo en el umbral de Alto (67.9, p75) cae en Alto", () => {
    expect(withEjecucion(1000, 679).banda).toBe("Alto");
  });

  it("justo debajo del umbral de Alto cae en Medio", () => {
    expect(withEjecucion(1000, 678).banda).toBe("Medio");
  });

  it("justo en el umbral de Medio (55.8, p25) cae en Medio", () => {
    expect(withEjecucion(1000, 558).banda).toBe("Medio");
  });

  it("justo debajo del umbral de Medio cae en Bajo", () => {
    expect(withEjecucion(1000, 557).banda).toBe("Bajo");
  });

  it("justo en el umbral de Bajo (45.9, p10) cae en Bajo", () => {
    expect(withEjecucion(1000, 459).banda).toBe("Bajo");
  });

  it("justo debajo del umbral de Bajo cae en Crítico", () => {
    expect(withEjecucion(1000, 458).banda).toBe("Crítico");
  });

  it("un score de 0 cae en Crítico, no queda sin clasificar", () => {
    expect(withEjecucion(1000, 0).banda).toBe("Crítico");
  });

  it("el máximo posible (100) cae en Sobresaliente", () => {
    expect(withEjecucion(1000, 1000).banda).toBe("Sobresaliente");
  });
});
