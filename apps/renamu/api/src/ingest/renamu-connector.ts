import { createHash } from "node:crypto";
import { pathToFileURL } from "node:url";
import { parse } from "csv-parse/sync";
import unzipper from "unzipper";
import type { PoolClient } from "pg";
import { pool } from "../db/pool.js";
import {
  normalizeMunicipalidades,
  normalizeVehiculos,
  normalizeConectividad,
  type CanonicalMunicipalidad,
  type RejectedRow,
} from "./normalize.js";

const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36";

// Confirmado en vivo 2026-09-06: `inei.gob.pe/media/DATOS_ABIERTOS/RENAMU/DATA/<año>.zip`
// es el patrón real de descarga (fuera del patrón `datosabiertos.gob.pe/sites/default/files/...`
// que usa el resto del catálogo). El ZIP trae una sola carpeta con un CSV y un PDF de
// diccionario; el nombre de la carpeta cambia entre años (`928-Modulo1814` en 2024), así
// que el conector busca el primer `.csv` dentro del ZIP en vez de asumir una ruta fija.
function fileUrlFor(anio: number): string {
  return `https://www.inei.gob.pe/media/DATOS_ABIERTOS/RENAMU/DATA/${anio}.zip`;
}

function checksumOf(buffer: Buffer): string {
  return createHash("sha256").update(buffer).digest("hex");
}

async function extractCsvFromZip(zipBuffer: Buffer): Promise<string> {
  const directory = await unzipper.Open.buffer(zipBuffer);
  const csvEntry = directory.files.find(
    (entry) => entry.type === "File" && entry.path.toLowerCase().endsWith(".csv")
  );
  if (!csvEntry) {
    throw new Error("El ZIP de RENAMU no contiene ningún archivo .csv.");
  }
  const buffer = await csvEntry.buffer();
  return buffer.toString("utf-8");
}

async function saveRawBatch(client: PoolClient, anio: number, sourceUrl: string, checksum: string, recordCount: number): Promise<number> {
  const result = await client.query<{ id: number }>(
    `INSERT INTO raw_renamu_batches (anio, source_url, checksum, record_count)
     VALUES ($1, $2, $3, $4)
     RETURNING id`,
    [anio, sourceUrl, checksum, recordCount]
  );
  return result.rows[0].id;
}

async function persistRejected(client: PoolClient, rejected: readonly RejectedRow[], batchId: number): Promise<void> {
  for (const bad of rejected) {
    await client.query(
      `INSERT INTO renamu_municipalidades_rejected (source_batch_id, raw_row, reason) VALUES ($1, $2, $3)`,
      [batchId, JSON.stringify(bad.raw), bad.reason]
    );
  }
}

async function persistMunicipalidad(
  client: PoolClient,
  municipio: CanonicalMunicipalidad,
  raw: Record<string, unknown>,
  batchId: number
): Promise<void> {
  const { rows } = await client.query<{ id: number }>(
    `INSERT INTO renamu_municipalidades (anio, idmunici, ubigeo, departamento, provincia, distrito, tipomuni, source_batch_id)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
     ON CONFLICT (idmunici, anio) DO UPDATE SET
       ubigeo = EXCLUDED.ubigeo,
       departamento = EXCLUDED.departamento,
       provincia = EXCLUDED.provincia,
       distrito = EXCLUDED.distrito,
       tipomuni = EXCLUDED.tipomuni,
       source_batch_id = EXCLUDED.source_batch_id
     RETURNING id`,
    [municipio.anio, municipio.idmunici, municipio.ubigeo, municipio.departamento, municipio.provincia, municipio.distrito, municipio.tipomuni, batchId]
  );
  const municipioId = rows[0].id;

  for (const item of normalizeVehiculos(raw)) {
    await client.query(
      `INSERT INTO renamu_vehiculos
         (municipio_id, item_codigo, item_descripcion, tiene, cantidad_operativa, cantidad_no_operativa, especifique, source_batch_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
       ON CONFLICT (municipio_id, item_codigo) DO UPDATE SET
         tiene = EXCLUDED.tiene,
         cantidad_operativa = EXCLUDED.cantidad_operativa,
         cantidad_no_operativa = EXCLUDED.cantidad_no_operativa,
         especifique = EXCLUDED.especifique,
         source_batch_id = EXCLUDED.source_batch_id`,
      [municipioId, item.itemCodigo, item.itemDescripcion, item.tiene, item.cantidadOperativa, item.cantidadNoOperativa, item.especifique, batchId]
    );
  }

  const conectividad = normalizeConectividad(raw);
  if (conectividad) {
    await client.query(
      `INSERT INTO renamu_conectividad
         (municipio_id, tiene_linea_fija, lineas_fijas, tiene_linea_movil, lineas_moviles, tiene_internet, computadoras_con_internet, tipo_conexion_codigo, source_batch_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
       ON CONFLICT (municipio_id) DO UPDATE SET
         tiene_linea_fija = EXCLUDED.tiene_linea_fija,
         lineas_fijas = EXCLUDED.lineas_fijas,
         tiene_linea_movil = EXCLUDED.tiene_linea_movil,
         lineas_moviles = EXCLUDED.lineas_moviles,
         tiene_internet = EXCLUDED.tiene_internet,
         computadoras_con_internet = EXCLUDED.computadoras_con_internet,
         tipo_conexion_codigo = EXCLUDED.tipo_conexion_codigo,
         source_batch_id = EXCLUDED.source_batch_id`,
      [
        municipioId,
        conectividad.tieneLineaFija,
        conectividad.lineasFijas,
        conectividad.tieneLineaMovil,
        conectividad.lineasMoviles,
        conectividad.tieneInternet,
        conectividad.computadorasConInternet,
        conectividad.tipoConexionCodigo,
        batchId,
      ]
    );
  }
}

export interface RenamuIngestSummary {
  anio: number;
  batchId: number;
  filasOrigen: number;
  filasInsertadas: number;
  filasRechazadas: number;
}

export async function ingestRenamu(anio: number): Promise<RenamuIngestSummary> {
  const sourceUrl = fileUrlFor(anio);
  const res = await fetch(sourceUrl, { headers: { "User-Agent": USER_AGENT } });
  if (!res.ok) {
    throw new Error(`INEI devolvió ${res.status} al descargar ${sourceUrl}`);
  }
  const zipBuffer = Buffer.from(await res.arrayBuffer());
  const csvText = await extractCsvFromZip(zipBuffer);

  const rawRows = parse(csvText, {
    columns: true,
    delimiter: ";",
    bom: true,
    trim: true,
    skip_empty_lines: true,
    relax_column_count: true,
  }) as Record<string, unknown>[];

  const { rows, rejected } = normalizeMunicipalidades(rawRows);
  const rowsByIdmunici = new Map(rawRows.map((raw) => [String(raw["idmunici"]), raw]));

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const batchId = await saveRawBatch(client, anio, sourceUrl, checksumOf(zipBuffer), rawRows.length);

    for (const municipio of rows) {
      const raw = rowsByIdmunici.get(municipio.idmunici);
      if (raw) await persistMunicipalidad(client, municipio, raw, batchId);
    }
    await persistRejected(client, rejected, batchId);

    await client.query("COMMIT");
    return { anio, batchId, filasOrigen: rawRows.length, filasInsertadas: rows.length, filasRechazadas: rejected.length };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const anio = Number(process.argv[2] ?? new Date().getFullYear() - 2);
  ingestRenamu(anio)
    .then((summary) => {
      console.log(JSON.stringify(summary, null, 2));
      return pool.end();
    })
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}
