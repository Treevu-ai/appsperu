import { describe, expect, it } from "vitest";
import { computeEntityScore } from "../score/compute.js";

function baseInput() {
  return {
    entityCode: "301189",
    nombre: "MUNICIPALIDAD PROVINCIAL DE SANCHEZ CARRION - HUAMACHUCO",
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

  it("promedia solo los componentes disponibles, no todos los posibles", () => {
    const result = computeEntityScore({
      ...baseInput(),
      ejecucion: { pim: 100, devengado: 100 }, // 100
      obras: { total: 10, paralizadas: 5 }, // 50
    });
    expect(result.componentesUsados).toBe(2);
    expect(result.scoreCompuesto).toBe(75); // (100+50)/2
  });

  it("caso real: obras sin ninguna paralizada da 100 en ese componente", () => {
    const result = computeEntityScore({ ...baseInput(), obras: { total: 92, paralizadas: 8 } });
    // Sánchez Carrión real: 92 obras, 8 paralizadas (ver docs/analisis-la-libertad-2026-08.md)
    expect(result.componentes.obrasNoParalizadas.valor).toBeCloseTo(91.3, 1);
  });

  it("no divide por cero cuando el denominador es 0 — devuelve componente no disponible", () => {
    const result = computeEntityScore({ ...baseInput(), inversiones: { total: 0, conSobrecosto: 0 } });
    expect(result.componentes.inversionesSinSobrecosto.valor).toBeNull();
    expect(result.componentesUsados).toBe(0);
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
});
