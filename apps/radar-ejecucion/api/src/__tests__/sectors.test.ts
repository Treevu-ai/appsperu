import { describe, expect, it, vi, beforeEach } from "vitest";
import request from "supertest";

const queryMock = vi.fn();
const infobrasQueryMock = vi.fn();

vi.mock("../db/pool.js", () => ({
  pool: { query: queryMock },
}));

vi.mock("../db/external-pools.js", () => ({
  infobrasPool: { query: (...args: unknown[]) => infobrasQueryMock(...args) },
  comprasPool: null,
}));

const { createApp } = await import("../app.js");

beforeEach(() => {
  queryMock.mockReset();
  infobrasQueryMock.mockReset();
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

  it("obras vinculadas por CUI incluyen paralización y señales INFOBRAS (GORE-01c)", async () => {
    queryMock
      .mockResolvedValueOnce({ rows: [budgetRow({ sector_id: "TRANSPORTE", sector_nombre: "Transporte", entity_code: "831" })] })
      .mockResolvedValueOnce({
        rows: [
          {
            cui: "2456789",
            actividad_literal: "OBRA TEST",
            entidad_responsable: "GR LL",
            departamento: "LA LIBERTAD",
            pia_legal: 1000,
            pim: 2000,
            devengado: 500,
            estado_pim: "VIABLE",
            entity_code: "831",
            evidence_url: null,
            alerta_consistencia_territorial: null,
            observed_at: "2026-08-20",
          },
        ],
      });

    infobrasQueryMock.mockResolvedValueOnce({
      rows: [
        {
          codigo_infobras: "INF-TEST",
          cui: "2456789",
          nombre_obra: "OBRA TEST",
          estado_ejecucion: "PARALIZADA",
          departamento: "LA LIBERTAD",
          provincia: "TRUJILLO",
          distrito: "TRUJILLO",
          avance_fisico_real_pct: 70,
          ejecucion_financiera_pct: 40,
          existe_paralizacion: true,
          dias_paralizado: 90,
          fecha_paralizacion: "2026-06-01",
          monto_viable: 1000,
          costo_actualizado: 1500,
        },
      ],
    });

    const app = createApp();
    const res = await request(app).get("/api/sectores/TRANSPORTE/ficha").query({ departamento: "LA LIBERTAD" });

    expect(res.status).toBe(200);
    expect(res.body.obras.estado).toBe("CUI_EXACTO");
    expect(res.body.obras.resultados).toHaveLength(1);
    expect(res.body.obras.resultados[0]).toMatchObject({
      diasParalizado: 90,
      costDriftPct: 50,
      gapFisicoFinanciero: 30,
      existeParalizacion: true,
    });

    const [sql] = infobrasQueryMock.mock.calls[0];
    expect(sql).toMatch(/dias_paralizado/);
    expect(sql).toMatch(/monto_viable/);
    expect(sql).toMatch(/costo_actualizado/);
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
