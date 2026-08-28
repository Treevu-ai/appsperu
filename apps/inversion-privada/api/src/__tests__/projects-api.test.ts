import { describe, expect, it, vi, beforeEach } from "vitest";
import request from "supertest";

const queryMock = vi.fn();

vi.mock("../db/pool.js", () => ({
  pool: { query: queryMock },
}));
vi.mock("../db/inversiones-pool.js", () => ({
  inversionesPool: { query: vi.fn() },
}));

const { createApp } = await import("../app.js");

beforeEach(() => {
  queryMock.mockReset();
});

describe("GET /api/projects", () => {
  it("devuelve la lista con traceability, aplica el filtro de departamento y trae la metadata del último lote", async () => {
    queryMock
      .mockResolvedValueOnce({
        rows: [
          {
            vertix_id: 509,
            slug: "509-red-vial-nº-5-tramo-ancon-huacho-pativilca",
            tipo_proyecto: "APP",
            nombre: "Red vial Nº 5: Tramo Ancón-Huacho-Pativilca",
            estado: "En Ejecución Contractual",
            fase: "Ejecución Contractual",
            titular: "MINISTERIO DE TRANSPORTES Y COMUNICACIONES",
            sector: "Transporte",
            cartera: "Vial",
            modalidad: "Autofinanciada",
            modalidad_contractual: "Contrato de Concesión",
            monto_inversion_sigv: "61.40",
            monto_proyecto: "US$ 61.40",
            green_brownfield: "Greenfield",
            departamentos: ["LA LIBERTAD", "LIMA"],
            url_thumb: "https://example.com/thumb.png",
            fetched_at: "2026-08-28T02:19:00.548Z",
          },
        ],
      })
      .mockResolvedValueOnce({
        rows: [{ records_total: 340, fetched_at: "2026-08-28T02:19:00.548Z" }],
      });

    const app = createApp();
    const res = await request(app).get("/api/projects").query({ departamento: "LA LIBERTAD" });

    expect(res.status).toBe(200);
    expect(res.body.resultados[0]).toMatchObject({
      vertixId: 509,
      nombre: "Red vial Nº 5: Tramo Ancón-Huacho-Pativilca",
      montoInversionSigv: 61.4,
    });
    expect(res.body.resultados[0].fuente.dataset).toMatch(/VERTIX/);
    expect(res.body).toMatchObject({
      cobertura: "cartera_vertix_app_pa",
      isPartial: true, // 1 fila devuelta < 340 del lote
      recordsTotalFuente: 340,
    });

    const [, listParams] = queryMock.mock.calls[0];
    expect(listParams).toEqual(["LA LIBERTAD"]);
  });

  it("marca isPartial: true y recordsTotalFuente: null cuando todavía no hay ningún lote ingerido", async () => {
    queryMock.mockResolvedValueOnce({ rows: [] }).mockResolvedValueOnce({ rows: [] });

    const app = createApp();
    const res = await request(app).get("/api/projects");

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ resultados: [], isPartial: true, recordsTotalFuente: null, extraidoEl: null });
  });

  it("responde 400 cuando tipo no es APP ni PA, sin tocar la base", async () => {
    const app = createApp();
    const res = await request(app).get("/api/projects?tipo=XYZ");

    expect(res.status).toBe(400);
    expect(queryMock).not.toHaveBeenCalled();
  });
});

describe("GET /api/projects/:vertixId", () => {
  it("responde 400 cuando vertixId no es un entero positivo", async () => {
    const app = createApp();
    const res = await request(app).get("/api/projects/abc");

    expect(res.status).toBe(400);
    expect(queryMock).not.toHaveBeenCalled();
  });

  it("responde 404 cuando el proyecto no fue ingerido", async () => {
    queryMock.mockResolvedValueOnce({ rows: [] });

    const app = createApp();
    const res = await request(app).get("/api/projects/999999");

    expect(res.status).toBe(404);
    expect(res.body.error).toMatch(/no encontrado/);
  });

  it("devuelve el detalle del proyecto con traceability", async () => {
    queryMock.mockResolvedValueOnce({
      rows: [
        {
          vertix_id: 509,
          slug: "509-red-vial",
          tipo_proyecto: "APP",
          nombre: "Red vial Nº 5",
          nombre_corto: "Red vial 5",
          estado: "En Ejecución Contractual",
          fase: "Ejecución Contractual",
          titular: "MINISTERIO DE TRANSPORTES Y COMUNICACIONES",
          sector: "Transporte",
          cartera: "Vial",
          modalidad: "Autofinanciada",
          modalidad_contractual: "Contrato de Concesión",
          iniciativa: "Iniciativa Estatal",
          monto_inversion_sigv: "61.40",
          monto_proyecto: "US$ 61.40",
          green_brownfield: "Greenfield",
          buena_pro_prevista: "24/05/2002",
          anho_concesion: 25,
          departamentos: ["LA LIBERTAD"],
          departamentos_inei: ["13"],
          url_thumb: "https://example.com/thumb.png",
          url_geo: null,
          fetched_at: "2026-08-28T02:19:00.548Z",
        },
      ],
    });

    const app = createApp();
    const res = await request(app).get("/api/projects/509");

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      vertixId: 509,
      nombre: "Red vial Nº 5",
      montoInversionSigv: 61.4,
      departamentosInei: ["13"],
    });
    expect(res.body.fuente.dataset).toMatch(/VERTIX/);

    const [, params] = queryMock.mock.calls[0];
    expect(params).toEqual([509]);
  });
});
