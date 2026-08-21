import { createHash } from "node:crypto";
import { pathToFileURL } from "node:url";
import type { PoolClient } from "pg";
import { pool } from "../db/pool.js";
import { parseHtmlRows } from "./html-table.js";
import {
  isHeaderRow,
  isInhabilitacionSectionMarker,
  isMultaSectionMarker,
  isRejected,
  normalizeInhabilitacionRow,
  normalizeMultaRow,
  type NormalizedInhabilitacion,
  type NormalizedMulta,
} from "./normalize.js";

const BASE_URL = "https://www.rnp.gob.pe/consultasenlinea/inhabilitados";
const SEARCH_URL = `${BASE_URL}/busqueda_vnv.asp`;
const EXPORT_URL = `${BASE_URL}/Reporte_Sancionados_Tribunal_vnv_xls.asp?action=enviar&valor=0`;
const USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36";

/**
 * El endpoint real usa sesión ASP clásica (cookie `ASPSESSIONID...`) y
 * `f_exportar_vnv()` no valida captcha (confirmado en el JS público del
 * sitio ni en el servidor — ver docs/data-contracts/
 * proveedores-sancionados.md). Se replica el mismo POST que dispara el
 * botón "Exportar Excel" con los campos del formulario vacíos (todos los
 * proveedores, sin filtro), reutilizando la cookie de la sesión recién
 * abierta con el GET inicial. Verificado en vivo: el archivo resultante es
 * byte-idéntico (mismo checksum) al descargado manualmente por la interfaz.
 */
async function fetchReporteHtml(): Promise<string> {
  const initialRes = await fetch(SEARCH_URL, { headers: { "User-Agent": USER_AGENT } });
  if (!initialRes.ok) {
    throw new Error(`RNP devolvió ${initialRes.status} al abrir la sesión`);
  }
  const setCookie = initialRes.headers.get("set-cookie");
  if (!setCookie) {
    throw new Error("RNP no devolvió cookie de sesión — el flujo del sitio pudo haber cambiado.");
  }
  const sessionCookie = setCookie.split(";")[0];

  const body = new URLSearchParams({
    rz: "",
    ruc: "",
    tipSanc: "",
    estVgt: "",
    captchacode: "",
    txtRuc1: "",
    hSolicitaToken: "ok",
    valor: "0",
  });

  const exportRes = await fetch(EXPORT_URL, {
    method: "POST",
    headers: {
      "User-Agent": USER_AGENT,
      "Content-Type": "application/x-www-form-urlencoded",
      Cookie: sessionCookie,
    },
    body: body.toString(),
  });

  if (!exportRes.ok) {
    throw new Error(`RNP devolvió ${exportRes.status} al exportar el reporte`);
  }
  return exportRes.text();
}

function checksumOf(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}

async function saveRawBatch(client: PoolClient, checksum: string, recordCount: number): Promise<number> {
  const result = await client.query<{ id: number }>(
    `INSERT INTO raw_sanciones_batches (filename, checksum, record_count) VALUES ($1, $2, $3) RETURNING id`,
    ["Reporte_Sancionados_Tribunal_vnv_xls.asp", checksum, recordCount]
  );
  return result.rows[0].id;
}

async function withClient<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    return await fn(client);
  } finally {
    client.release();
  }
}

const INHAB_COLUMNS = [
  "ruc",
  "razon_social",
  "resolucion",
  "periodo_inhabilitacion",
  "desde",
  "hasta",
  "infraccion",
  "otra_infraccion",
  "norma",
  "estado",
  "source_batch_id",
] as const;

async function insertInhabilitaciones(
  client: PoolClient,
  batchId: number,
  rows: NormalizedInhabilitacion[]
): Promise<void> {
  if (rows.length === 0) return;
  const byKey = new Map(rows.map((r) => [`${r.ruc}|${r.resolucion}|${r.desde}`, r]));
  const deduped = [...byKey.values()];

  const values: unknown[] = [];
  const tuples: string[] = [];
  deduped.forEach((row, i) => {
    const base = i * INHAB_COLUMNS.length;
    tuples.push(`(${INHAB_COLUMNS.map((_, j) => `$${base + j + 1}`).join(",")})`);
    values.push(
      row.ruc,
      row.razonSocial,
      row.resolucion,
      row.periodoInhabilitacion,
      row.desde,
      row.hasta,
      row.infraccion,
      row.otraInfraccion,
      row.norma,
      row.estado,
      batchId
    );
  });

  await client.query(
    `INSERT INTO inhabilitaciones (${INHAB_COLUMNS.join(",")})
     VALUES ${tuples.join(",")}
     ON CONFLICT (ruc, resolucion, desde) DO UPDATE SET
       razon_social = EXCLUDED.razon_social,
       periodo_inhabilitacion = EXCLUDED.periodo_inhabilitacion,
       hasta = EXCLUDED.hasta,
       infraccion = EXCLUDED.infraccion,
       otra_infraccion = EXCLUDED.otra_infraccion,
       norma = EXCLUDED.norma,
       estado = EXCLUDED.estado,
       source_batch_id = EXCLUDED.source_batch_id`,
    values
  );
}

const MULTA_COLUMNS = [
  "ruc",
  "razon_social",
  "resolucion",
  "fecha_resolucion",
  "monto_multa",
  "infraccion",
  "periodo_suspension",
  "desde",
  "hasta",
  "otra_infraccion",
  "norma",
  "verificacion_pago",
  "estado",
  "source_batch_id",
] as const;

async function insertMultas(client: PoolClient, batchId: number, rows: NormalizedMulta[]): Promise<void> {
  if (rows.length === 0) return;
  const byKey = new Map(rows.map((r) => [`${r.ruc}|${r.resolucion}|${r.fechaResolucion}`, r]));
  const deduped = [...byKey.values()];

  const values: unknown[] = [];
  const tuples: string[] = [];
  deduped.forEach((row, i) => {
    const base = i * MULTA_COLUMNS.length;
    tuples.push(`(${MULTA_COLUMNS.map((_, j) => `$${base + j + 1}`).join(",")})`);
    values.push(
      row.ruc,
      row.razonSocial,
      row.resolucion,
      row.fechaResolucion,
      row.montoMulta,
      row.infraccion,
      row.periodoSuspension,
      row.desde,
      row.hasta,
      row.otraInfraccion,
      row.norma,
      row.verificacionPago,
      row.estado,
      batchId
    );
  });

  await client.query(
    `INSERT INTO multas (${MULTA_COLUMNS.join(",")})
     VALUES ${tuples.join(",")}
     ON CONFLICT (ruc, resolucion, fecha_resolucion) DO UPDATE SET
       razon_social = EXCLUDED.razon_social,
       monto_multa = EXCLUDED.monto_multa,
       infraccion = EXCLUDED.infraccion,
       periodo_suspension = EXCLUDED.periodo_suspension,
       desde = EXCLUDED.desde,
       hasta = EXCLUDED.hasta,
       otra_infraccion = EXCLUDED.otra_infraccion,
       norma = EXCLUDED.norma,
       verificacion_pago = EXCLUDED.verificacion_pago,
       estado = EXCLUDED.estado,
       source_batch_id = EXCLUDED.source_batch_id`,
    values
  );
}

async function insertRejected(
  client: PoolClient,
  batchId: number,
  seccion: string,
  rejected: { raw: string[]; reason: string }[]
): Promise<void> {
  for (const bad of rejected) {
    await client.query(
      `INSERT INTO sanciones_rejected (source_batch_id, seccion, raw_row, reason) VALUES ($1, $2, $3, $4)`,
      [batchId, seccion, JSON.stringify(bad.raw), bad.reason]
    );
  }
}

const INSERT_BATCH_SIZE = 500;

export interface IngestSummary {
  batchId: number;
  totalRows: number;
  inhabilitacionesAceptadas: number;
  multasAceptadas: number;
  rechazadas: number;
}

type Seccion = "ninguna" | "inhabilitacion" | "multa";

export async function ingestSanciones(): Promise<IngestSummary> {
  const html = await fetchReporteHtml();
  const checksum = checksumOf(html);
  const allRows = parseHtmlRows(html);

  const batchId = await withClient((client) => saveRawBatch(client, checksum, allRows.length));

  let seccion: Seccion = "ninguna";
  let totalRows = 0;
  let inhabilitacionesAceptadas = 0;
  let multasAceptadas = 0;
  let rechazadas = 0;

  let inhabBuffer: NormalizedInhabilitacion[] = [];
  let multaBuffer: NormalizedMulta[] = [];
  let rejectedInhabBuffer: { raw: string[]; reason: string }[] = [];
  let rejectedMultaBuffer: { raw: string[]; reason: string }[] = [];

  for (const cells of allRows) {
    if (isInhabilitacionSectionMarker(cells)) {
      seccion = "inhabilitacion";
      continue;
    }
    if (isMultaSectionMarker(cells)) {
      seccion = "multa";
      continue;
    }
    if (isHeaderRow(cells)) continue;
    if (seccion === "ninguna") continue;

    totalRows += 1;

    if (seccion === "inhabilitacion") {
      const normalized = normalizeInhabilitacionRow(cells);
      if (isRejected(normalized)) {
        rejectedInhabBuffer.push(normalized);
        rechazadas += 1;
      } else {
        inhabBuffer.push(normalized);
        inhabilitacionesAceptadas += 1;
      }
    } else {
      const normalized = normalizeMultaRow(cells);
      if (isRejected(normalized)) {
        rejectedMultaBuffer.push(normalized);
        rechazadas += 1;
      } else {
        multaBuffer.push(normalized);
        multasAceptadas += 1;
      }
    }

    if (inhabBuffer.length >= INSERT_BATCH_SIZE) {
      await withClient((client) => insertInhabilitaciones(client, batchId, inhabBuffer));
      inhabBuffer = [];
    }
    if (multaBuffer.length >= INSERT_BATCH_SIZE) {
      await withClient((client) => insertMultas(client, batchId, multaBuffer));
      multaBuffer = [];
    }
    if (rejectedInhabBuffer.length >= INSERT_BATCH_SIZE) {
      await withClient((client) => insertRejected(client, batchId, "inhabilitacion", rejectedInhabBuffer));
      rejectedInhabBuffer = [];
    }
    if (rejectedMultaBuffer.length >= INSERT_BATCH_SIZE) {
      await withClient((client) => insertRejected(client, batchId, "multa", rejectedMultaBuffer));
      rejectedMultaBuffer = [];
    }
  }

  await withClient((client) => insertInhabilitaciones(client, batchId, inhabBuffer));
  await withClient((client) => insertMultas(client, batchId, multaBuffer));
  await withClient((client) => insertRejected(client, batchId, "inhabilitacion", rejectedInhabBuffer));
  await withClient((client) => insertRejected(client, batchId, "multa", rejectedMultaBuffer));
  await withClient((client) =>
    client.query("UPDATE raw_sanciones_batches SET record_count = $1 WHERE id = $2", [totalRows, batchId])
  );

  return { batchId, totalRows, inhabilitacionesAceptadas, multasAceptadas, rechazadas };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  ingestSanciones()
    .then((summary) => {
      console.log("Ingesta de proveedores sancionados completada:", summary);
      return pool.end();
    })
    .catch((err) => {
      console.error("Ingesta falló:", err);
      process.exit(1);
    });
}
