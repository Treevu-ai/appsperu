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

function mockCountAndList(total: number, rows: Record<string, unknown>[]) {
  queryMock.mockResolvedValueOnce({ rows: [{ total: String(total) }] }).mockResolvedValueOnce({ rows });
}

describe("GET /api/trayectoria", () => {
  it("agrega por código modular y calcula tasas sobre el total", async () => {
    mockCountAndList(1, [
      {
        cod_mod: "1506",
        anexo: "0",
        anio: 2024,
        nombre: "LOS LUCEROS",
        ubigeo: "130101",
        departamento: "LA LIBERTAD",
        provincia: "TRUJILLO",
        distrito: "TRUJILLO",
        total_estudiantes: "100",
        matriculado: "95",
        aprobado: "80",
        desaprobado: "10",
        promocion_guiada: null,
        retirado: "5",
        fallecido: "0",
        tot_atraso: "20",
      },
    ]);

    const res = await request(createApp()).get("/api/trayectoria");

    expect(res.status).toBe(200);
    expect(res.body.total).toBe(1);
    expect(res.body.hasMore).toBe(false);
    expect(res.body.resultados[0]).toMatchObject({
      codMod: "1506",
      totalEstudiantes: 100,
      totAtraso: 20,
      tasaAtraso: 0.2,
      retirado: 5,
      tasaRetiro: 0.05,
      desaprobado: 10,
      promocionGuiada: null,
    });
  });

  it("sin anio explícito, filtra al año más reciente por defecto (mismo criterio DQ-16 que /api/municipalidades en renamu)", async () => {
    mockCountAndList(0, []);
    await request(createApp()).get("/api/trayectoria");
    const [countSql, countParams] = queryMock.mock.calls[0];
    const [listSql, listParams] = queryMock.mock.calls[1];
    expect(countSql).toMatch(/t\.anio = COALESCE\(NULL, \(SELECT MAX\(anio\) FROM siagie_trayectoria\)\)/);
    expect(countParams).toEqual([]);
    expect(listSql).toMatch(/t\.anio = COALESCE\(NULL, \(SELECT MAX\(anio\) FROM siagie_trayectoria\)\)/);
    expect(listParams).toEqual([200, 0]);
  });

  it("anio explícito filtra a ese año exacto", async () => {
    mockCountAndList(0, []);
    await request(createApp()).get("/api/trayectoria").query({ anio: 2022 });
    const [countSql, countParams] = queryMock.mock.calls[0];
    const [listSql, listParams] = queryMock.mock.calls[1];
    expect(countSql).toMatch(/t\.anio = COALESCE\(\$1, \(SELECT MAX\(anio\) FROM siagie_trayectoria\)\)/);
    expect(countParams).toEqual([2022]);
    expect(listSql).toMatch(/t\.anio = COALESCE\(\$1, \(SELECT MAX\(anio\) FROM siagie_trayectoria\)\)/);
    expect(listParams).toEqual([2022, 200, 0]);
  });

  it("rechaza un ubigeo que no tiene 6 dígitos sin consultar la base", async () => {
    const res = await request(createApp()).get("/api/trayectoria").query({ ubigeo: "123" });
    expect(res.status).toBe(400);
    expect(queryMock).not.toHaveBeenCalled();
  });

  it("no reporta tasas cuando el total de estudiantes es 0 (evita división por cero)", async () => {
    mockCountAndList(1, [
      {
        cod_mod: "9999", anexo: "0", anio: 2024, nombre: null, ubigeo: null, departamento: null,
        provincia: null, distrito: null, total_estudiantes: "0", matriculado: "0", aprobado: "0",
        desaprobado: null, promocion_guiada: null, retirado: "0", fallecido: "0", tot_atraso: "0",
      },
    ]);
    const res = await request(createApp()).get("/api/trayectoria");
    expect(res.body.resultados[0].tasaAtraso).toBeNull();
    expect(res.body.resultados[0].tasaRetiro).toBeNull();
  });

  it("hasMore es true cuando quedan más grupos que los devueltos en esta página", async () => {
    mockCountAndList(5, [
      {
        cod_mod: "1506", anexo: "0", anio: 2024, nombre: "LOS LUCEROS", ubigeo: "130101",
        departamento: "LA LIBERTAD", provincia: "TRUJILLO", distrito: "TRUJILLO",
        total_estudiantes: "10", matriculado: "10", aprobado: "10", desaprobado: "0",
        promocion_guiada: null, retirado: "0", fallecido: "0", tot_atraso: "0",
      },
    ]);
    const res = await request(createApp()).get("/api/trayectoria").query({ limit: 1, offset: 0 });
    expect(res.body.total).toBe(5);
    expect(res.body.hasMore).toBe(true);
  });
});
