import { createHash } from "node:crypto";
import { pathToFileURL } from "node:url";
import type { PoolClient } from "pg";
import { pool } from "../db/pool.js";
import {
  INEI_DEPARTMENTS,
  VERTIX_SERVICE_URL,
  normalizeVertixProject,
  type NormalizedPrivateProject,
  type VertixApiResponse,
} from "./normalize.js";

const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36";

const EMPTY_FILTER_FIELDS = {
  NombreProyecto: "",
  TipoProyectoList: "",
  SectorList: "",
  EstadoList: "",
  DepartamentoList: "",
  TipologiaList: "",
  AnioList: "",
  EntidadList: "",
  GreenBrownList: "",
  SituacionActualList: "",
  TipoIniciativaList: "",
  ModalidadList: "",
} as const;

function checksumOf(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}

export async function fetchVertixPage(options: {
  page?: number;
  pageLimit?: number;
  departamentoList?: string;
}): Promise<VertixApiResponse> {
  const form = new FormData();
  form.set("Lan", "es");
  form.set("Page", String(options.page ?? 1));
  form.set("PageLimit", String(options.pageLimit ?? Number(process.env.VERTIX_PAGE_LIMIT ?? 500)));
  form.set("NombreProyecto", EMPTY_FILTER_FIELDS.NombreProyecto);
  form.set("TipoProyectoList", EMPTY_FILTER_FIELDS.TipoProyectoList);
  form.set("SectorList", EMPTY_FILTER_FIELDS.SectorList);
  form.set("EstadoList", EMPTY_FILTER_FIELDS.EstadoList);
  form.set("DepartamentoList", options.departamentoList ?? EMPTY_FILTER_FIELDS.DepartamentoList);
  form.set("TipologiaList", EMPTY_FILTER_FIELDS.TipologiaList);
  form.set("AnioList", EMPTY_FILTER_FIELDS.AnioList);
  form.set("EntidadList", EMPTY_FILTER_FIELDS.EntidadList);
  form.set("GreenBrownList", EMPTY_FILTER_FIELDS.GreenBrownList);
  form.set("SituacionActualList", EMPTY_FILTER_FIELDS.SituacionActualList);
  form.set("TipoIniciativaList", EMPTY_FILTER_FIELDS.TipoIniciativaList);
  form.set("ModalidadList", EMPTY_FILTER_FIELDS.ModalidadList);

  const res = await fetch(VERTIX_SERVICE_URL, {
    method: "POST",
    headers: { "User-Agent": USER_AGENT },
    body: form,
  });

  if (!res.ok) {
    throw new Error(`VERTIX vertixService.php devolvió HTTP ${res.status}.`);
  }

  const data = (await res.json()) as VertixApiResponse;
  if (data.Code !== 1 || !Array.isArray(data.Data)) {
    throw new Error(`VERTIX respondió con error: ${data.Message ?? "payload inválido"}`);
  }

  return data;
}

export async function buildDepartamentoIndex(pageLimit: number): Promise<Map<number, string[]>> {
  const index = new Map<number, string[]>();

  for (const dept of INEI_DEPARTMENTS) {
    const response = await fetchVertixPage({ pageLimit, departamentoList: dept.code });
    for (const project of response.Data ?? []) {
      const existing = index.get(project.Id) ?? [];
      if (!existing.includes(dept.code)) {
        existing.push(dept.code);
        index.set(project.Id, existing);
      }
    }
  }

  return index;
}

async function saveRawBatch(
  client: PoolClient,
  recordsTotal: number,
  checksum: string,
  payload: unknown
): Promise<number> {
  const { rows } = await client.query<{ id: number }>(
    `INSERT INTO raw_vertix_batches (records_total, checksum, payload)
     VALUES ($1, $2, $3)
     RETURNING id`,
    [recordsTotal, checksum, JSON.stringify(payload)]
  );
  return rows[0].id;
}

async function upsertProject(client: PoolClient, batchId: number, row: NormalizedPrivateProject): Promise<void> {
  await client.query(
    `INSERT INTO private_investment_projects (
       vertix_id, slug, tipo_proyecto, id_tipo_proyecto, nombre, nombre_corto, estado, fase, id_fase,
       titular, sector, cartera, modalidad, modalidad_contractual, iniciativa,
       monto_inversion_sigv, monto_proyecto, green_brownfield, buena_pro_prevista, anho_concesion,
       departamentos_inei, departamentos, url_thumb, url_geo, source_batch_id, updated_at
     ) VALUES (
       $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25, now()
     )
     ON CONFLICT (vertix_id) DO UPDATE SET
       slug = EXCLUDED.slug,
       tipo_proyecto = EXCLUDED.tipo_proyecto,
       id_tipo_proyecto = EXCLUDED.id_tipo_proyecto,
       nombre = EXCLUDED.nombre,
       nombre_corto = EXCLUDED.nombre_corto,
       estado = EXCLUDED.estado,
       fase = EXCLUDED.fase,
       id_fase = EXCLUDED.id_fase,
       titular = EXCLUDED.titular,
       sector = EXCLUDED.sector,
       cartera = EXCLUDED.cartera,
       modalidad = EXCLUDED.modalidad,
       modalidad_contractual = EXCLUDED.modalidad_contractual,
       iniciativa = EXCLUDED.iniciativa,
       monto_inversion_sigv = EXCLUDED.monto_inversion_sigv,
       monto_proyecto = EXCLUDED.monto_proyecto,
       green_brownfield = EXCLUDED.green_brownfield,
       buena_pro_prevista = EXCLUDED.buena_pro_prevista,
       anho_concesion = EXCLUDED.anho_concesion,
       departamentos_inei = EXCLUDED.departamentos_inei,
       departamentos = EXCLUDED.departamentos,
       url_thumb = EXCLUDED.url_thumb,
       url_geo = EXCLUDED.url_geo,
       source_batch_id = EXCLUDED.source_batch_id,
       updated_at = now()`,
    [
      row.vertixId,
      row.slug,
      row.tipoProyecto,
      row.idTipoProyecto,
      row.nombre,
      row.nombreCorto,
      row.estado,
      row.fase,
      row.idFase,
      row.titular,
      row.sector,
      row.cartera,
      row.modalidad,
      row.modalidadContractual,
      row.iniciativa,
      row.montoInversionSigv,
      row.montoProyecto,
      row.greenBrownfield,
      row.buenaProPrevista,
      row.anhoConcesion,
      row.departamentosInei,
      row.departamentos,
      row.urlThumb,
      row.urlGeo,
      batchId,
    ]
  );
}

/**
 * Borra los proyectos que no vinieron en el batch actual (su
 * `source_batch_id` sigue apuntando a un batch anterior porque el upsert de
 * este batch no los tocó) — evita que proyectos que salen de cartera
 * queden huérfanos en la base para siempre. Cada corrida trae el universo
 * nacional completo (`ingestVertixPortfolio` no filtra por departamento),
 * así que "no vino en este batch" equivale a "ya no está en cartera VERTIX".
 * Mismo criterio que `gis-connector.ts` (ver ADR-0013, sección "Limpieza de
 * geometrías obsoletas").
 */
async function deleteStaleProjects(client: PoolClient, batchId: number): Promise<number> {
  const { rowCount } = await client.query(`DELETE FROM private_investment_projects WHERE source_batch_id != $1`, [
    batchId,
  ]);
  return rowCount ?? 0;
}

export interface IngestSummary {
  batchId: number;
  recordsTotal: number;
  rowsUpserted: number;
  isPartial: boolean;
  deletedStale: number;
}

export async function ingestVertixPortfolio(): Promise<IngestSummary> {
  const pageLimit = Number(process.env.VERTIX_PAGE_LIMIT ?? 500);
  const national = await fetchVertixPage({ pageLimit });
  const recordsTotal = national.RecordsTotal ?? (national.Data ?? []).length;
  const deptIndex = await buildDepartamentoIndex(pageLimit);

  const normalized = (national.Data ?? []).map((raw) => normalizeVertixProject(raw, deptIndex));
  const payload = { recordsTotal, projects: national.Data };
  const checksum = checksumOf(JSON.stringify(payload));

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const batchId = await saveRawBatch(client, recordsTotal, checksum, payload);
    for (const row of normalized) {
      await upsertProject(client, batchId, row);
    }
    const isPartial = normalized.length < recordsTotal;
    // Solo purga si el lote llegó completo — con un lote parcial (por un
    // corte en la fuente, no por diseño) borrar lo que "faltó" eliminaría
    // proyectos reales que simplemente no llegaron en esta corrida.
    const deletedStale = isPartial ? 0 : await deleteStaleProjects(client, batchId);
    await client.query("COMMIT");

    return {
      batchId,
      recordsTotal,
      rowsUpserted: normalized.length,
      isPartial,
      deletedStale,
    };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  ingestVertixPortfolio()
    .then((summary) => console.log("Ingesta VERTIX (PROINVERSIÓN) completada:", summary))
    .finally(async () => {
      await pool.end();
    })
    .catch((error) => {
      console.error("Ingesta VERTIX falló:", error);
      process.exitCode = 1;
    });
}
