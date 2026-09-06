import { describe, expect, it, vi, beforeEach } from "vitest";
import request from "supertest";

const comprasQueryMock = vi.fn();
const sancionadosQueryMock = vi.fn();

vi.mock("../db/compras-pool.js", () => ({
  comprasPool: { query: comprasQueryMock },
}));
vi.mock("../db/pool.js", () => ({
  pool: { query: sancionadosQueryMock },
}));
vi.mock("../db/fiscal-pool.js", () => ({
  fiscalPool: { query: vi.fn() },
}));

const { createApp } = await import("../app.js");

beforeEach(() => {
  comprasQueryMock.mockReset();
  sancionadosQueryMock.mockReset();
});

describe("GET /api/crossref/personas-sancionadas", () => {
  it("cruza una persona sancionada (RUC-10) con su vínculo empresarial, enmascarando el DNI", async () => {
    sancionadosQueryMock.mockResolvedValueOnce({
      rows: [
        {
          dni: "43268685",
          ruc: "10432686855",
          nombre: "AVILA TRUJILLO JOSE LUIS",
          tipo: "MULTA",
          resolucion: "2853-2024-TCE-S5",
          estado: "NO VIGENTE",
          desde: "2024-09-12",
          hasta: "2024-12-12",
        },
      ],
    });
    comprasQueryMock.mockResolvedValueOnce({
      rows: [
        {
          numero_documento: "43268685",
          nombre: "AVILA TRUJILLO JOSE LUIS",
          rol: "SOCIO",
          ruc: "20482131388",
          cargo: null,
          fecha_ingreso: "2009-02-14",
        },
      ],
    });

    const app = createApp();
    const res = await request(app).get("/api/crossref/personas-sancionadas");

    expect(res.status).toBe(200);
    expect(res.body.resultados).toHaveLength(1);
    expect(res.body.resultados[0]).toMatchObject({
      dniEnmascarado: "*****685",
      nombre: "AVILA TRUJILLO JOSE LUIS",
      tieneSancionVigente: false,
    });
    // El campo dedicado al DNI nunca debe traer el número completo — a
    // diferencia del RUC-10 (que ya es público en /api/sanciones y contiene
    // el DNI incrustado por diseño del propio formato, eso no es nuevo),
    // esta respuesta no debe introducir un segundo campo "dni"/"numero_documento"
    // sin enmascarar.
    expect(res.body.resultados[0]).not.toHaveProperty("dni");
    expect(res.body.resultados[0]).not.toHaveProperty("numero_documento");
    expect(res.body.resultados[0].dniEnmascarado).not.toBe("43268685");
    expect(res.body.resultados[0].vinculosEmpresariales[0]).toMatchObject({
      ruc: "20482131388",
      rol: "SOCIO",
    });
  });

  it("no devuelve nada si la persona sancionada no tiene vínculo en supplier_conformacion", async () => {
    sancionadosQueryMock.mockResolvedValueOnce({
      rows: [
        {
          dni: "99999999",
          ruc: "10999999997",
          nombre: "SIN VINCULO",
          tipo: "INHABILITACION",
          resolucion: "0001-2024",
          estado: "VIGENTE",
          desde: "2024-01-01",
          hasta: "2025-01-01",
        },
      ],
    });
    comprasQueryMock.mockResolvedValueOnce({ rows: [] });

    const app = createApp();
    const res = await request(app).get("/api/crossref/personas-sancionadas");

    expect(res.status).toBe(200);
    expect(res.body.resultados).toEqual([]);
  });

  it("filtra por soloVigentes cuando se pide", async () => {
    sancionadosQueryMock.mockResolvedValueOnce({
      rows: [
        { dni: "11111111", ruc: "10111111112", nombre: "A", tipo: "MULTA", resolucion: "R1", estado: "NO VIGENTE", desde: null, hasta: null },
        { dni: "22222222", ruc: "10222222223", nombre: "B", tipo: "INHABILITACION", resolucion: "R2", estado: "VIGENTE", desde: null, hasta: null },
      ],
    });
    comprasQueryMock.mockResolvedValueOnce({
      rows: [
        { numero_documento: "11111111", nombre: "A", rol: "SOCIO", ruc: "20111111111", cargo: null, fecha_ingreso: null },
        { numero_documento: "22222222", nombre: "B", rol: "SOCIO", ruc: "20222222222", cargo: null, fecha_ingreso: null },
      ],
    });

    const app = createApp();
    const res = await request(app).get("/api/crossref/personas-sancionadas").query({ soloVigentes: "true" });

    expect(res.body.resultados).toHaveLength(1);
    expect(res.body.resultados[0].dniEnmascarado).toBe("*****222");
  });

  it("no consulta compras-publicas si no hay ningún DNI derivado de persona natural", async () => {
    sancionadosQueryMock.mockResolvedValueOnce({ rows: [] });

    const app = createApp();
    const res = await request(app).get("/api/crossref/personas-sancionadas");

    expect(res.status).toBe(200);
    expect(res.body.resultados).toEqual([]);
    expect(comprasQueryMock).not.toHaveBeenCalled();
  });
});
