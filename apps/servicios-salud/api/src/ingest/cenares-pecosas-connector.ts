import { createHash } from "node:crypto";
import { pathToFileURL } from "node:url";
import { fetchCkanResources } from "@appsperu/ckan-client";
import { pool } from "../db/pool.js";
import {
  parseCenaresPecosasCsv,
  parseFechaFlexibleDDMMYYYY,
  pickCenaresPecosasResource,
  textOrNull,
} from "./cenares-pecosas-parse.js";
import type { CkanResource } from "./cenares-pecosas-parse.js";

/**
 * Mismo WAF (CloudWAF) de datosabiertos.gob.pe que RENIPRESS/CENARES
 * distribución -- user-agent de navegador obligatorio, ver ADR-0018/ADR-0021.
 */
const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36";

const CKAN_BASE = "https://www.datosabiertos.gob.pe";
const DATASET_SLUG = "seguimiento-de-pecosas-del-centro-nacional-de-abastecimiento-en-recursos-estratégicos";

async function fetchResource(): Promise<CkanResource> {
  const resources = await fetchCkanResources({ ckanBase: CKAN_BASE, datasetSlug: DATASET_SLUG, userAgent: USER_AGENT });
  return pickCenaresPecosasResource(resources);
}

function checksumOf(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}

const INSERT_COLUMNS = [
  "anio_pecosa",
  "nro_pecosa",
  "fecha_pecosa",
  "codigo_siga",
  "nombre_almacen",
  "nro_pedido",
  "desc_marca_pecosa",
  "anio_oc",
  "nro_oc",
  "observacion_oc",
  "marca_oc",
  "proveedor_codigo",
  "proveedor_desc",
  "source_batch_id",
] as const;

const INSERT_BATCH_SIZE = 1000;

export interface CenaresPecosasIngestSummary {
  resourceUrl: string;
  batchId: number;
  yaIngerido: boolean;
  filasOrigen: number;
  filasInsertadas: number;
  filasRechazadas: number;
}

export async function ingestCenaresPecosas(): Promise<CenaresPecosasIngestSummary> {
  const resource = await fetchResource();

  const res = await fetch(resource.url, { headers: { "User-Agent": USER_AGENT } });
  if (!res.ok) {
    throw new Error(`CENARES Pecosas devolvió ${res.status} al descargar ${resource.url}`);
  }
  const buffer = Buffer.from(await res.arrayBuffer());
  // Mismo encoding que CENARES distribución: Latin-1, no UTF-8.
  const csvText = buffer.toString("latin1");
  const checksum = checksumOf(csvText);

  const client = await pool.connect();
  try {
    const existing = await client.query<{ id: number }>(
      `SELECT id FROM raw_cenares_pecosas_batches WHERE checksum = $1`,
      [checksum]
    );
    if (existing.rows.length > 0) {
      return {
        resourceUrl: resource.url,
        batchId: existing.rows[0].id,
        yaIngerido: true,
        filasOrigen: 0,
        filasInsertadas: 0,
        filasRechazadas: 0,
      };
    }

    const { rows, rejected } = parseCenaresPecosasCsv(csvText);
    if (rejected.length > 0) {
      console.warn(`CENARES Pecosas: ${rejected.length} fila(s) desalineada(s) descartada(s) (ver reason por fila).`);
    }

    await client.query("BEGIN");

    const batchResult = await client.query<{ id: number }>(
      `INSERT INTO raw_cenares_pecosas_batches (resource_url, checksum, record_count) VALUES ($1, $2, $3) RETURNING id`,
      [resource.url, checksum, rows.length]
    );
    const batchId = batchResult.rows[0].id;

    let inserted = 0;
    let buffer2: unknown[][] = [];

    const flush = async () => {
      if (buffer2.length === 0) return;
      const values: unknown[] = [];
      const tuples: string[] = [];
      buffer2.forEach((row, i) => {
        const base = i * INSERT_COLUMNS.length;
        tuples.push(`(${INSERT_COLUMNS.map((_, j) => `$${base + j + 1}`).join(",")})`);
        values.push(...row);
      });
      await client.query(
        `INSERT INTO cenares_pecosas (${INSERT_COLUMNS.join(",")}) VALUES ${tuples.join(",")}`,
        values
      );
      inserted += buffer2.length;
      buffer2 = [];
    };

    for (const row of rows) {
      buffer2.push([
        textOrNull(row.ANIOPECOSA),
        textOrNull(row.NROPECOSA),
        parseFechaFlexibleDDMMYYYY(row.FECHAPECOSA),
        textOrNull(row.CODIGO_SIGA),
        textOrNull(row.NOMBRE_ALM),
        textOrNull(row.NROPEDIDO),
        textOrNull(row.DESCMARCAPECOSA),
        textOrNull(row.ANIO_OC),
        textOrNull(row.NRO_OC),
        textOrNull(row.OBSERVACION_OC),
        textOrNull(row.MARCA_OC),
        textOrNull(row.PROVEEDOR),
        textOrNull(row.DESC_PROVEEDOR),
        batchId,
      ]);
      if (buffer2.length >= INSERT_BATCH_SIZE) await flush();
    }
    await flush();

    await client.query("COMMIT");
    return {
      resourceUrl: resource.url,
      batchId,
      yaIngerido: false,
      filasOrigen: rows.length,
      filasInsertadas: inserted,
      filasRechazadas: rejected.length,
    };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  ingestCenaresPecosas()
    .then((summary) => {
      console.log(JSON.stringify(summary, null, 2));
      return pool.end();
    })
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}
