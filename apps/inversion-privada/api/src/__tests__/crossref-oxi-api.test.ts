import { describe, expect, it, vi, beforeEach } from "vitest";
import request from "supertest";

const oxiQueryMock = vi.fn();
const investmentsQueryMock = vi.fn();

vi.mock("../db/pool.js", () => ({
  pool: { query: oxiQueryMock },
}));
vi.mock("../db/inversiones-pool.js", () => ({
  inversionesPool: { query: investmentsQueryMock },
}));

const { createApp } = await import("../app.js");

beforeEach(() => {
  oxiQueryMock.mockReset();
  investmentsQueryMock.mockReset();
});

describe("GET /api/crossref/oxi", () => {
  it("no consulta radar-inversiones cuando no hay OxI con código de referencia", async () => {
    oxiQueryMock.mockResolvedValueOnce({ rows: [] });

    const app = createApp();
    const res = await request(app).get("/api/crossref/oxi");

    expect(res.status).toBe(200);
    expect(res.body.resultados).toEqual([]);
    expect(res.body.resumen).toEqual({ totalOxi: 0, conCodigoReferencia: 0, confirmadosEnInvierte: 0 });
    expect(investmentsQueryMock).not.toHaveBeenCalled();
  });

  it("marca enInvierte: true cuando codigo_referencia matchea un codigo_snip", async () => {
    oxiQueryMock.mockResolvedValueOnce({
      rows: [
        {
          oxi_id: 5893,
          nombre_proyecto: "MEJORAMIENTO DEL SERVICIO DE MOVILIDAD URBANA",
          codigo_referencia: "2698796",
          monto_inversion_referencial: "6784469.84",
          funcion: "TRANSPORTE",
        },
      ],
    });
    investmentsQueryMock.mockResolvedValueOnce({
      rows: [
        {
          codigo_snip: "2698796",
          nombre: "MEJORAMIENTO VIAL URBANO TRUJILLO",
          estado: "VIABLE",
          monto_viable: "6784469.84",
          costo_actualizado: "6900000.00",
        },
      ],
    });

    const app = createApp();
    const res = await request(app).get("/api/crossref/oxi").query({ departamento: "LA LIBERTAD" });

    expect(res.status).toBe(200);
    expect(res.body.resultados).toEqual([
      {
        oxiId: 5893,
        nombreProyecto: "MEJORAMIENTO DEL SERVICIO DE MOVILIDAD URBANA",
        funcion: "TRANSPORTE",
        codigoReferencia: "2698796",
        montoInversionReferencialSoles: 6784469.84,
        enInvierte: true,
        nombreInvierte: "MEJORAMIENTO VIAL URBANO TRUJILLO",
        estadoInvierte: "VIABLE",
        montoViableInvierte: 6784469.84,
        costoActualizadoInvierte: 6900000,
      },
    ]);
    expect(res.body.resumen).toEqual({ totalOxi: 1, conCodigoReferencia: 1, confirmadosEnInvierte: 1 });
  });

  it("marca enInvierte: false en vez de descartar la fila cuando no hay match", async () => {
    oxiQueryMock.mockResolvedValueOnce({
      rows: [
        {
          oxi_id: 7236,
          nombre_proyecto: "ADQUISICION DE MOBILIARIO URBANO",
          codigo_referencia: "2728299",
          monto_inversion_referencial: "443431.09",
          funcion: "AMBIENTE",
        },
      ],
    });
    investmentsQueryMock.mockResolvedValueOnce({ rows: [] });

    const app = createApp();
    const res = await request(app).get("/api/crossref/oxi");

    expect(res.body.resultados[0]).toMatchObject({
      oxiId: 7236,
      enInvierte: false,
      nombreInvierte: null,
      montoViableInvierte: null,
    });
    expect(res.body.resumen).toEqual({ totalOxi: 1, conCodigoReferencia: 1, confirmadosEnInvierte: 0 });
  });
});
