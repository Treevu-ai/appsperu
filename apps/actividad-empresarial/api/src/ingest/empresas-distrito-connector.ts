import { createHash } from "node:crypto";
import { pathToFileURL } from "node:url";
import { pool } from "../db/pool.js";
import {
  MONTH_COLUMNS,
  extractYearFromResourceName,
  parseCount,
  parseEmpresasCsv,
  pickEmpresasResource,
  textOrNull,
  type CkanResource,
} from "./empresas-distrito-parse.js";

/**
 * Mismo WAF, mismo requisito de User-Agent que el resto de conectores
 * contra datosabiertos.gob.pe (confirmado en vivo, ver ADR-0018/ADR-0021).
 */
const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36";

const CKAN_BASE = "https://www.datosabiertos.gob.pe";
const DATASET_SLUG = "empresas-en-el-sector-privado-por-mes-según-distritos-ministerio-de-trabajo-y-promoción-del";

interface CkanPackageShowResult {
  resources?: CkanResource[];
}

interface CkanPackageShowResponse {
  success: boolean;
  result: CkanPackageShowResult | CkanPackageShowResult[];
}

async function fetchResource(): Promise<{ resource: CkanResource; warning: string | null }> {
  const url = `${CKAN_BASE}/api/3/action/package_show?id=${encodeURIComponent(DATASET_SLUG)}`;
  const res = await fetch(url, { headers: { "User-Agent": USER_AGENT, Accept: "application/json" } });
  if (!res.ok) {
    throw new Error(`CKAN package_show devolvió ${res.status} para el dataset de empresas del sector privado.`);
  }

  const data = (await res.json()) as CkanPackageShowResponse;
  if (!data.success) {
    throw new Error("CKAN package_show no tuvo éxito para el dataset de empresas del sector privado.");
  }

  const result = Array.isArray(data.result) ? data.result[0] : data.result;
  if (!result) {
    throw new Error("CKAN package_show devolvió un resultado vacío para el dataset de empresas del sector privado.");
  }

  return pickEmpresasResource(result.resources ?? []);
}

function checksumOf(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}

export interface EmpresasIngestSummary {
  resourceUrl: string;
  anio: number;
  batchId: number;
  filasOrigen: number;
  filasInsertadas: number;
  filasSinUbigeo: number;
  advertenciaRecurso: string | null;
}

export async function ingestEmpresasDistrito(): Promise<EmpresasIngestSummary> {
  const { resource, warning } = await fetchResource();
  if (warning) console.warn(`[empresas-distrito-connector] ${warning}`);

  const anio = extractYearFromResourceName(resource.name);
  if (!anio) {
    throw new Error(`No se pudo extraer el año del nombre del recurso: "${resource.name}". No se asume un año por defecto.`);
  }

  const res = await fetch(resource.url, { headers: { "User-Agent": USER_AGENT } });
  if (!res.ok) {
    throw new Error(`MTPE devolvió ${res.status} al descargar ${resource.url}`);
  }
  const buffer = Buffer.from(await res.arrayBuffer());
  // Confirmado en vivo: Latin-1 (byte 0xD1 en "NEPEÑA" solo decodifica bien así).
  const csvText = buffer.toString("latin1");
  const rows = parseEmpresasCsv(csvText);

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const checksum = checksumOf(csvText);
    const batchResult = await client.query<{ id: number }>(
      `INSERT INTO raw_mtpe_batches (resource_url, checksum, record_count)
       VALUES ($1, $2, $3)
       ON CONFLICT (resource_url, checksum) DO UPDATE SET fetched_at = now()
       RETURNING id`,
      [resource.url, checksum, rows.length]
    );
    const batchId = batchResult.rows[0].id;

    let inserted = 0;
    let sinUbigeo = 0;

    for (const row of rows) {
      const ubigeo = textOrNull(row.CODIGO_DE_UBIGEO);
      if (!ubigeo) {
        sinUbigeo += 1;
        continue;
      }
      const distrito = textOrNull(row.DISTRITOS);

      for (let mesIdx = 0; mesIdx < MONTH_COLUMNS.length; mesIdx += 1) {
        const mes = mesIdx + 1;
        const numeroEmpresas = parseCount(row[MONTH_COLUMNS[mesIdx]]);

        await client.query(
          `INSERT INTO empresas_privadas_distrito (ubigeo, anio, mes, distrito, numero_empresas, source_batch_id, updated_at)
           VALUES ($1,$2,$3,$4,$5,$6, now())
           ON CONFLICT (ubigeo, anio, mes) DO UPDATE SET
             distrito = EXCLUDED.distrito,
             numero_empresas = EXCLUDED.numero_empresas,
             source_batch_id = EXCLUDED.source_batch_id,
             updated_at = now()`,
          [ubigeo, anio, mes, distrito, numeroEmpresas, batchId]
        );
      }
      inserted += 1;
    }

    await client.query("COMMIT");
    return {
      resourceUrl: resource.url,
      anio,
      batchId,
      filasOrigen: rows.length,
      filasInsertadas: inserted,
      filasSinUbigeo: sinUbigeo,
      advertenciaRecurso: warning,
    };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  ingestEmpresasDistrito()
    .then((summary) => {
      console.log(JSON.stringify(summary, null, 2));
      return pool.end();
    })
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}
