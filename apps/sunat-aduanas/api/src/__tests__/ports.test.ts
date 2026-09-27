import { describe, expect, it, beforeAll, afterAll } from "vitest";
import request from "supertest";
import { createApp } from "../app.js";
import { pool } from "../db/pool.js";

const app = createApp();

beforeAll(async () => {
  // Seed minimal test data
  await pool.query(`
    INSERT INTO raw_batches (source_file, year, checksum, row_count)
    VALUES ('test_cdro15.xlsx', 2024, 'testchecksum', 3)
    ON CONFLICT DO NOTHING
  `);
  const batch = await pool.query<{ id: string }>(
    "SELECT id FROM raw_batches WHERE source_file = 'test_cdro15.xlsx' LIMIT 1"
  );
  const batchId = batch.rows[0]?.id;
  if (batchId) {
    await pool.query(`
      INSERT INTO port_imports (aduana_code, aduana_name, year, quarter, is_total, value_cif_usd, batch_id)
      VALUES
        (8, 'SALAVERRY', 2024, NULL, true, 677892207, $1),
        (8, 'SALAVERRY', 2024, 1, false, 142496417, $1),
        (1, 'MARITIMA DEL CALLAO', 2024, NULL, true, 40186664921, $1)
      ON CONFLICT DO NOTHING
    `, [batchId]);

    await pool.query(`
      INSERT INTO port_subpartida_imports
        (aduana_code, aduana_name, year, subpartida, product_desc, value_fob_usd, value_cif_usd, pct_change, pct_structure, batch_id)
      VALUES
        (8, 'SALAVERRY', 2024, '1005901100', 'MAIZ DURO AMARILLO', 207522187, 207522187, 0.1, 0.05, $1),
        (8, 'SALAVERRY', 2024, '2709000000', 'ACEITES CRUDOS DE PETROLEO', 496905950, 625687169, -0.15, 0.03, $1)
      ON CONFLICT DO NOTHING
    `, [batchId]);
  }
});

afterAll(async () => {
  await pool.query("DELETE FROM port_subpartida_imports WHERE aduana_code = 8");
  await pool.query("DELETE FROM port_imports WHERE aduana_code IN (8, 1)");
  await pool.query("DELETE FROM raw_batches WHERE source_file = 'test_cdro15.xlsx'");
  await pool.end();
});

describe("GET /api/ports", () => {
  it("devuelve todas las aduanas sin filtros", async () => {
    const res = await request(app).get("/api/ports");
    expect(res.status).toBe(200);
    expect(res.body.resultados.length).toBeGreaterThan(0);
    expect(res.body.fuente).toBe("SUNAT cdro_15");
  });

  it("filtra por aduana (case insensitive)", async () => {
    const res = await request(app).get("/api/ports?aduana=salaverry");
    expect(res.status).toBe(200);
    for (const row of res.body.resultados) {
      expect(row.aduana_name.toLowerCase()).toContain("salaverry");
    }
  });

  it("filtra por año", async () => {
    const res = await request(app).get("/api/ports?anio=2024");
    expect(res.status).toBe(200);
    for (const row of res.body.resultados) {
      expect(row.year).toBe(2024);
    }
  });

  it("devuelve totales y trimestrales por separado", async () => {
    const res = await request(app).get("/api/ports?aduana=salaverry&anio=2024");
    const totals = res.body.resultados.filter((r: { is_total: boolean }) => r.is_total);
    const quarters = res.body.resultados.filter((r: { is_total: boolean }) => !r.is_total);
    expect(totals.length).toBeGreaterThan(0);
    expect(quarters.length).toBeGreaterThan(0);
  });

  it("devuelve 400 para año malformado", async () => {
    const res = await request(app).get("/api/ports?anio=abc");
    expect(res.status).toBe(400);
  });
});

describe("GET /api/ports/subpartidas", () => {
  it("devuelve subpartidas para Salaverry", async () => {
    const res = await request(app).get("/api/ports/subpartidas?aduana=salaverry");
    expect(res.status).toBe(200);
    expect(res.body.resultados.length).toBeGreaterThan(0);
    expect(res.body.fuente).toBe("SUNAT cdro_16");
    expect(res.body.resultados[0]).toHaveProperty("subpartida");
    expect(res.body.resultados[0]).toHaveProperty("value_fob_usd");
  });

  it("filtra por subpartida", async () => {
    const res = await request(app).get("/api/ports/subpartidas?subpartida=1005901100");
    expect(res.status).toBe(200);
    expect(res.body.resultados[0]?.subpartida).toBe("1005901100");
  });
});

describe("GET /api/ports/top", () => {
  it("devuelve ranking de aduanas por volumen CIF", async () => {
    const res = await request(app).get("/api/ports/top?anio=2024");
    expect(res.status).toBe(200);
    expect(res.body.resultados.length).toBeGreaterThan(0);
    // CALLAO debería estar primero (es el de mayor volumen)
    expect(res.body.resultados[0].aduana_name.toLowerCase()).toContain("callao");
    expect(Number(res.body.resultados[0].total_cif_usd)).toBeGreaterThan(0);
  });

  it("devuelve 400 sin año", async () => {
    const res = await request(app).get("/api/ports/top");
    expect(res.status).toBe(400);
  });
});

describe("GET /api/meta/freshness", () => {
  it("devuelve metadata de última ingesta", async () => {
    const res = await request(app).get("/api/meta/freshness");
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("last_ingested_at");
    expect(res.body).toHaveProperty("stats");
    expect(res.body).toHaveProperty("fuente");
    expect(res.body.stats).toHaveProperty("port_imports_rows");
  });
});

describe("Health checks", () => {
  it("GET /health", async () => {
    const res = await request(app).get("/health");
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("ok");
  });

  it("GET /readyz", async () => {
    const res = await request(app).get("/readyz");
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("ready");
  });
});
