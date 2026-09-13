import { describe, expect, it, vi, beforeEach } from "vitest";
import request from "supertest";

const queryMock = vi.fn();

vi.mock("../db/pool.js", () => ({
  pool: { query: queryMock },
}));

const { createApp } = await import("../app.js");

beforeEach(() => {
  queryMock.mockReset();
});

function budgetRow(overrides: Record<string, unknown> = {}) {
  return {
    sector_id: "PRODUCCION",
    sector_nombre: "Producción",
    entity_code: "1086",
    entity_name_publicado: "MINISTERIO DE LA PRODUCCION",
    entity_kind: "MINISTERIO",
    nivel_gobierno: "GOBIERNO NACIONAL",
    scope_rule: "META_DEPARTAMENTO",
    pia: "195049313.00",
    pim: "208104679.00",
    devengado: "128209085.25",
    cortes: ["2026-09-09"],
    resource_ids: ["mef-batch-1"],
    estado_cobertura: null,
    cobertura_corte: null,
    cobertura_registros: null,
    ...overrides,
  };
}

describe("GET /sectors/:sectorId/ficha (PV-01: ambito=NACIONAL)", () => {
  it("por defecto (sin ambito) sigue filtrando por departamento, con $2 en el JOIN de latest_budget", async () => {
    queryMock
      .mockResolvedValueOnce({ rows: [budgetRow()] }) // budgetByRegistry
      .mockResolvedValueOnce({ rows: [] }); // projectsForEntities (sin CUI vinculado)

    const app = createApp();
    const res = await request(app).get("/api/sectores/PRODUCCION/ficha").query({ departamento: "LA LIBERTAD" });

    expect(res.status).toBe(200);
    expect(res.body.departamento).toBe("LA LIBERTAD");

    const [sql, params] = queryMock.mock.calls[0];
    expect(sql).toMatch(/b\.meta_departamento=\$2/);
    expect(sql).toMatch(/s\.departamento=\$2/);
    expect(params[0]).toBe(2026);
    expect(params[1]).toBe("LA LIBERTAD");
  });

  it("ambito=NACIONAL agrega sin filtrar por departamento y no envía ese parámetro", async () => {
    queryMock
      .mockResolvedValueOnce({ rows: [budgetRow()] }) // budgetByRegistry
      .mockResolvedValueOnce({ rows: [] }); // projectsForEntities (sin CUI vinculado)

    const app = createApp();
    const res = await request(app).get("/api/sectores/PRODUCCION/ficha").query({ ambito: "NACIONAL" });

    expect(res.status).toBe(200);
    expect(res.body.departamento).toBe("TODOS");

    const [sql, params] = queryMock.mock.calls[0];
    expect(sql).not.toMatch(/b\.meta_departamento=\$2/);
    expect(sql).toMatch(/LEFT JOIN budget_coverage_snapshots s ON false/);
    // Sin departamento, el filtro de sectorId pasa a ser $2, no $3.
    expect(sql).toMatch(/r\.sector_id = \$2/);
    expect(params).toEqual([2026, "PRODUCCION"]);
  });

  it("ambito=NACIONAL declara la cobertura como NO_VERIFICADA en vez de inventar un agregado", async () => {
    queryMock
      .mockResolvedValueOnce({ rows: [budgetRow()] }) // budgetByRegistry
      .mockResolvedValueOnce({ rows: [] }); // projectsForEntities (sin CUI vinculado)

    const app = createApp();
    const res = await request(app).get("/api/sectores/PRODUCCION/ficha").query({ ambito: "NACIONAL" });

    expect(res.status).toBe(200);
    expect(res.body.entidades[0].cobertura.estado).toBe("NO_VERIFICADA");
  });

  it("reproduce el total de PIM/devengado del pliego 1086 verificado en vivo (S/ 208.1M / S/ 128.2M)", async () => {
    queryMock
      .mockResolvedValueOnce({ rows: [budgetRow()] }) // budgetByRegistry
      .mockResolvedValueOnce({ rows: [] }); // projectsForEntities (sin CUI vinculado)

    const app = createApp();
    const res = await request(app).get("/api/sectores/PRODUCCION/ficha").query({ ambito: "NACIONAL" });

    expect(res.status).toBe(200);
    expect(res.body.entidades).toHaveLength(1);
    expect(res.body.entidades[0].pim).toBeCloseTo(208104679.0, 2);
    expect(res.body.entidades[0].devengado).toBeCloseTo(128209085.25, 2);
  });

  it("responde 400 con un ambito no soportado, nunca lo ignora en silencio", async () => {
    const app = createApp();
    const res = await request(app).get("/api/sectores/PRODUCCION/ficha").query({ ambito: "MUNDIAL" });

    expect(res.status).toBe(400);
    expect(queryMock).not.toHaveBeenCalled();
  });
});

describe("GET /sectors/entidades/:entityCode/ficha (PV-01: mismo ambito, call site distinto)", () => {
  it("ambito=NACIONAL pasa entityCode en la 5ª posición sin sectorId, sin desalinear $2", async () => {
    queryMock
      .mockResolvedValueOnce({ rows: [budgetRow()] }) // budgetByRegistry
      .mockResolvedValueOnce({ rows: [] }); // projectsForEntities

    const app = createApp();
    const res = await request(app).get("/api/sectores/entidades/1086/ficha").query({ ambito: "NACIONAL" });

    expect(res.status).toBe(200);
    expect(res.body.entidad.entityCode).toBe("1086");
    expect(res.body.entidad.pim).toBeCloseTo(208104679.0, 2);

    const [sql, params] = queryMock.mock.calls[0];
    // Sin sectorId, entityCode es el único filtro extra -> $2, no $3.
    expect(sql).toMatch(/r\.entity_code = \$2/);
    expect(sql).not.toMatch(/b\.meta_departamento=\$2/);
    expect(params).toEqual([2026, "1086"]);
  });

  it("modo regional (sin ambito) sigue usando $2 para departamento y $3 para entityCode", async () => {
    queryMock
      .mockResolvedValueOnce({ rows: [budgetRow()] })
      .mockResolvedValueOnce({ rows: [] });

    const app = createApp();
    const res = await request(app).get("/api/sectores/entidades/1086/ficha").query({ departamento: "LA LIBERTAD" });

    expect(res.status).toBe(200);
    const [sql, params] = queryMock.mock.calls[0];
    expect(sql).toMatch(/b\.meta_departamento=\$2/);
    expect(sql).toMatch(/r\.entity_code = \$3/);
    expect(params).toEqual([2026, "LA LIBERTAD", "1086"]);
  });
});
