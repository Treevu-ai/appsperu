import { createHash } from "node:crypto";
import { pathToFileURL } from "node:url";
import { pool } from "../db/pool.js";
import {
  parseDecimal,
  parseRenipressCsv,
  pickLatestRenipressResource,
  textOrNull,
  type CkanResource,
} from "./renipress-parse.js";

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

interface CkanPackageShowResult {
  resources?: CkanResource[];
}

interface CkanPackageShowResponse {
  success: boolean;
  result: CkanPackageShowResult | CkanPackageShowResult[];
}

async function fetchLatestResource(): Promise<CkanResource> {
  const url = `${CKAN_BASE}/api/3/action/package_show?id=${encodeURIComponent(DATASET_SLUG)}`;
  const res = await fetch(url, { headers: { "User-Agent": USER_AGENT, Accept: "application/json" } });
  if (!res.ok) {
    throw new Error(`CKAN package_show devolvió ${res.status} para el dataset RENIPRESS.`);
  }

  const data = (await res.json()) as CkanPackageShowResponse;
  if (!data.success) {
    throw new Error("CKAN package_show no tuvo éxito para el dataset RENIPRESS.");
  }

  const result = Array.isArray(data.result) ? data.result[0] : data.result;
  if (!result) {
    throw new Error("CKAN package_show devolvió un resultado vacío para el dataset RENIPRESS.");
  }

  return pickLatestRenipressResource(result.resources ?? []);
}

function checksumOf(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}

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
        `INSERT INTO ipress (
           cod_ipress, institucion, nombre, clasificacion, tipo_establecimiento,
           departamento, provincia, distrito, ubigeo, direccion, categoria, estado,
           norte, este, source_batch_id, updated_at
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15, now())
         ON CONFLICT (cod_ipress) DO UPDATE SET
           institucion = EXCLUDED.institucion,
           nombre = EXCLUDED.nombre,
           clasificacion = EXCLUDED.clasificacion,
           tipo_establecimiento = EXCLUDED.tipo_establecimiento,
           departamento = EXCLUDED.departamento,
           provincia = EXCLUDED.provincia,
           distrito = EXCLUDED.distrito,
           ubigeo = EXCLUDED.ubigeo,
           direccion = EXCLUDED.direccion,
           categoria = EXCLUDED.categoria,
           estado = EXCLUDED.estado,
           norte = EXCLUDED.norte,
           este = EXCLUDED.este,
           source_batch_id = EXCLUDED.source_batch_id,
           updated_at = now()`,
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
