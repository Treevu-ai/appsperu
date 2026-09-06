import { createHash } from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import unzipper from "unzipper";
import { DBFFile } from "dbffile";
import type { PoolClient } from "pg";
import { pool } from "../db/pool.js";
import { normalizeInstituciones, type CanonicalInstitucion, type RejectedRow } from "./normalize.js";

const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36";

const LISTADO_URL = "https://escale.minedu.gob.pe/listadosrie/";
const DBF_ENTRY_NAME = "Padron_web.dbf";
const INSERT_BATCH_SIZE = 1000;

/**
 * El listado (`listadosrie/`) no enlaza el ZIP directamente — cada corte es una página
 * intermedia de Liferay (`document_library_display/.../<id>`) que sí trae el link real del
 * ZIP (`documents/10156/958881/Padron_web_<AAAAMMDD>.zip`). Confirmado en vivo 2026-09-06: los
 * `<id>` numéricos de las páginas intermedias son crecientes en el tiempo (78101 < 78201 <
 * 78301 < 78401 para los 4 cortes de agosto 2026) — se toma el mayor como "más reciente" en vez
 * de asumir un patrón de nombre de archivo por fecha, que no está garantizado.
 */
/** El portal (Liferay) codifica algunos enlaces como entidades HTML hexadecimales (`&#x3a;` = `:`, etc.) en vez de `href` planos — hay que decodificarlas antes de aplicar cualquier regex sobre el HTML. */
function decodeHexEntities(html: string): string {
  return html.replace(/&#x([0-9a-fA-F]+);/g, (_, hex: string) => String.fromCharCode(parseInt(hex, 16)));
}

async function resolveLatestZipUrl(): Promise<string> {
  const listRes = await fetch(LISTADO_URL, { headers: { "User-Agent": USER_AGENT } });
  if (!listRes.ok) {
    throw new Error(`MINEDU devolvió ${listRes.status} al listar ${LISTADO_URL}`);
  }
  const listHtml = decodeHexEntities(await listRes.text());

  const landingPattern = /document_library_display\/0SeF\/view\/958881\/(\d+)/g;
  const candidates = [...listHtml.matchAll(landingPattern)].map((m) => ({
    id: Number(m[1]),
    url: `https://escale.minedu.gob.pe/listadosrie/-/document_library_display/0SeF/view/958881/${m[1]}`,
  }));
  if (candidates.length === 0) {
    throw new Error(`No se encontró ninguna página de corte en ${LISTADO_URL} — el portal pudo haber cambiado de estructura.`);
  }
  candidates.sort((a, b) => b.id - a.id);
  const latest = candidates[0];

  const landingRes = await fetch(latest.url, { headers: { "User-Agent": USER_AGENT } });
  if (!landingRes.ok) {
    throw new Error(`MINEDU devolvió ${landingRes.status} al abrir ${latest.url}`);
  }
  const landingHtml = decodeHexEntities(await landingRes.text());

  const zipMatch = landingHtml.match(/https:\/\/escale\.minedu\.gob\.pe\/documents\/10156\/958881\/Padron_web_\d{8}\.zip(?:\?version=[\d.]+)?/);
  if (!zipMatch) {
    throw new Error(`No se encontró el enlace del ZIP dentro de ${latest.url} — el portal pudo haber cambiado de estructura.`);
  }
  return zipMatch[0];
}

async function downloadZip(url: string, destPath: string): Promise<void> {
  const res = await fetch(url, { headers: { "User-Agent": USER_AGENT } });
  if (!res.ok || !res.body) {
    throw new Error(`MINEDU devolvió ${res.status} al descargar ${url}`);
  }
  const { Readable } = await import("node:stream");
  const fileStream = createWriteStream(destPath);
  await new Promise<void>((resolve, reject) => {
    const nodeStream = Readable.fromWeb(res.body as import("node:stream/web").ReadableStream);
    nodeStream.pipe(fileStream);
    nodeStream.on("error", reject);
    fileStream.on("finish", resolve);
    fileStream.on("error", reject);
  });
}

/** El DBF pesa ~287MB descomprimido — se extrae a un archivo temporal, `dbffile` no soporta leer desde un stream/buffer. */
async function extractDbf(zipPath: string, destPath: string): Promise<void> {
  const directory = await unzipper.Open.file(zipPath);
  const entry = directory.files.find((f) => f.path === DBF_ENTRY_NAME);
  if (!entry) {
    throw new Error(`El ZIP no contiene la entrada esperada "${DBF_ENTRY_NAME}" — formato inesperado.`);
  }
  await new Promise<void>((resolve, reject) => {
    const writeStream = createWriteStream(destPath);
    entry.stream().pipe(writeStream);
    writeStream.on("finish", resolve);
    writeStream.on("error", reject);
  });
}

function checksumOf(filePath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = createHash("sha256");
    const stream = createReadStream(filePath);
    stream.on("data", (chunk: string | Buffer) => hash.update(chunk));
    stream.on("end", () => resolve(hash.digest("hex")));
    stream.on("error", reject);
  });
}

async function withClient<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    return await fn(client);
  } finally {
    client.release();
  }
}

async function saveRawBatch(sourceUrl: string, checksum: string): Promise<number> {
  return withClient(async (client) => {
    const result = await client.query<{ id: number }>(
      `INSERT INTO raw_padron_batches (source_url, checksum, record_count) VALUES ($1, $2, 0) RETURNING id`,
      [sourceUrl, checksum]
    );
    return result.rows[0].id;
  });
}

const INSERT_COLUMNS = [
  "cod_mod", "anexo", "cod_local", "cod_inst", "nombre", "nivel_modalidad", "forma",
  "tipo_sexo", "gestion", "gestion_dependencia", "direccion", "localidad", "cod_ccpp",
  "centro_poblado", "area_censo", "ubigeo", "departamento", "provincia", "distrito", "dre",
  "cod_ugel", "ugel", "latitud", "longitud", "tipo_programa", "turno", "ruc", "razon_social",
  "estado", "fecha_actualizacion", "source_batch_id",
] as const;

async function insertBatch(client: PoolClient, batchId: number, rows: readonly CanonicalInstitucion[]): Promise<void> {
  if (rows.length === 0) return;

  const values: unknown[] = [];
  const tuples: string[] = [];
  rows.forEach((row, i) => {
    const base = i * INSERT_COLUMNS.length;
    tuples.push(`(${INSERT_COLUMNS.map((_, j) => `$${base + j + 1}`).join(",")})`);
    values.push(
      row.codMod, row.anexo, row.codLocal, row.codInst, row.nombre, row.nivelModalidad, row.forma,
      row.tipoSexo, row.gestion, row.gestionDependencia, row.direccion, row.localidad, row.codCcpp,
      row.centroPoblado, row.areaCenso, row.ubigeo, row.departamento, row.provincia, row.distrito, row.dre,
      row.codUgel, row.ugel, row.latitud, row.longitud, row.tipoPrograma, row.turno, row.ruc, row.razonSocial,
      row.estado, row.fechaActualizacion, batchId
    );
  });

  await client.query(
    `INSERT INTO instituciones_educativas (${INSERT_COLUMNS.join(",")})
     VALUES ${tuples.join(",")}
     ON CONFLICT (cod_mod, anexo) DO UPDATE SET
       cod_local = EXCLUDED.cod_local, cod_inst = EXCLUDED.cod_inst, nombre = EXCLUDED.nombre,
       nivel_modalidad = EXCLUDED.nivel_modalidad, forma = EXCLUDED.forma, tipo_sexo = EXCLUDED.tipo_sexo,
       gestion = EXCLUDED.gestion, gestion_dependencia = EXCLUDED.gestion_dependencia,
       direccion = EXCLUDED.direccion, localidad = EXCLUDED.localidad, cod_ccpp = EXCLUDED.cod_ccpp,
       centro_poblado = EXCLUDED.centro_poblado, area_censo = EXCLUDED.area_censo, ubigeo = EXCLUDED.ubigeo,
       departamento = EXCLUDED.departamento, provincia = EXCLUDED.provincia, distrito = EXCLUDED.distrito,
       dre = EXCLUDED.dre, cod_ugel = EXCLUDED.cod_ugel, ugel = EXCLUDED.ugel, latitud = EXCLUDED.latitud,
       longitud = EXCLUDED.longitud, tipo_programa = EXCLUDED.tipo_programa, turno = EXCLUDED.turno,
       ruc = EXCLUDED.ruc, razon_social = EXCLUDED.razon_social, estado = EXCLUDED.estado,
       fecha_actualizacion = EXCLUDED.fecha_actualizacion, source_batch_id = EXCLUDED.source_batch_id`,
    values
  );
}

async function insertRejectedBatch(client: PoolClient, batchId: number, rejected: readonly RejectedRow[]): Promise<void> {
  if (rejected.length === 0) return;
  for (const bad of rejected) {
    await client.query(`INSERT INTO instituciones_educativas_rejected (source_batch_id, raw_row, reason) VALUES ($1, $2, $3)`, [
      batchId,
      JSON.stringify(bad.raw),
      bad.reason,
    ]);
  }
}

export interface IngestSummary {
  sourceUrl: string;
  batchId: number;
  filasOrigen: number;
  filasInsertadas: number;
  filasRechazadas: number;
}

export async function ingestPadronEducativo(): Promise<IngestSummary> {
  const sourceUrl = await resolveLatestZipUrl();
  const tempDir = await mkdtemp(path.join(tmpdir(), "padron-ie-"));

  try {
    const zipPath = path.join(tempDir, "padron.zip");
    await downloadZip(sourceUrl, zipPath);

    const dbfPath = path.join(tempDir, "Padron_web.dbf");
    await extractDbf(zipPath, dbfPath);

    const checksum = await checksumOf(dbfPath);
    const batchId = await saveRawBatch(sourceUrl, checksum);

    const dbf = await DBFFile.open(dbfPath, { encoding: "cp850" });

    let filasOrigen = 0;
    let filasInsertadas = 0;
    let filasRechazadas = 0;
    let rawBuffer: Record<string, unknown>[] = [];

    const flush = async () => {
      if (rawBuffer.length === 0) return;
      const { rows, rejected } = normalizeInstituciones(rawBuffer);
      await withClient((client) => insertBatch(client, batchId, rows));
      await withClient((client) => insertRejectedBatch(client, batchId, rejected));
      filasInsertadas += rows.length;
      filasRechazadas += rejected.length;
      rawBuffer = [];
    };

    for await (const record of dbf) {
      filasOrigen += 1;
      rawBuffer.push(record as Record<string, unknown>);
      if (rawBuffer.length >= INSERT_BATCH_SIZE) {
        await flush();
      }
      if (filasOrigen % 20_000 === 0) {
        console.log(`[padron-educativo] ${filasOrigen} filas leídas...`);
      }
    }
    await flush();

    await withClient((client) =>
      client.query("UPDATE raw_padron_batches SET record_count = $1 WHERE id = $2", [filasInsertadas, batchId])
    );

    return { sourceUrl, batchId, filasOrigen, filasInsertadas, filasRechazadas };
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  ingestPadronEducativo()
    .then((summary) => {
      console.log(JSON.stringify(summary, null, 2));
      return pool.end();
    })
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}
