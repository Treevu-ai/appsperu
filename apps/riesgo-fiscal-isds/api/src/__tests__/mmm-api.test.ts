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

describe("GET /api/mmm/pasivos-contingentes", () => {
  it("devuelve las categorías por año de cierre, sin inventar valores faltantes", async () => {
    queryMock.mockResolvedValueOnce({
      rows: [
        {
          anio_cierre: 2022,
          categoria: "isds",
          pct_pbi: "2.15",
          notas_categoria: null,
          edicion_fuente: "IAPM_2025_2028",
          fuente_url: "https://www.mef.gob.pe/contenidos/pol_econ/marco_macro/IAPM_2025-2028.pdf",
          fecha_verificacion: "2026-09-13",
        },
      ],
    });

    const app = createApp();
    const res = await request(app).get("/api/mmm/pasivos-contingentes");

    expect(res.status).toBe(200);
    expect(res.body.pasivosContingentes).toHaveLength(1);
    expect(res.body.pasivosContingentes[0].anioCierre).toBe(2022);
    expect(res.body.pasivosContingentes[0].pctPbi).toBe(2.15);
    expect(queryMock).toHaveBeenCalledTimes(1);
  });
});

describe("GET /api/mmm/serie-historica", () => {
  it("marca explícitamente la serie como fuente secundaria", async () => {
    queryMock.mockResolvedValueOnce({
      rows: [
        { anio: 2014, pct_pbi: "0.80", monto_usd: null, n_casos: null, fuente_url: "https://larepublica.pe/x", notas: null },
      ],
    });

    const app = createApp();
    const res = await request(app).get("/api/mmm/serie-historica");

    expect(res.status).toBe(200);
    expect(res.body.fuente).toBe("secundaria");
    expect(res.body.serie[0].pctPbi).toBe(0.8);
  });
});

describe("GET /api/mmm/meta/sources", () => {
  it("agrega los lotes de ingesta manual más recientes", async () => {
    queryMock.mockResolvedValueOnce({
      rows: [
        {
          batch_id: 1,
          edicion: "IAPM_2025_2028",
          file_name: "IAPM_2025-2028.pdf",
          checksum: "abc123",
          filas_insertadas: 16,
          ingested_at: "2026-09-13T21:00:00.000Z",
        },
      ],
    });

    const app = createApp();
    const res = await request(app).get("/api/mmm/meta/sources");

    expect(res.status).toBe(200);
    expect(res.body.fuentes[0].ultimosLotes).toHaveLength(1);
    expect(res.body.fuentes[0].ultimosLotes[0].filasInsertadas).toBe(16);
    expect(queryMock).toHaveBeenCalledTimes(1);
  });
});
