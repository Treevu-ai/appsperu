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

describe("GET /api/oxi", () => {
  it("devuelve la lista con traceability, aplica el filtro de departamento y trae la metadata del último lote", async () => {
    queryMock
      .mockResolvedValueOnce({
        rows: [
          {
            oxi_id: 5893,
            fase: "Priorizado",
            tipo_inversion: "Proyecto de inversión",
            nivel_estudio: "Ficha técnica",
            nivel_gobierno: "Gobierno Local Provincial",
            departamento: "LA LIBERTAD",
            provincia: "TRUJILLO",
            distrito: "TRUJILLO",
            entidad: "MUNICIPALIDAD PROVINCIAL DE TRUJILLO",
            codigo_referencia: "2698796",
            nombre_proyecto: "MEJORAMIENTO DEL SERVICIO DE MOVILIDAD URBANA",
            funcion: "TRANSPORTE",
            tipologia: "Vías Urbanas",
            monto_inversion_referencial: "6784469.84",
            rango_monto: "3-10 mill",
            fetched_at: "2026-08-28T02:19:00.548Z",
          },
        ],
      })
      .mockResolvedValueOnce({
        rows: [{ records_total: 761, fetched_at: "2026-08-28T02:19:00.548Z" }],
      });

    const app = createApp();
    const res = await request(app).get("/api/oxi").query({ departamento: "LA LIBERTAD" });

    expect(res.status).toBe(200);
    expect(res.body.resultados[0]).toMatchObject({
      oxiId: 5893,
      codigoReferencia: "2698796",
      nombreProyecto: "MEJORAMIENTO DEL SERVICIO DE MOVILIDAD URBANA",
      montoInversionReferencialSoles: 6784469.84,
    });
    expect(res.body.resultados[0].fuente.dataset).toMatch(/OxI/);
    expect(res.body).toMatchObject({
      cobertura: "oxi_inversiones_en_promocion",
      isPartial: true, // 1 fila devuelta < 761 del lote
      recordsTotalFuente: 761,
    });

    const [, listParams] = queryMock.mock.calls[0];
    expect(listParams).toEqual(["LA LIBERTAD"]);
  });

  it("marca isPartial: true y recordsTotalFuente: null cuando todavía no hay ningún lote ingerido", async () => {
    queryMock.mockResolvedValueOnce({ rows: [] }).mockResolvedValueOnce({ rows: [] });

    const app = createApp();
    const res = await request(app).get("/api/oxi");

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ resultados: [], isPartial: true, recordsTotalFuente: null, extraidoEl: null });
  });

  it("responde 400 cuando un parámetro de query llega repetido como array, sin tocar la base", async () => {
    const app = createApp();
    const res = await request(app).get("/api/oxi?funcion=a&funcion=b");

    expect(res.status).toBe(400);
    expect(queryMock).not.toHaveBeenCalled();
  });
});

describe("GET /api/oxi/:oxiId", () => {
  it("responde 400 cuando oxiId no es un entero positivo", async () => {
    const app = createApp();
    const res = await request(app).get("/api/oxi/abc");

    expect(res.status).toBe(400);
    expect(queryMock).not.toHaveBeenCalled();
  });

  it("responde 404 cuando el proyecto OxI no fue ingerido", async () => {
    queryMock.mockResolvedValueOnce({ rows: [] });

    const app = createApp();
    const res = await request(app).get("/api/oxi/999999");

    expect(res.status).toBe(404);
    expect(res.body.error).toMatch(/no encontrado/);
  });

  it("devuelve el detalle del proyecto con traceability", async () => {
    queryMock.mockResolvedValueOnce({
      rows: [
        {
          oxi_id: 3416,
          fase: "Priorizado",
          tipo_inversion: "Proyecto de inversión",
          nivel_estudio: "Ficha técnica",
          nivel_gobierno: "Gobierno Nacional",
          departamento: "LA LIBERTAD",
          provincia: "TRUJILLO",
          distrito: "MOCHE",
          entidad: "MINISTERIO DE SALUD",
          codigo_referencia: "2599679",
          nombre_proyecto: "MEJORAMIENTO DEL SERVICIO DE ATENCIÓN DE SALUD BÁSICOS EN SAN PEDRO",
          funcion: "SALUD",
          tipologia: "Establecimientos De Salud",
          monto_inversion_referencial: "14721159.40",
          rango_monto: "10-50 mill",
          fetched_at: "2026-08-28T02:19:00.548Z",
        },
      ],
    });

    const app = createApp();
    const res = await request(app).get("/api/oxi/3416");

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      oxiId: 3416,
      codigoReferencia: "2599679",
      montoInversionReferencialSoles: 14721159.4,
    });
    expect(res.body.fuente.dataset).toMatch(/OxI/);

    const [, params] = queryMock.mock.calls[0];
    expect(params).toEqual([3416]);
  });
});
