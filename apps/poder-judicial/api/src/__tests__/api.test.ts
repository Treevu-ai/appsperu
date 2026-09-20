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

describe("GET /health", () => {
  it("responde ok sin tocar la base", async () => {
    const res = await request(createApp()).get("/health");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: "ok" });
    expect(queryMock).not.toHaveBeenCalled();
  });
});

describe("GET /readyz", () => {
  it("confirma la dependencia de base antes de declarar listo", async () => {
    queryMock.mockResolvedValueOnce({ rows: [{ "?column?": 1 }] });
    const res = await request(createApp()).get("/readyz");
    expect(res.status).toBe(200);
  });

  it("no expone un error interno cuando la base no está disponible", async () => {
    queryMock.mockRejectedValueOnce(new Error("connection refused"));
    const res = await request(createApp()).get("/readyz");
    expect(res.status).toBe(503);
  });
});

const FILA_DB = {
  anio: 2024,
  mes: "Enero",
  distrito_judicial: "Amazonas",
  provincia: "CHACHAPOYAS",
  distrito: "CHACHAPOYAS",
  codigo_dependencia: "13",
  dependencia: "Juzgado de Paz Letrado",
  estado: "En Funcionamiento",
  tipo_organo: "Juzgado de Paz Letrado",
  espec_exp: "Civil",
  espec_dep: "Juzgado de Paz Letrado",
  condicion: "Permanente",
  pendientet: 101,
  pplazoimpug: 31,
  pendientee: 198,
  pendiente: 299,
  improcedentei: 1,
  nadmitido: 17,
  ape_insinferior: 0,
  ape_inssuperioranulada: 0,
  ingresot_sin: 18,
  deotradepent: 0,
  ingresot_con: 18,
  resconsentida: 1,
  ape_confirmadai: 0,
  ape_revocadai: 0,
  ingresoe_sin: 1,
  deotradepene: 1,
  ingresoe_con: 2,
  ingreso_sin: 19,
  ingreso_con: 20,
  improcedenter: 1,
  sentencia: 4,
  autodefinitivo: 2,
  conciliado: 0,
  informefinal: 0,
  ape_confirmadar: 0,
  ape_revocadar: 0,
  ape_anuladar: 0,
  ape_resuelta: 0,
  resueltot: 7,
  otrosegresost: 0,
  resueltoe: 0,
  otrosegresose: 5,
  resuelto: 7,
  confirmada_adef: 0,
  revocada_adef: 0,
  rdev_confirmada: 0,
  rdev_anulada: 1,
  rdev_revocada: 0,
  pendientecalf: 18,
  ingresocalf: 14,
  resueltocalf: 18,
  pendientecuad: 91,
  ingresocuad: 4,
  resueltocuad: 5,
  pendienteexh: 0,
  ingresoexh: 0,
  resueltoexh: 0,
};

describe("GET /api/procesos-judiciales", () => {
  it("lista con paginación real y filtros", async () => {
    queryMock.mockResolvedValueOnce({ rows: [{ total: "1" }] }).mockResolvedValueOnce({ rows: [FILA_DB] });

    const res = await request(createApp())
      .get("/api/procesos-judiciales")
      .query({ distritoJudicial: "Amazonas", anio: 2024 });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ total: 1, limit: 200, offset: 0, hasMore: false });
    expect(res.body.resultados[0]).toMatchObject({
      distritoJudicial: "Amazonas",
      dependencia: "Juzgado de Paz Letrado",
    });
    expect(res.body.resultados[0].conteos.pendiente).toBe(299);
  });

  it("rechaza un año fuera de rango sin consultar la base", async () => {
    const res = await request(createApp()).get("/api/procesos-judiciales").query({ anio: 1900 });
    expect(res.status).toBe(400);
    expect(queryMock).not.toHaveBeenCalled();
  });
});

describe("GET /api/procesos-judiciales/resumen", () => {
  it("agrega por distritoJudicial con las columnas titulares", async () => {
    queryMock.mockResolvedValueOnce({
      rows: [
        {
          grupo: "Amazonas",
          filas: "12",
          pendiente: "1200",
          resuelto: "900",
          ingreso_sin: "300",
          ingreso_con: "400",
          sentencia: "150",
          conciliado: "20",
        },
      ],
    });

    const res = await request(createApp()).get("/api/procesos-judiciales/resumen").query({ groupBy: "distritoJudicial" });

    expect(res.status).toBe(200);
    expect(res.body.groupBy).toBe("distritoJudicial");
    expect(res.body.porGrupo[0]).toEqual({
      grupo: "Amazonas",
      filas: 12,
      pendiente: 1200,
      resuelto: 900,
      ingreso_sin: 300,
      ingreso_con: 400,
      sentencia: 150,
      conciliado: 20,
    });
  });

  it("rechaza un groupBy no reconocido en vez de ignorarlo", async () => {
    const res = await request(createApp()).get("/api/procesos-judiciales/resumen").query({ groupBy: "razon_social" });
    expect(res.status).toBe(400);
    expect(queryMock).not.toHaveBeenCalled();
  });
});
