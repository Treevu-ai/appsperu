import { describe, expect, it, vi, beforeEach } from "vitest";

const comprasQueryMock = vi.fn();
const sancionesQueryMock = vi.fn();
const releaseMock = vi.fn();
const onMock = vi.fn();
const connectMock = vi.fn(() => Promise.resolve({ query: comprasQueryMock, release: releaseMock, on: onMock }));

vi.mock("../db/pool.js", () => ({
  pool: { query: comprasQueryMock },
  connectSafe: connectMock,
}));

vi.mock("../db/sanciones-pool.js", () => ({
  sancionesPool: { query: sancionesQueryMock, end: vi.fn() },
}));

const { calcularYPersistirIIC } = await import("../ingest/calcular-iic.js");

function awardRow(overrides: Record<string, unknown> = {}) {
  return {
    award_id: "A1",
    ocid: "ocds-1",
    buyer_id: "B1",
    buyer_name: "MUNICIPALIDAD TEST",
    supplier_id: "PE-RUC-20000000001",
    valor_monto: "10000",
    fecha: "2026-01-15",
    ...overrides,
  };
}

beforeEach(() => {
  comprasQueryMock.mockReset();
  sancionesQueryMock.mockReset();
  releaseMock.mockReset();
  onMock.mockReset();
  connectMock.mockClear();
  comprasQueryMock.mockImplementation(() => Promise.resolve({ rows: [] }));
  sancionesQueryMock.mockImplementation(() => Promise.resolve({ rows: [] }));
});

describe("calcularYPersistirIIC", () => {
  it("marca datos_insuficientes=true y NO asigna score a una entidad con menos de 5 adjudicaciones", async () => {
    comprasQueryMock.mockImplementation((sql: string) => {
      if (sql.includes("FROM awards")) {
        return Promise.resolve({
          rows: [awardRow(), awardRow({ award_id: "A2" }), awardRow({ award_id: "A3" })],
        });
      }
      return Promise.resolve({ rows: [] });
    });

    const resultado = await calcularYPersistirIIC();
    const entidad = resultado.find((r) => r.buyer_id === "B1");

    expect(entidad?.datos_insuficientes).toBe(true);
    expect(entidad?.score).toBeNull();
    expect(entidad?.notas).toMatch(/Menos de 5 adjudicaciones/);
  });

  it("calcula sub_indicador_a=peor (0) cuando el 100% del monto fue a un proveedor con inhabilitación vigente al adjudicar", async () => {
    const cincoAwards = Array.from({ length: 5 }, (_, i) => awardRow({ award_id: `A${i}`, fecha: "2026-03-10" }));
    comprasQueryMock.mockImplementation((sql: string) => {
      if (sql.includes("FROM awards")) return Promise.resolve({ rows: cincoAwards });
      return Promise.resolve({ rows: [] });
    });
    sancionesQueryMock.mockImplementation(() =>
      Promise.resolve({ rows: [{ ruc: "20000000001", desde: "2026-01-01", hasta: "2027-01-01" }] })
    );

    const resultado = await calcularYPersistirIIC();
    const entidad = resultado.find((r) => r.buyer_id === "B1");

    expect(entidad?.datos_insuficientes).toBe(false);
    // único proveedor, 100% sancionado al momento de adjudicar -> peor score posible en A
    expect(entidad?.sub_indicador_a).toBe(0);
  });

  it("NO cuenta como sancionado un award con RUC inhabilitado pero FUERA del rango de vigencia", async () => {
    const cincoAwards = Array.from({ length: 5 }, (_, i) => awardRow({ award_id: `A${i}`, fecha: "2020-01-01" }));
    comprasQueryMock.mockImplementation((sql: string) => {
      if (sql.includes("FROM awards")) return Promise.resolve({ rows: cincoAwards });
      return Promise.resolve({ rows: [] });
    });
    // inhabilitación vigente 2026-2027, pero el award es de 2020 -- no debe contar
    sancionesQueryMock.mockImplementation(() =>
      Promise.resolve({ rows: [{ ruc: "20000000001", desde: "2026-01-01", hasta: "2027-01-01" }] })
    );

    const resultado = await calcularYPersistirIIC();
    const entidad = resultado.find((r) => r.buyer_id === "B1");

    // único proveedor, sin sanción vigente en la fecha real -> mejor score en A (no 0)
    expect(entidad?.sub_indicador_a).toBeGreaterThan(0);
  });

  it("limpia el prefijo PE-RUC- antes de cruzar contra proveedores_sancionados", async () => {
    const cincoAwards = Array.from({ length: 5 }, (_, i) =>
      awardRow({ award_id: `A${i}`, supplier_id: "PE-RUC-20539700791", fecha: "2026-02-10" })
    );
    comprasQueryMock.mockImplementation((sql: string) => {
      if (sql.includes("FROM awards")) return Promise.resolve({ rows: cincoAwards });
      return Promise.resolve({ rows: [] });
    });
    sancionesQueryMock.mockImplementation(() =>
      Promise.resolve({ rows: [{ ruc: "20539700791", desde: "2026-01-01", hasta: "2027-01-01" }] })
    );

    const resultado = await calcularYPersistirIIC();
    const entidad = resultado.find((r) => r.buyer_id === "B1");

    expect(entidad?.sub_indicador_a).toBe(0); // si no limpiara el prefijo, nunca matchearía y daría el score más alto
  });

  it("deja sub_indicador_b en null (no en 0) cuando ningún ocid de la entidad tiene postores registrados", async () => {
    const cincoAwards = Array.from({ length: 5 }, (_, i) => awardRow({ award_id: `A${i}`, ocid: `ocds-${i}` }));
    comprasQueryMock.mockImplementation((sql: string) => {
      if (sql.includes("FROM awards")) return Promise.resolve({ rows: cincoAwards });
      if (sql.includes("FROM bidders")) return Promise.resolve({ rows: [] }); // sin postores registrados
      return Promise.resolve({ rows: [] });
    });

    const resultado = await calcularYPersistirIIC();
    const entidad = resultado.find((r) => r.buyer_id === "B1");

    expect(entidad?.sub_indicador_b).toBeNull();
    expect(entidad?.n_subindicadores).toBe(2); // solo A y C, no 3 -- no se promedia un null como si fuera 0
  });

  it("persiste con DELETE+INSERT por fecha_corte dentro de una transacción (BEGIN/COMMIT)", async () => {
    const cincoAwards = Array.from({ length: 5 }, (_, i) => awardRow({ award_id: `A${i}` }));
    comprasQueryMock.mockImplementation((sql: string) => {
      if (sql.includes("FROM awards")) return Promise.resolve({ rows: cincoAwards });
      return Promise.resolve({ rows: [] });
    });

    await calcularYPersistirIIC();

    const calls = comprasQueryMock.mock.calls.map(([sql]) => sql);
    expect(calls).toContain("BEGIN");
    expect(calls).toContain("COMMIT");
    expect(calls.some((sql: string) => sql.includes("DELETE FROM indice_integridad_contrataciones"))).toBe(true);
    expect(calls.some((sql: string) => sql.includes("INSERT INTO indice_integridad_contrataciones"))).toBe(true);
    expect(releaseMock).toHaveBeenCalled();
  });

  it("hace ROLLBACK si falla el INSERT", async () => {
    const cincoAwards = Array.from({ length: 5 }, (_, i) => awardRow({ award_id: `A${i}` }));
    comprasQueryMock.mockImplementation((sql: string) => {
      if (sql.includes("FROM awards")) return Promise.resolve({ rows: cincoAwards });
      if (sql.includes("INSERT INTO indice_integridad_contrataciones")) return Promise.reject(new Error("boom"));
      return Promise.resolve({ rows: [] });
    });

    await expect(calcularYPersistirIIC()).rejects.toThrow("boom");
    const calls = comprasQueryMock.mock.calls.map(([sql]) => sql);
    expect(calls).toContain("ROLLBACK");
  });

  // ---- limpiarRuc(): el identificador debe ser RUC de 11 dígitos ----

  it("NO trata como RUC un identificador de 7 dígitos, ni siquiera si coincidiera con una inhabilitación", async () => {
    const cincoAwards = Array.from({ length: 5 }, (_, i) =>
      awardRow({ award_id: `A${i}`, supplier_id: "PE-RUC-1573662", fecha: "2026-03-10" })
    );
    comprasQueryMock.mockImplementation((sql: string) => {
      if (sql.includes("FROM awards")) return Promise.resolve({ rows: cincoAwards });
      return Promise.resolve({ rows: [] });
    });
    // Inhabilitación cuyo "ruc" es de 7 dígitos: sin validación de longitud,
    // los 5 awards matchearían y sub_indicador_a saldría en 0 (el peor caso).
    sancionesQueryMock.mockImplementation(() =>
      Promise.resolve({ rows: [{ ruc: "1573662", desde: "2026-01-01", hasta: "2027-01-01" }] })
    );

    const resultado = await calcularYPersistirIIC();
    const entidad = resultado.find((r) => r.buyer_id === "B1");

    expect(entidad?.sub_indicador_a).toBeNull(); // sin RUC válido no se evalúa A
    expect(entidad?.n_adjudicaciones_con_ruc).toBe(0);
    expect(entidad?.cobertura_monto_ruc).toBe(0);
    expect(entidad?.notas).toMatch(/sub-indicador A sin dato/);
  });

  it("calcula sub-indicador A SOBRE EL MONTO CON RUC VÁLIDO, no sobre el monto total", async () => {
    // 4 awards con identificador que no es RUC (S/ 40,000) + 1 con RUC válido
    // y sanción vigente (S/ 10,000). Con el monto total como denominador A
    // saldría ~2 (casi el mejor caso); con el monto con RUC debe salir 0.
    const cuatroNoRuc = Array.from({ length: 4 }, (_, i) =>
      awardRow({ award_id: `NR${i}`, supplier_id: "PE-RUC-1573662", valor_monto: "10000" })
    );
    const unoConRuc = awardRow({ award_id: "R1", supplier_id: "PE-RUC-20000000001", valor_monto: "10000" });
    comprasQueryMock.mockImplementation((sql: string) => {
      if (sql.includes("FROM awards")) return Promise.resolve({ rows: [...cuatroNoRuc, unoConRuc] });
      return Promise.resolve({ rows: [] });
    });
    sancionesQueryMock.mockImplementation(() =>
      Promise.resolve({ rows: [{ ruc: "20000000001", desde: "2026-01-01", hasta: "2027-01-01" }] })
    );

    const resultado = await calcularYPersistirIIC();
    const entidad = resultado.find((r) => r.buyer_id === "B1");

    expect(entidad?.sub_indicador_a).toBe(0); // 100% del monto CON RUC está sancionado
    expect(entidad?.cobertura_monto_ruc).toBeCloseTo(0.2, 5); // 10,000 de 50,000
    expect(entidad?.n_adjudicaciones_con_ruc).toBe(1);
    expect(entidad?.notas).toMatch(/20\.0% del monto/); // la cobertura viaja en notas, no solo en la columna
  });

  it("promedio no diluye: con A sin dato, el score promedia solo B y C", async () => {
    // Todos los awards sin RUC válido -> A en null, igual que B lo está en otro test.
    const cincoAwards = Array.from({ length: 5 }, (_, i) =>
      awardRow({ award_id: `A${i}`, supplier_id: "PE-RUC-1573662", ocid: `ocds-${i}` })
    );
    comprasQueryMock.mockImplementation((sql: string) => {
      if (sql.includes("FROM awards")) return Promise.resolve({ rows: cincoAwards });
      if (sql.includes("FROM bidders")) return Promise.resolve({ rows: [{ ocid: "ocds-0", bidder_id: "x" }] });
      return Promise.resolve({ rows: [] });
    });

    const resultado = await calcularYPersistirIIC();
    const entidad = resultado.find((r) => r.buyer_id === "B1");

    expect(entidad?.sub_indicador_a).toBeNull();
    expect(entidad?.n_subindicadores).toBe(2); // B y C — no se promedia un null como 0
    expect(entidad?.score).not.toBeNull();
  });

  it("persiste escala y cobertura junto al score, y marca el corte como 'absoluta'", async () => {
    const cincoAwards = Array.from({ length: 5 }, (_, i) => awardRow({ award_id: `A${i}` }));
    comprasQueryMock.mockImplementation((sql: string) => {
      if (sql.includes("FROM awards")) return Promise.resolve({ rows: cincoAwards });
      return Promise.resolve({ rows: [] });
    });

    await calcularYPersistirIIC();

    const insert = comprasQueryMock.mock.calls.find(([sql]) =>
      sql.includes("INSERT INTO indice_integridad_contrataciones")
    );
    expect(insert?.[0]).toContain("escala");
    expect(insert?.[0]).toContain("cobertura_monto_ruc");
    expect(insert?.[0]).toContain("n_adjudicaciones_con_ruc");
    // 15 parámetros; el 13º es escala y debe ser 'absoluta'
    expect(insert?.[1]?.[12]).toBe("absoluta");
    expect(insert?.[1]?.[13]).toBeCloseTo(1, 5); // 100% del monto con RUC válido
    expect(insert?.[1]?.[14]).toBe(5);
  });
});
