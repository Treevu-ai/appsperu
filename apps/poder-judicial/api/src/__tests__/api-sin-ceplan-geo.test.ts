import { describe, expect, it, vi, beforeEach } from "vitest";
import request from "supertest";

const queryMock = vi.fn();

vi.mock("../db/pool.js", () => ({
  pool: { query: queryMock },
}));

// Archivo separado a propósito: `vi.mock` es por archivo, así que acá se
// prueba el otro camino de `fetchUbigeoByProvinciaDistrito` -- sin
// `CEPLAN_GEO_DATABASE_URL` configurada, `ceplanGeoPool` es `null` (ver
// `db/external-pools.ts`).
vi.mock("../db/external-pools.js", () => ({
  ceplanGeoPool: null,
}));

const { createApp } = await import("../app.js");

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
  pendiente: 299,
  resuelto: 7,
};

beforeEach(() => {
  queryMock.mockReset();
});

describe("GET /api/procesos-judiciales sin CEPLAN_GEO_DATABASE_URL configurada", () => {
  it("responde igual, con ubigeo en null, sin intentar tocar ceplan-geo", async () => {
    queryMock.mockResolvedValueOnce({ rows: [{ total: "1" }] }).mockResolvedValueOnce({ rows: [FILA_DB] });

    const res = await request(createApp()).get("/api/procesos-judiciales");

    expect(res.status).toBe(200);
    expect(res.body.resultados[0].ubigeo).toBeNull();
  });
});
