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
  it("devuelve las categorías por edición, sin inventar valores faltantes", async () => {
    queryMock.mockResolvedValueOnce({
      rows: [
        {
          edicion: "2027-2030",
          fecha_publicacion: "ago-2026 (aprobado por Consejo de Ministros)",
          estado_edicion: "verificado",
          categoria: "isds",
          pct_pbi: "2.15",
          notas_categoria: "Cifra ancla del proyecto.",
          fuente_url: "https://www.mef.gob.pe/es/marco-macroeconomico/marco-macroeconomico-multianualmmm",
          fuente_secundaria_url: "https://gestion.pe/economia/este-es-el-impacto-economico-que-el-mef-calcula-en-caso-peru-pierda-sus-arbitrajes-y-casos-activos-en-el-ciadi-noticia/",
          fecha_verificacion: "2026-09-13",
        },
        {
          edicion: "2026-2029",
          fecha_publicacion: "27-ago-2025",
          estado_edicion: "no_localizado",
          categoria: "isds",
          pct_pbi: null,
          notas_categoria: "No localizado — ver notas en mmm_ediciones.",
          fuente_url: "https://www.mef.gob.pe/es/marco-macroeconomico/marco-macroeconomico-multianualmmm",
          fuente_secundaria_url: null,
          fecha_verificacion: "2026-09-13",
        },
      ],
    });

    const app = createApp();
    const res = await request(app).get("/api/mmm/pasivos-contingentes");

    expect(res.status).toBe(200);
    expect(res.body.pasivosContingentes).toHaveLength(2);
    expect(res.body.pasivosContingentes[0].pctPbi).toBe(2.15);
    expect(res.body.pasivosContingentes[1].pctPbi).toBeNull();
    expect(res.body.pasivosContingentes[1].estadoEdicion).toBe("no_localizado");
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
