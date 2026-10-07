import { describe, expect, it, vi, beforeEach } from "vitest";
import request from "supertest";

const queryMock = vi.fn();
const releaseMock = vi.fn();
const connectMock = vi.fn(() => Promise.resolve({ query: queryMock, release: releaseMock }));

vi.mock("../db/pool.js", () => ({
  pool: { query: queryMock, connect: connectMock },
}));

const { createApp } = await import("../app.js");

beforeEach(() => {
  queryMock.mockReset();
  releaseMock.mockReset();
  connectMock.mockClear();
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
  it("confirma la dependencia antes de declararse listo", async () => {
    queryMock.mockResolvedValueOnce({ rows: [{ "?column?": 1 }] });
    const res = await request(createApp()).get("/readyz");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: "ready" });
  });

  it("no filtra el error interno cuando la base no responde", async () => {
    queryMock.mockRejectedValueOnce(new Error("connection refused"));
    const res = await request(createApp()).get("/readyz");
    expect(res.status).toBe(503);
  });
});

describe("GET /api/cruce/punto", () => {
  it("rechaza lat/lon fuera del territorio peruano en vez de consultar", async () => {
    const res = await request(createApp()).get("/api/cruce/punto?lat=40&lon=-3");
    expect(res.status).toBe(400);
    expect(queryMock).not.toHaveBeenCalled();
  });

  it("exige lat y lon", async () => {
    const res = await request(createApp()).get("/api/cruce/punto?lat=-8.1");
    expect(res.status).toBe(400);
    expect(queryMock).not.toHaveBeenCalled();
  });

  it("usa ST_Contains (punto exacto) cuando radio_km es 0", async () => {
    queryMock
      .mockResolvedValueOnce({ rows: [{ codigou: "1234", concesion: "C-1", titular: "X" }] })
      .mockResolvedValueOnce({ rows: [] });

    const res = await request(createApp()).get("/api/cruce/punto?lat=-8.1&lon=-79.03");

    expect(res.status).toBe(200);
    expect(res.body.tipo).toBe("punto_exacto");
    expect(res.body.punto).toEqual({ lat: -8.1, lon: -79.03 });
    expect(res.body.derechos_mineros).toHaveLength(1);
    for (const [sql] of queryMock.mock.calls) {
      expect(sql).toContain("ST_Contains");
      expect(sql).not.toContain("ST_DWithin");
    }
  });

  it("el punto se manda como WKT con SRID 4326 y el orden lon lat", async () => {
    queryMock.mockResolvedValueOnce({ rows: [] }).mockResolvedValueOnce({ rows: [] });

    await request(createApp()).get("/api/cruce/punto?lat=-8.1&lon=-79.03");

    const [, params] = queryMock.mock.calls[0];
    expect(params[0]).toBe("SRID=4326;POINT(-79.03 -8.1)");
  });

  it("usa ST_DWithin y calcula el buffer en grados cuando hay radio", async () => {
    queryMock.mockResolvedValueOnce({ rows: [] }).mockResolvedValueOnce({ rows: [] });

    const res = await request(createApp()).get("/api/cruce/punto?lat=-8.1&lon=-79.03&radio_km=10");

    expect(res.status).toBe(200);
    expect(res.body.tipo).toBe("buffer");
    expect(res.body.radio_km).toBe(10);
    for (const [sql] of queryMock.mock.calls) expect(sql).toContain("ST_DWithin");
    // 10 km / 111 km por grado
    const [, params] = queryMock.mock.calls[0];
    expect(params[1]).toBeCloseTo(10 / 111, 6);
  });
});

describe("GET /api/cruce/minero/:codigou", () => {
  it("devuelve 404 cuando el codigou no existe, sin pedir intersecciones", async () => {
    queryMock.mockResolvedValueOnce({ rows: [] });

    const res = await request(createApp()).get("/api/cruce/minero/99999999");

    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: "Derecho minero no encontrado." });
    expect(queryMock).toHaveBeenCalledTimes(1);
  });

  it("devuelve el derecho y sus intersecciones cuando existe", async () => {
    queryMock
      .mockResolvedValueOnce({ rows: [{ codigou: "0101", titular: "MINERA S.A." }] })
      .mockResolvedValueOnce({
        rows: [{ forest_capa: "concesiones", intersection_area_km2: 12.5 }],
      });

    const res = await request(createApp()).get("/api/cruce/minero/0101");

    expect(res.status).toBe(200);
    expect(res.body.derecho.titular).toBe("MINERA S.A.");
    expect(res.body.intersecciones).toHaveLength(1);
    expect(res.body.intersecciones[0].intersection_area_km2).toBe(12.5);
  });
});

describe("GET /api/cruce/forestal/:capa/:objectid", () => {
  it("devuelve 404 cuando el titulo no existe", async () => {
    queryMock.mockResolvedValueOnce({ rows: [] });

    const res = await request(createApp()).get("/api/cruce/forestal/concesiones/999");

    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: "Título forestal no encontrado." });
  });

  it("rechaza un objectid no numérico con 400 explícito", async () => {
    const res = await request(createApp()).get("/api/cruce/forestal/concesiones/abc");
    expect(res.status).toBe(400);
    expect(queryMock).not.toHaveBeenCalled();
  });

  it("devuelve el titulo y las superposiciones mineras", async () => {
    queryMock
      .mockResolvedValueOnce({ rows: [{ capa: "concesiones", objectid: 42, area_km2: 900 }] })
      .mockResolvedValueOnce({
        rows: [{ mining_codigou: "0101", intersection_area_km2: 30.25 }],
      });

    const res = await request(createApp()).get("/api/cruce/forestal/concesiones/42");

    expect(res.status).toBe(200);
    expect(res.body.titulo.objectid).toBe(42);
    expect(res.body.intersecciones[0].mining_codigou).toBe("0101");
    const [interseccionesSql, params] = queryMock.mock.calls[1];
    expect(interseccionesSql).toContain("ORDER BY i.intersection_area_km2 DESC");
    expect(params).toEqual(["concesiones", 42]);
  });
});

/**
 * `/api/cruce/report` cuenta y pagina dentro de una transacción `REPEATABLE READ` sobre un
 * mismo `pool.connect()`, no con dos `pool.query` sueltos: si el batch de intersecciones se
 * recomputa entre ambas, el `total` y la página describen batches distintos.
 */
describe("GET /api/cruce/report", () => {
  it("sin filtros consulta con WHERE TRUE, no una condición inventada", async () => {
    queryMock
      .mockResolvedValueOnce({ rows: [] }) // BEGIN
      .mockResolvedValueOnce({ rows: [{ total: "0" }] }) // count
      .mockResolvedValueOnce({ rows: [] }) // list
      .mockResolvedValueOnce({ rows: [] }); // COMMIT

    await request(createApp()).get("/api/cruce/report");

    const [countSql] = queryMock.mock.calls[1];
    expect(countSql).toContain("WHERE TRUE");
  });

  it("el total y la lista se cuentan en el mismo cliente y se cierra la transacción", async () => {
    queryMock
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ total: "0" }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] });

    await request(createApp()).get("/api/cruce/report");

    expect(connectMock).toHaveBeenCalledTimes(1);
    expect(queryMock.mock.calls[0][0]).toContain("REPEATABLE READ");
    expect(queryMock.mock.calls[3][0]).toBe("COMMIT");
    expect(releaseMock).toHaveBeenCalledTimes(1);
  });

  it("hace ROLLBACK y libera el cliente si la lista falla", async () => {
    queryMock
      .mockResolvedValueOnce({ rows: [] }) // BEGIN
      .mockResolvedValueOnce({ rows: [{ total: "5" }] }) // count
      .mockRejectedValueOnce(new Error("boom")) // list
      .mockResolvedValueOnce({ rows: [] }); // ROLLBACK

    const res = await request(createApp()).get("/api/cruce/report");

    expect(res.status).toBe(500);
    expect(res.body).toEqual({ error: "Error interno." });
    expect(queryMock.mock.calls[3][0]).toBe("ROLLBACK");
    expect(releaseMock).toHaveBeenCalledTimes(1);
  });

  it("cada filtro viaja como parámetro bindeado, no interpolado en el SQL", async () => {
    queryMock
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ total: "0" }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] });

    await request(createApp()).get(
      "/api/cruce/report?departamento=LA LIBERTAD&sustancia=ORO&capa=concesiones&min_area_km2=5",
    );

    const [countSql, countParams] = queryMock.mock.calls[1];
    expect(countParams).toEqual(["LA LIBERTAD", "ORO", "concesiones", 5]);
    // Los 4 filtros deben ser placeholders, no texto pegado en la consulta.
    expect(countSql).toContain("i.mining_departamento = $1");
    expect(countSql).toContain("m.sustancia = $2");
    expect(countSql).toContain("i.forest_capa = $3");
    expect(countSql).toContain("i.intersection_area_km2 >= $4");
    expect(countSql).not.toContain("LA LIBERTAD");
  });

  it("hasMore reflects si la página llenó o no", async () => {
    queryMock
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ total: "3" }] })
      .mockResolvedValueOnce({ rows: [{ intersection_area_km2: 1 }, { intersection_area_km2: 2 }] })
      .mockResolvedValueOnce({ rows: [] });

    const res = await request(createApp()).get("/api/cruce/report?limit=2");

    expect(res.body.total).toBe(3);
    expect(res.body.hasMore).toBe(true);
  });

  it("rechaza un limit por encima del máximo", async () => {
    const res = await request(createApp()).get("/api/cruce/report?limit=100000");
    expect(res.status).toBe(400);
    expect(connectMock).not.toHaveBeenCalled();
  });
});

describe("GET /api/cruce/stats", () => {
  it("convierte los conteos de Postgres (string) a número", async () => {
    queryMock
      .mockResolvedValueOnce({ rows: [{ count: "120" }] }) // mining_rights
      .mockResolvedValueOnce({ rows: [{ count: "80" }] }) // forest_titles
      .mockResolvedValueOnce({ rows: [{ count: "12" }] }) // intersection_results
      .mockResolvedValueOnce({ rows: [{ departamento: "LA LIBERTAD", count: "5" }] })
      .mockResolvedValueOnce({ rows: [{ sustancia: "ORO", count: "3" }] })
      .mockResolvedValueOnce({ rows: [{ capa: "concesiones", count: "12" }] })
      .mockResolvedValueOnce({ rows: [{ computed_at: "2026-09-20T10:00:00.000Z" }] });

    const res = await request(createApp()).get("/api/cruce/stats");

    expect(res.status).toBe(200);
    expect(res.body.resumen).toEqual({
      derechos_mineros_con_geometria: 120,
      titulos_forestales_con_geometria: 80,
      total_intersecciones: 12,
    });
    expect(res.body.por_departamento[0].intersecciones).toBe(5);
    expect(res.body.ultima_interseccion).toBe("2026-09-20T10:00:00.000Z");
  });

  it("devuelve ultima_interseccion null si nunca se calculó una, no la fecha de epoch", async () => {
    // COUNT(*) siempre devuelve exactamente una fila; los GROUP BY y el
    // "última" sí pueden venir vacíos si el batch nunca corrió.
    queryMock
      .mockResolvedValueOnce({ rows: [{ count: "0" }] }) // mining_rights
      .mockResolvedValueOnce({ rows: [{ count: "0" }] }) // forest_titles
      .mockResolvedValueOnce({ rows: [{ count: "0" }] }) // intersection_results
      .mockResolvedValueOnce({ rows: [] }) // por departamento
      .mockResolvedValueOnce({ rows: [] }) // por sustancia
      .mockResolvedValueOnce({ rows: [] }) // por capa
      .mockResolvedValueOnce({ rows: [] }); // última intersección

    const res = await request(createApp()).get("/api/cruce/stats");

    expect(res.status).toBe(200);
    expect(res.body.resumen.total_intersecciones).toBe(0);
    expect(res.body.ultima_interseccion).toBeNull();
  });
});

describe("GET /api/cruce/comunidad/:capa/:objectid", () => {
  it("devuelve la comunidad con sus superposiciones minero y forestal", async () => {
    queryMock
      .mockResolvedValueOnce({ rows: [{ capa: "comunidades_campesinas", objectid: 2046, nombre: "MOLLOCCAHUA" }] })
      .mockResolvedValueOnce({ rows: [{ mining_codigou: "010080425", mining_titular: "MINERA BARRICK PERU S.A." }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ area_cubierta_km2: 32.33, pct_cobertura: 79.86, num_derechos: 9 }] })
      .mockResolvedValueOnce({ rows: [] });

    const res = await request(createApp()).get("/api/cruce/comunidad/comunidades_campesinas/2046");

    expect(res.status).toBe(200);
    expect(res.body.comunidad.nombre).toBe("MOLLOCCAHUA");
    expect(res.body.superposiciones_minero).toHaveLength(1);
    expect(res.body.superposiciones_forestal).toHaveLength(0);
  });

  it("incluye la cobertura REAL (ST_Union) junto a los pares individuales", async () => {
    queryMock
      .mockResolvedValueOnce({ rows: [{ capa: "comunidades_campesinas", objectid: 2046, nombre: "MOLLOCCAHUA" }] })
      .mockResolvedValueOnce({ rows: [{}, {}] }) // 2 pares individuales
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ area_cubierta_km2: 32.33, pct_cobertura: 79.86, num_derechos: 9 }] })
      .mockResolvedValueOnce({ rows: [] });

    const res = await request(createApp()).get("/api/cruce/comunidad/comunidades_campesinas/2046");

    expect(res.status).toBe(200);
    expect(res.body.superposiciones_minero).toHaveLength(2);
    expect(res.body.cobertura_minero_real).toEqual({ area_cubierta_km2: 32.33, pct_cobertura: 79.86, num_derechos: 9 });
    expect(res.body.cobertura_forestal_real).toBeNull();
  });

  it("devuelve 404 si la comunidad no existe", async () => {
    queryMock.mockResolvedValueOnce({ rows: [] });
    const res = await request(createApp()).get("/api/cruce/comunidad/comunidades_nativas/999999");
    expect(res.status).toBe(404);
  });

  it("devuelve 400 con capa inválida", async () => {
    const res = await request(createApp()).get("/api/cruce/comunidad/no-existe/1");
    expect(res.status).toBe(400);
    expect(queryMock).not.toHaveBeenCalled();
  });
});

describe("GET /api/cruce/comunidad-minero/report", () => {
  it("filtra por titular (ILIKE) y pagina", async () => {
    queryMock
      .mockResolvedValueOnce({ rows: [{ total: "2" }] })
      .mockResolvedValueOnce({ rows: [{ mining_titular: "MINERA BARRICK PERU S.A.", community_nombre: "MOLLOCCAHUA" }] });

    const res = await request(createApp())
      .get("/api/cruce/comunidad-minero/report")
      .query({ titular: "barrick", limit: 1 });

    expect(res.status).toBe(200);
    expect(res.body.total).toBe(2);
    expect(res.body.resultados).toHaveLength(1);
    expect(queryMock.mock.calls[0][0]).toMatch(/community_mining_intersections/);
    expect(queryMock.mock.calls[0][1]).toEqual(["%barrick%"]);
  });

  it("devuelve 400 con capa inválida", async () => {
    const res = await request(createApp())
      .get("/api/cruce/comunidad-minero/report")
      .query({ capa: "no-existe" });
    expect(res.status).toBe(400);
    expect(queryMock).not.toHaveBeenCalled();
  });
});

describe("GET /api/cruce/comunidad-forestal/report", () => {
  it("filtra por forest_capa y pagina", async () => {
    queryMock
      .mockResolvedValueOnce({ rows: [{ total: "1" }] })
      .mockResolvedValueOnce({ rows: [{ forest_capa: "modalidad_concesiones_forestales", community_nombre: "BAMBAMARCA" }] });

    const res = await request(createApp())
      .get("/api/cruce/comunidad-forestal/report")
      .query({ forest_capa: "modalidad_concesiones_forestales" });

    expect(res.status).toBe(200);
    expect(res.body.total).toBe(1);
    expect(queryMock.mock.calls[0][0]).toMatch(/community_forest_intersections/);
  });
});

describe("GET /api/cruce/comunidad-minero/cobertura", () => {
  it("filtra por min_pct y ordena por cobertura descendente", async () => {
    queryMock
      .mockResolvedValueOnce({ rows: [{ total: "1" }] })
      .mockResolvedValueOnce({ rows: [{ community_nombre: "INDEPENDIENTE", pct_cobertura: 100 }] });

    const res = await request(createApp())
      .get("/api/cruce/comunidad-minero/cobertura")
      .query({ min_pct: 90 });

    expect(res.status).toBe(200);
    expect(res.body.total).toBe(1);
    expect(queryMock.mock.calls[0][0]).toMatch(/community_mining_coverage/);
    expect(queryMock.mock.calls[1][0]).toMatch(/ORDER BY pct_cobertura DESC/);
  });
});

describe("GET /api/cruce/comunidad-forestal/cobertura", () => {
  it("filtra por departamento", async () => {
    queryMock
      .mockResolvedValueOnce({ rows: [{ total: "1" }] })
      .mockResolvedValueOnce({ rows: [{ community_nombre: "BAMBAMARCA" }] });

    const res = await request(createApp())
      .get("/api/cruce/comunidad-forestal/cobertura")
      .query({ departamento: "LA LIBERTAD" });

    expect(res.status).toBe(200);
    expect(queryMock.mock.calls[0][0]).toMatch(/community_forest_coverage/);
  });
});

describe("GET /api/cruce/comunidad/stats", () => {
  it("agrega resumen, buckets de severidad, top titulares y por capa forestal", async () => {
    queryMock
      .mockResolvedValueOnce({ rows: [{ count: "4492" }] }) // comunidadesCount
      .mockResolvedValueOnce({ rows: [{ count: "14650" }] }) // mineroCount
      .mockResolvedValueOnce({ rows: [{ count: "859" }] }) // forestalCount
      .mockResolvedValueOnce({ rows: [{ count: "1930" }] }) // comunidadesAfectadasMinero
      .mockResolvedValueOnce({ rows: [{ count: "320" }] }) // comunidadesAfectadasForestal
      .mockResolvedValueOnce({ rows: [{ mining_titular: "MINERA BARRICK PERU S.A.", count: "108" }] })
      .mockResolvedValueOnce({ rows: [{ forest_capa: "modalidad_concesiones_forestales", count: "87" }] })
      .mockResolvedValueOnce({ rows: [{ computed_at: "2026-10-06T22:56:30.032Z" }] })
      .mockResolvedValueOnce({ rows: [{ computed_at: "2026-10-06T22:56:43.988Z" }] })
      .mockResolvedValueOnce({ rows: [{ menor_10: "540", entre_10_50: "724", entre_50_90: "364", mayor_90: "302" }] })
      .mockResolvedValueOnce({ rows: [{ count: "40" }] });

    const res = await request(createApp()).get("/api/cruce/comunidad/stats");

    expect(res.status).toBe(200);
    expect(res.body.resumen).toEqual({
      comunidades_total: 4492,
      pares_comunidad_minero: 14650,
      pares_comunidad_forestal: 859,
      comunidades_afectadas_minero: 1930,
      comunidades_afectadas_forestal: 320,
      comunidades_con_doble_exposicion: 40,
    });
    expect(res.body.cobertura_minero_por_severidad).toEqual({
      nota: "Cobertura REAL (ST_Union), ver /comunidad-minero/cobertura. No es la suma de community_overlap_pct.",
      menor_10pct: 540,
      entre_10_50pct: 724,
      entre_50_90pct: 364,
      mayor_90pct: 302,
    });
    expect(res.body.top_titulares_mineros[0]).toEqual({
      titular: "MINERA BARRICK PERU S.A.",
      comunidades_afectadas: 108,
    });
    expect(res.body.ultima_corrida).toEqual({
      minero: "2026-10-06T22:56:30.032Z",
      forestal: "2026-10-06T22:56:43.988Z",
    });
  });
});

describe("ruta inexistente", () => {
  it("responde 404 con el catch-all, no un 500", async () => {
    const res = await request(createApp()).get("/api/cruce/inexistente");
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: "No encontrado." });
  });
});
