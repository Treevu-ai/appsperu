/**
 * Mezcla tests puros e integración contra Postgres real.
 *
 * Los de integración siembran filas en `raw_batches`/`port_imports` y las
 * borran al final, así que necesitan una base viva. Antes no tenían guarda:
 * importaban `createApp()` en el tope del módulo, que arrastra el pool, así que
 * sin `DATABASE_URL` el archivo entero moría al cargarse. En local pasaba
 * siempre porque el `.env` de la máquina sí la tenía — el verde local no probaba
 * nada, era el mismo patrón que ya se corrigió en infraestructura-mtc.
 *
 * `findKnownAduanaCode` sí es puro (no toca el pool) y sigue corriendo en CI.
 */
import "dotenv/config";
import { describe, expect, it, beforeAll, afterAll } from "vitest";
import type { Express } from "express";
import type { Pool } from "pg";
import request from "supertest";
import XLSX from "xlsx";
import { findKnownAduanaCode, normalizeCdro16 } from "../ingest/normalize.js";

const CON_DB = Boolean(process.env.DATABASE_URL);

let app: Express;
let pool: Pool;

beforeAll(async () => {
  if (!CON_DB) return;
  // Import dinamico: `app.js` importa el pool, y cargarlo en el tope del modulo
  // dispara el throw de `db/pool.ts` aunque la suite se vaya a saltar entera.
  const [{ createApp }, { pool: p }] = await Promise.all([
    import("../app.js"),
    import("../db/pool.js"),
  ]);
  app = createApp();
  pool = p;
});

// ---------------------------------------------------------------------------
// Tests unitarios de findKnownAduanaCode
// ---------------------------------------------------------------------------
describe("findKnownAduanaCode", () => {
  it("devuelve códigos conocidos para aduanas estándar", () => {
    expect(findKnownAduanaCode("SALAVERRY")).toBe(8);
    expect(findKnownAduanaCode("MARITIMA DEL CALLAO")).toBe(1);
    expect(findKnownAduanaCode("PAITA")).toBe(5);
    expect(findKnownAduanaCode("CHIMBOTE")).toBe(11);
    expect(findKnownAduanaCode("MOLLENDO - MATARANI")).toBe(3);
  });

  it("devuelve código estable para aduanas desconocidas (idempotente)", () => {
    const c1 = findKnownAduanaCode("NUEVA ADUANA FRONTERIZA");
    const c2 = findKnownAduanaCode("NUEVA ADUANA FRONTERIZA");
    expect(c1).toBe(c2);
    expect(c1).toBeGreaterThan(0);
  });

  it("match parcial: nombre contenido en key", () => {
    expect(findKnownAduanaCode("TERMINAL SALAVERRY")).toBe(8);
  });
});

// ---------------------------------------------------------------------------
// Tests unitarios de normalizeCdro16 — regresión del bug de 2026-10-05:
// el parser asumía una columna vacía en idx 1 que no existe en el XLSX real,
// lo que desalineaba subpartida (código) con product_desc (texto) una
// posición. Esta fila es la estructura real verificada en vivo contra
// cdro_16.xlsx (fila de ACEITES CRUDOS, aduana MARITIMA DEL CALLAO).
// ---------------------------------------------------------------------------
describe("normalizeCdro16", () => {
  function sheetFromRows(rows: unknown[][]) {
    return XLSX.utils.aoa_to_sheet(rows);
  }

  it("asigna subpartida al código (no a la descripción) y product_desc al texto (no a un número)", () => {
    const filas = [
      ["header fila 0"],
      ["header fila 1"],
      ["header fila 2"],
      ["header fila 3"],
      ["Total MARITIMA DEL CALLAO"],
      [
        "MARITIMA DEL CALLAO",
        1,
        "2709000000",
        "ACEITES CRUDOS DE PETROLEO O DE MINERAL BITUMINOSO",
        2273196709.909,
        2435272906.345,
        2397740313.896,
        2557788978.214,
        0.066749,
        0.04645,
      ],
    ];
    const resultado = normalizeCdro16(sheetFromRows(filas));

    expect(resultado).toHaveLength(1);
    expect(resultado[0].subpartida).toBe("2709000000");
    expect(resultado[0].product_desc).toBe("ACEITES CRUDOS DE PETROLEO O DE MINERAL BITUMINOSO");
    expect(resultado[0].value_fob_usd).toBe(2435272906.345);
    expect(resultado[0].value_cif_usd).toBe(2557788978.214);
    expect(resultado[0].aduana_name).toBe("MARITIMA DEL CALLAO");
  });

  it("hereda el nombre de aduana del grupo 'Total XXXX' cuando la fila de detalle no repite el nombre", () => {
    const filas = [
      ["header fila 0"],
      ["header fila 1"],
      ["header fila 2"],
      ["header fila 3"],
      ["Total SALAVERRY"],
      ["", 1, "1005901100", "MAIZ DURO AMARILLO", 100, 200, 300, 400, 0.1, 0.05],
    ];
    const resultado = normalizeCdro16(sheetFromRows(filas));

    expect(resultado).toHaveLength(1);
    expect(resultado[0].aduana_name).toBe("SALAVERRY");
    expect(resultado[0].subpartida).toBe("1005901100");
    expect(resultado[0].product_desc).toBe("MAIZ DURO AMARILLO");
  });
});

// ---------------------------------------------------------------------------
// Tests de integración de API (usan seed data en beforeAll/afterAll)
// ---------------------------------------------------------------------------
beforeAll(async () => {
  if (!CON_DB) return;
  await pool.query(`
    INSERT INTO raw_batches (source_file, year, checksum, row_count)
    VALUES ('test_cdro15.xlsx', 2024, 'testchecksum', 5)
    ON CONFLICT DO NOTHING
  `);
  const b = await pool.query<{ id: string }>(
    "SELECT id FROM raw_batches WHERE source_file = 'test_cdro15.xlsx' LIMIT 1"
  );
  const batchId = b.rows[0]?.id;
  if (batchId) {
    await pool.query(`
      INSERT INTO port_imports (aduana_code, aduana_name, year, quarter, is_total, value_cif_usd, batch_id)
      VALUES
        (8, 'SALAVERRY', 2024, NULL, true, 677892207, $1),
        (8, 'SALAVERRY', 2024, 1, false, 142496417, $1),
        (8, 'SALAVERRY', 2024, 2, false, 159048246, $1),
        (1, 'MARITIMA DEL CALLAO', 2024, NULL, true, 40186664921, $1),
        (5, 'PAITA', 2024, NULL, true, 1183369988, $1)
      ON CONFLICT (aduana_code, year, quarter, is_total) DO NOTHING
    `, [batchId]);

    await pool.query(`
      INSERT INTO port_subpartida_imports
        (aduana_code, aduana_name, year, subpartida, product_desc, value_fob_usd, value_cif_usd, pct_change, pct_structure, batch_id)
      VALUES
        (8, 'SALAVERRY', 2024, '1005901100', 'MAIZ DURO AMARILLO', 207522187, 207522187, 0.10, 0.05, $1),
        (8, 'SALAVERRY', 2024, '2709000000', 'ACEITES CRUDOS DE PETROLEO', 496905950, 625687169, -0.15, 0.03, $1),
        (5, 'PAITA', 2024, '2709000000', 'ACEITES CRUDOS DE PETROLEO', 589509095, 625687169, 0.05, 0.10, $1)
      ON CONFLICT (aduana_code, year, subpartida) DO NOTHING
    `, [batchId]);
  }
});

afterAll(async () => {
  if (!CON_DB) return;
  await pool.query("DELETE FROM port_subpartida_imports WHERE aduana_code IN (8, 5)");
  await pool.query("DELETE FROM port_imports WHERE aduana_code IN (8, 1, 5)");
  await pool.query("DELETE FROM raw_batches WHERE source_file = 'test_cdro15.xlsx'");
  await pool.end();
});

describe.skipIf(!CON_DB)("GET /api/ports", () => {
  it("devuelve aduanas sin filtro", async () => {
    const res = await request(app).get("/api/ports");
    expect(res.status).toBe(200);
    expect(res.body.resultados.length).toBeGreaterThan(0);
    expect(res.body.fuente).toBe("SUNAT cdro_15");
  });

  it("filtra por nombre de aduana (case insensitive)", async () => {
    const res = await request(app).get("/api/ports?aduana=salaverry");
    expect(res.status).toBe(200);
    for (const r of res.body.resultados) {
      expect(r.aduana_name.toLowerCase()).toContain("salaverry");
    }
  });

  it("filtra por año", async () => {
    const res = await request(app).get("/api/ports?anio=2024");
    expect(res.status).toBe(200);
    for (const r of res.body.resultados) {
      expect(r.year).toBe(2024);
    }
  });

  it("devuelve totales y trimestrales separados", async () => {
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

describe.skipIf(!CON_DB)("GET /api/ports/subpartidas", () => {
  it("devuelve subpartidas de Salaverry", async () => {
    const res = await request(app).get("/api/ports/subpartidas?aduana=salaverry");
    expect(res.status).toBe(200);
    expect(res.body.resultados.length).toBeGreaterThan(0);
    expect(res.body.fuente).toBe("SUNAT cdro_16");
    expect(res.body.resultados[0]).toHaveProperty("subpartida");
    expect(res.body.resultados[0]).toHaveProperty("value_fob_usd");
  });

  it("filtra por código de subpartida", async () => {
    const res = await request(app).get("/api/ports/subpartidas?subpartida=1005901100");
    expect(res.status).toBe(200);
    expect(res.body.resultados[0]?.subpartida).toBe("1005901100");
  });
});

describe.skipIf(!CON_DB)("GET /api/ports/top", () => {
  it("devuelve ranking de aduanas por volumen CIF — CALLAO primero", async () => {
    const res = await request(app).get("/api/ports/top?anio=2024");
    expect(res.status).toBe(200);
    expect(res.body.resultados.length).toBeGreaterThan(0);
    // CALLAO tiene el mayor volumen
    expect(res.body.resultados[0].aduana_name.toLowerCase()).toContain("callao");
    expect(Number(res.body.resultados[0].total_cif_usd)).toBeGreaterThan(0);
  });

  it("devuelve 400 sin año", async () => {
    const res = await request(app).get("/api/ports/top");
    expect(res.status).toBe(400);
  });
});

describe.skipIf(!CON_DB)("GET /api/meta/freshness", () => {
  it("devuelve metadata de frescura y stats", async () => {
    const res = await request(app).get("/api/meta/freshness");
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("last_ingested_at");
    expect(res.body).toHaveProperty("stats");
    expect(res.body).toHaveProperty("fuente");
    expect(res.body.fuente).toContain("SUNAT");
    expect(res.body.stats).toHaveProperty("port_imports_rows");
  });
});

describe.skipIf(!CON_DB)("Health checks", () => {
  it("GET /health → 200 ok", async () => {
    const res = await request(app).get("/health");
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("ok");
  });

  it("GET /readyz → 200 ready", async () => {
    const res = await request(app).get("/readyz");
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("ready");
  });
});
