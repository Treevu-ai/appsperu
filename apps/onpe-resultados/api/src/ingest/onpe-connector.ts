import { createHash } from "node:crypto";
import { pathToFileURL } from "node:url";
import { pool } from "../db/pool.js";

const SOURCE_URL = "https://www.datosabiertos.gob.pe/sites/default/files/SER2022_Gobernador_Vicegobernador.csv";
const DATASET = "ERM2022_Gobernador_Vicegobernador_2da_vuelta";
const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36";

interface Row {
  ubigeo: string | null;
  departamento: string;
  provincia: string;
  distrito: string;
  tipoEleccion: string;
  mesa: string;
  estadoMesa: string;
  tipoAgrupacion: string;
  codigoAgrupacion: string;
  agrupacionPolitica: string;
  votosObtenidos: number;
  electoresHabiles: number | null;
  votosBlancos: number | null;
  votosNulos: number | null;
  votosImpugnados: number | null;
}

function toIntOrNull(value: string): number | null {
  const n = Number(value.trim());
  return value.trim() === "" || Number.isNaN(n) ? null : n;
}

function parseCsv(text: string): Row[] {
  const clean = text.replace(/^﻿/, "");
  const lines = clean.split(/\r?\n/).filter((l) => l.trim().length > 0);
  const rows: Row[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(";");
    if (cols.length < 16) continue;
    rows.push({
      ubigeo: cols[0].trim() || null,
      departamento: cols[1].trim(),
      provincia: cols[2].trim(),
      distrito: cols[3].trim(),
      tipoEleccion: cols[4].trim(),
      mesa: cols[5].trim(),
      estadoMesa: cols[6].trim(),
      tipoAgrupacion: cols[8].trim(),
      codigoAgrupacion: cols[9].trim(),
      agrupacionPolitica: cols[10].trim(),
      votosObtenidos: toIntOrNull(cols[11]) ?? 0,
      electoresHabiles: toIntOrNull(cols[12]),
      votosBlancos: toIntOrNull(cols[13]),
      votosNulos: toIntOrNull(cols[14]),
      votosImpugnados: toIntOrNull(cols[15]),
    });
  }
  return rows;
}

async function ingestOnpe(): Promise<{ batchId: number; filasInsertadas: number }> {
  const res = await fetch(SOURCE_URL, { headers: { "User-Agent": USER_AGENT } });
  if (!res.ok) {
    throw new Error(`ONPE devolvió ${res.status} al descargar ${SOURCE_URL}`);
  }
  const text = await res.text();
  const rows = parseCsv(text);
  const checksum = createHash("sha256").update(text).digest("hex");

  // Commits por lote de 500 (no una transacción única para 47K filas) -- una
  // sola conexión Postgres sostenida por decenas de minutos de inserts fila
  // por fila terminó en "Connection terminated unexpectedly"/ECONNRESET en
  // vivo (confirmado 2026-10-01, mismo patrón que RENIEC). Lotes cortos con
  // su propia conexión evitan sostener un socket abierto tanto tiempo.
  const BATCH_SIZE = 500;
  const metaClient = await pool.connect();
  let batchId: number;
  try {
    const { rows: batchRows } = await metaClient.query<{ id: number }>(
      `INSERT INTO raw_onpe_batches (dataset, source_url, checksum, record_count) VALUES ($1, $2, $3, $4) RETURNING id`,
      [DATASET, SOURCE_URL, checksum, rows.length]
    );
    batchId = batchRows[0].id;
  } finally {
    metaClient.release();
  }

  let inserted = 0;
  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const slice = rows.slice(i, i + BATCH_SIZE);
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      for (const row of slice) {
        await client.query(
          `INSERT INTO resultados_mesa
             (ubigeo, departamento, provincia, distrito, tipo_eleccion, mesa, estado_mesa,
              tipo_agrupacion, codigo_agrupacion, agrupacion_politica, votos_obtenidos,
              electores_habiles, votos_blancos, votos_nulos, votos_impugnados, source_batch_id)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
           ON CONFLICT (tipo_eleccion, mesa, codigo_agrupacion) DO UPDATE SET
             ubigeo = EXCLUDED.ubigeo, departamento = EXCLUDED.departamento, provincia = EXCLUDED.provincia,
             distrito = EXCLUDED.distrito, estado_mesa = EXCLUDED.estado_mesa,
             tipo_agrupacion = EXCLUDED.tipo_agrupacion, agrupacion_politica = EXCLUDED.agrupacion_politica,
             votos_obtenidos = EXCLUDED.votos_obtenidos, electores_habiles = EXCLUDED.electores_habiles,
             votos_blancos = EXCLUDED.votos_blancos, votos_nulos = EXCLUDED.votos_nulos,
             votos_impugnados = EXCLUDED.votos_impugnados, source_batch_id = EXCLUDED.source_batch_id`,
          [
            row.ubigeo, row.departamento, row.provincia, row.distrito, row.tipoEleccion, row.mesa,
            row.estadoMesa, row.tipoAgrupacion, row.codigoAgrupacion, row.agrupacionPolitica,
            row.votosObtenidos, row.electoresHabiles, row.votosBlancos, row.votosNulos, row.votosImpugnados,
            batchId,
          ]
        );
      }
      await client.query("COMMIT");
      inserted += slice.length;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }
  return { batchId, filasInsertadas: inserted };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  ingestOnpe()
    .then((summary) => {
      console.log(JSON.stringify(summary, null, 2));
      return pool.end();
    })
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}
