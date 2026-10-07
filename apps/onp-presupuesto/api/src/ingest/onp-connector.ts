import { createHash } from "node:crypto";
import { pathToFileURL } from "node:url";
import { parse } from "csv-parse/sync";
import { fetchCkanResources, type CkanResource } from "@appsperu/ckan-client";
import { pool } from "../db/pool.js";

/** Mismo WAF (CloudWAF) de `datosabiertos.gob.pe` que el resto de conectores CKAN del repo. */
const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36";

const CKAN_BASE = "https://www.datosabiertos.gob.pe";
/**
 * ONP publica un dataset CKAN nuevo por año calendario ("...-2024", "...-2025",
 * "...-2026") en vez de reutilizar un slug fijo con recursos acumulados —
 * confirmado en vivo 2026-10-07 (el dataset "-2025" solo tiene recursos de
 * 2025). Cuando aparezca el dataset "-2026", este slug deja de traer datos
 * nuevos y hay que actualizarlo a mano — no hay forma de descubrir el slug
 * del año siguiente sin buscarlo en datosabiertos.gob.pe (sin API de listado
 * por organización confiable para esto).
 */
const DATASET_SLUG = "ejecución-presupuestal-de-los-regímenes-administrados-por-onp-2025";
const DATASET_NAME = "onp_ejecucion_presupuestal_regimenes";

function checksumOf(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}

function pickLatestResource(resources: CkanResource[]): CkanResource {
  if (resources.length === 0) {
    throw new Error(`ONP: el dataset "${DATASET_SLUG}" no tiene recursos.`);
  }
  return [...resources].sort((a, b) => (a.created ?? "").localeCompare(b.created ?? "")).at(-1)!;
}

interface RawRow {
  Año: string;
  Descripción: string;
  Fuente: string;
  Ejecutado: string;
}

/**
 * " 22,462,929 " → 22462929; " -   " o "" (sin dígitos) → 0 — la fuente usa
 * "-" como notación estándar de "sin ejecución", no como dato faltante.
 */
function parseEjecutado(value: string): number {
  const digits = value.replace(/[^0-9.-]/g, "");
  if (digits === "" || digits === "-") return 0;
  const n = Number(digits.replace(/,/g, ""));
  return Number.isNaN(n) ? 0 : n;
}

async function fetchRows(): Promise<{ raw: string; resource: CkanResource; rows: RawRow[] }> {
  const resources = await fetchCkanResources({ ckanBase: CKAN_BASE, datasetSlug: DATASET_SLUG, userAgent: USER_AGENT });
  const resource = pickLatestResource(resources);

  const res = await fetch(resource.url, { headers: { "User-Agent": USER_AGENT } });
  if (!res.ok) throw new Error(`ONP devolvió ${res.status} al descargar ${resource.url}`);
  const buffer = Buffer.from(await res.arrayBuffer());
  // Confirmado en vivo: Latin-1/Windows-1252 (Año/Descripción se corrompen como UTF-8).
  const raw = buffer.toString("latin1");

  // La fuente antepone 2 líneas de título/vacía antes del encabezado real.
  const rows = parse(raw, {
    columns: true,
    delimiter: ",",
    from_line: 3,
    trim: true,
    skip_empty_lines: true,
    relax_column_count: true,
  }) as RawRow[];

  return { raw, resource, rows };
}

async function ingestOnp(): Promise<{ batchId: number; filasInsertadas: number; resourceUrl: string }> {
  const { raw, resource, rows } = await fetchRows();

  const client = await pool.connect();
  try {
    const { rows: batchRows } = await client.query<{ id: number }>(
      `INSERT INTO raw_onp_batches (dataset, source_url, checksum, record_count) VALUES ($1, $2, $3, $4) RETURNING id`,
      [DATASET_NAME, resource.url, checksumOf(raw), rows.length]
    );
    const batchId = batchRows[0].id;

    let filasInsertadas = 0;
    await client.query("BEGIN");
    try {
      for (const row of rows) {
        const anio = Number.parseInt(row.Año, 10);
        if (Number.isNaN(anio)) continue;

        await client.query(
          `INSERT INTO ejecucion_presupuestal_onp (anio, descripcion, fuente, ejecutado, source_batch_id)
           VALUES ($1,$2,$3,$4,$5)`,
          [anio, row.Descripción, row.Fuente, parseEjecutado(row.Ejecutado), batchId]
        );
        filasInsertadas++;
      }
      await client.query("COMMIT");
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    }

    return { batchId, filasInsertadas, resourceUrl: resource.url };
  } finally {
    client.release();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  ingestOnp()
    .then((summary) => {
      console.log(JSON.stringify(summary, null, 2));
      return pool.end();
    })
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}
