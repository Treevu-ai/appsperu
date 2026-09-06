import { createHash } from "node:crypto";
import { pathToFileURL } from "node:url";
import { fetchCkanResources } from "@appsperu/ckan-client";
import { pool } from "../db/pool.js";
import { parseDecimal, parseRenipressCsv, pickLatestRenipressResource, textOrNull } from "./renipress-parse.js";
import type { CkanResource } from "./renipress-parse.js";

/**
 * El WAF de datosabiertos.gob.pe (CloudWAF) devuelve HTTP 418 al user-agent
 * por defecto de fetch/curl — confirmado en vivo durante el spike de
 * ADR-0018. Sin este header, tanto `package_show` como la descarga del CSV
 * fallan silenciosamente con un 418, no con un error de red obvio.
 */
const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36";

const CKAN_BASE = "https://www.datosabiertos.gob.pe";
const DATASET_SLUG = "registro-nacional-de-entidades-prestadoras-de-servicios-de-salud-renipress";

async function fetchLatestResource(): Promise<CkanResource> {
  const resources = await fetchCkanResources({ ckanBase: CKAN_BASE, datasetSlug: DATASET_SLUG, userAgent: USER_AGENT });
  return pickLatestRenipressResource(resources);
}

function checksumOf(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}

/**
 * `cod_ipress` es la clave de conflicto — no aparece en `UPSERT_COLUMNS`
 * porque nunca se reasigna en el UPDATE. El resto de columnas, en el orden
 * exacto en que se pasan como parámetros más abajo, define tanto la lista de
 * columnas del INSERT como el SET del ON CONFLICT.
 */
const UPSERT_COLUMNS = [
  "institucion",
  "nombre",
  "clasificacion",
  "tipo_establecimiento",
  "departamento",
  "provincia",
  "distrito",
  "ubigeo",
  "direccion",
  "categoria",
  "estado",
  "norte",
  "este",
  "source_batch_id",
] as const;

const INSERT_COLUMNS = ["cod_ipress", ...UPSERT_COLUMNS];
const UPSERT_QUERY = `INSERT INTO ipress (${INSERT_COLUMNS.join(", ")}, updated_at)
   VALUES (${INSERT_COLUMNS.map((_, i) => `$${i + 1}`).join(",")}, now())
   ON CONFLICT (cod_ipress) DO UPDATE SET
     ${UPSERT_COLUMNS.map((c) => `${c} = EXCLUDED.${c}`).join(",\n     ")},
     updated_at = now()`;

export interface RenipressIngestSummary {
  resourceUrl: string;
  batchId: number;
  filasOrigen: number;
  filasInsertadas: number;
  filasSinCodIpress: number;
  filasSinUbigeo: number;
}

export async function ingestRenipress(): Promise<RenipressIngestSummary> {
  const resource = await fetchLatestResource();

  const res = await fetch(resource.url, { headers: { "User-Agent": USER_AGENT } });
  if (!res.ok) {
    throw new Error(`RENIPRESS devolvió ${res.status} al descargar ${resource.url}`);
  }
  const buffer = Buffer.from(await res.arrayBuffer());
  // Confirmado en vivo: UTF-8 con BOM (a diferencia de INFOMIDIS, que es Latin-1).
  const csvText = buffer.toString("utf-8");
  const rows = parseRenipressCsv(csvText);

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const checksum = checksumOf(csvText);
    const batchResult = await client.query<{ id: number }>(
      `INSERT INTO raw_renipress_batches (resource_url, checksum, record_count)
       VALUES ($1, $2, $3)
       ON CONFLICT (resource_url, checksum) DO UPDATE SET fetched_at = now()
       RETURNING id`,
      [resource.url, checksum, rows.length]
    );
    const batchId = batchResult.rows[0].id;

    let inserted = 0;
    let sinCodIpress = 0;
    let sinUbigeo = 0;

    for (const row of rows) {
      const codIpress = textOrNull(row.COD_IPRESS);
      if (!codIpress) {
        sinCodIpress += 1;
        continue;
      }

      const ubigeo = textOrNull(row.UBIGEO);
      if (!ubigeo) sinUbigeo += 1;

      await client.query(
        UPSERT_QUERY,
        // Orden alineado a mano con INSERT_COLUMNS ($1=cod_ipress, luego UPSERT_COLUMNS en orden).
        [
          codIpress,
          textOrNull(row.INSTITUCION),
          textOrNull(row.NOMBRE) ?? "",
          textOrNull(row.CLASIFICACION),
          textOrNull(row.TIPO_ESTABLECIMIENTO),
          textOrNull(row.DEPARTAMENTO),
          textOrNull(row.PROVINCIA),
          textOrNull(row.DISTRITO),
          ubigeo,
          textOrNull(row.DIRECCION),
          textOrNull(row.CATEGORIA),
          textOrNull(row.ESTADO),
          parseDecimal(row.NORTE),
          parseDecimal(row.ESTE),
          batchId,
        ]
      );
      inserted += 1;
    }

    await client.query("COMMIT");
    return {
      resourceUrl: resource.url,
      batchId,
      filasOrigen: rows.length,
      filasInsertadas: inserted,
      filasSinCodIpress: sinCodIpress,
      filasSinUbigeo: sinUbigeo,
    };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  ingestRenipress()
    .then((summary) => {
      console.log(JSON.stringify(summary, null, 2));
      return pool.end();
    })
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}
