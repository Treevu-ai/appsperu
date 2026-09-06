import { createHash } from "node:crypto";
import { pathToFileURL } from "node:url";
import * as XLSX from "xlsx";
import type { PoolClient } from "pg";
import { pool } from "../db/pool.js";
import { normalizeAutoridadesElectas, type CanonicalAutoridad, type RejectedRow } from "./normalize.js";

const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36";

const PACKAGE_SHOW_URL =
  "https://www.datosabiertos.gob.pe/api/3/action/package_show?id=autoridades-electas-jne";

// Confirmado en vivo 2026-09-06: el dataset del JNE en la PNDA tiene DOS recursos .xls con
// esquema distinto (ver comentario de alcance en `db/migrations/001_init.sql`). El recurso
// "actual" (sin documento de identidad, el único que este conector ingiere) mantiene el mismo
// título de recurso entre cortes aunque el nombre de archivo cambie de fecha — se resuelve por
// título, no por nombre de archivo, mismo patrón que ya usan `renipress-connector.ts` /
// `infomidis-connector.ts` para recursos con nombre de archivo inestable.
const CURRENT_RESOURCE_NAME_PREFIX = "dataset reporte autoridades electas jne";

interface CkanResource {
  name: string;
  url: string;
}

interface CkanPackage {
  resources: CkanResource[];
}

// Confirmado en vivo 2026-09-06: `result` es un ARRAY (con un solo elemento aquí), no un
// objeto — un `package_show` genérico de CKAN puede devolver ambos según el dataset. El campo
// `format` del recurso tampoco es confiable (CKAN reporta `.xlsx` para un archivo que en
// realidad es un `.xls` binario legado, confirmado por firma de archivo) — se filtra solo por
// título de recurso, que sí se mantiene estable entre cortes.
async function resolveCurrentResourceUrl(): Promise<string> {
  const res = await fetch(PACKAGE_SHOW_URL, { headers: { "User-Agent": USER_AGENT } });
  if (!res.ok) {
    throw new Error(`CKAN devolvió ${res.status} al consultar ${PACKAGE_SHOW_URL}`);
  }
  const body = (await res.json()) as { result: CkanPackage | CkanPackage[] };
  const pkg = Array.isArray(body.result) ? body.result[0] : body.result;

  const candidates = pkg.resources.filter((r) => r.name.trim().toLowerCase().startsWith(CURRENT_RESOURCE_NAME_PREFIX));
  if (candidates.length === 0) {
    throw new Error(
      `No se encontró ningún recurso con título que empiece con "${CURRENT_RESOURCE_NAME_PREFIX}" en el dataset autoridades-electas-jne — el JNE pudo haber renombrado el recurso.`
    );
  }

  return candidates[0].url;
}

function checksumOf(buffer: Buffer): string {
  return createHash("sha256").update(buffer).digest("hex");
}

async function saveRawBatch(client: PoolClient, sourceUrl: string, checksum: string, recordCount: number): Promise<number> {
  const result = await client.query<{ id: number }>(
    `INSERT INTO raw_autoridades_electas_batches (source_url, checksum, record_count)
     VALUES ($1, $2, $3)
     RETURNING id`,
    [sourceUrl, checksum, recordCount]
  );
  return result.rows[0].id;
}

async function persistRejected(client: PoolClient, rejected: readonly RejectedRow[], batchId: number): Promise<void> {
  for (const bad of rejected) {
    await client.query(
      `INSERT INTO autoridades_electas_rejected (source_batch_id, raw_row, reason) VALUES ($1, $2, $3)`,
      [batchId, JSON.stringify(bad.raw), bad.reason]
    );
  }
}

async function persistRows(client: PoolClient, rows: readonly CanonicalAutoridad[], batchId: number): Promise<void> {
  for (const row of rows) {
    await client.query(
      `INSERT INTO autoridades_electas
         (nombres, apellido_paterno, apellido_materno, organizacion_politica, posicion, cargo,
          region, provincia, distrito, ubigeo, fecha_inicio_vigencia, fecha_fin_vigencia,
          proceso_electoral, anio_eleccion, pronunciamiento, fecha_publicacion, ambito, genero,
          edad, periodo, tipo_organizacion, source_batch_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22)
       ON CONFLICT (nombres, apellido_paterno, apellido_materno, cargo, proceso_electoral, ubigeo) DO UPDATE SET
         organizacion_politica = EXCLUDED.organizacion_politica,
         posicion = EXCLUDED.posicion,
         region = EXCLUDED.region,
         provincia = EXCLUDED.provincia,
         distrito = EXCLUDED.distrito,
         fecha_inicio_vigencia = EXCLUDED.fecha_inicio_vigencia,
         fecha_fin_vigencia = EXCLUDED.fecha_fin_vigencia,
         anio_eleccion = EXCLUDED.anio_eleccion,
         pronunciamiento = EXCLUDED.pronunciamiento,
         fecha_publicacion = EXCLUDED.fecha_publicacion,
         ambito = EXCLUDED.ambito,
         genero = EXCLUDED.genero,
         edad = EXCLUDED.edad,
         periodo = EXCLUDED.periodo,
         tipo_organizacion = EXCLUDED.tipo_organizacion,
         source_batch_id = EXCLUDED.source_batch_id`,
      [
        row.nombres,
        row.apellidoPaterno,
        row.apellidoMaterno,
        row.organizacionPolitica,
        row.posicion,
        row.cargo,
        row.region,
        row.provincia,
        row.distrito,
        row.ubigeo,
        row.fechaInicioVigencia,
        row.fechaFinVigencia,
        row.procesoElectoral,
        row.anioEleccion,
        row.pronunciamiento,
        row.fechaPublicacion,
        row.ambito,
        row.genero,
        row.edad,
        row.periodo,
        row.tipoOrganizacion,
        batchId,
      ]
    );
  }
}

export interface AutoridadesIngestSummary {
  sourceUrl: string;
  batchId: number;
  filasOrigen: number;
  filasInsertadas: number;
  filasRechazadas: number;
}

export async function ingestAutoridadesElectas(): Promise<AutoridadesIngestSummary> {
  const sourceUrl = await resolveCurrentResourceUrl();

  const res = await fetch(sourceUrl, { headers: { "User-Agent": USER_AGENT } });
  if (!res.ok) {
    throw new Error(`JNE/PNDA devolvió ${res.status} al descargar ${sourceUrl}`);
  }
  const buffer = Buffer.from(await res.arrayBuffer());

  const workbook = XLSX.read(buffer, { type: "buffer", cellDates: true });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const rawRows = XLSX.utils.sheet_to_json(sheet, { defval: null }) as Record<string, unknown>[];

  const { rows, rejected } = normalizeAutoridadesElectas(rawRows);

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const batchId = await saveRawBatch(client, sourceUrl, checksumOf(buffer), rawRows.length);
    await persistRows(client, rows, batchId);
    await persistRejected(client, rejected, batchId);
    await client.query("COMMIT");

    return { sourceUrl, batchId, filasOrigen: rawRows.length, filasInsertadas: rows.length, filasRechazadas: rejected.length };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  ingestAutoridadesElectas()
    .then((summary) => {
      console.log(JSON.stringify(summary, null, 2));
      return pool.end();
    })
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}
