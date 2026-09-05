import { createHash } from "node:crypto";
import { pathToFileURL } from "node:url";
import { pool } from "../db/pool.js";

/**
 * SBN — Supervisión de predios estatales. Dataset alterno al registro
 * completo SINABIP (ese vive solo en un enlace de Google Drive que está
 * roto — verificado en vivo 2026-09-04, "No se encontró la página"). Este
 * CSV sí es real y descargable, cubre solo predios efectivamente
 * supervisados por SBN (~1,800 registros nacionales desde 2019), no el
 * universo completo de predios estatales.
 *
 * El servidor de datosabiertos.gob.pe está detrás de un WAF que bloquea
 * requests sin un User-Agent de navegador (responde 418 "访问被拦截"). No es
 * autenticación real — un header normal de navegador basta.
 */

const CSV_URL = "https://www.datosabiertos.gob.pe/sites/default/files/Supervisi%C3%B3n%20de%20predios%20estatales.csv";
const USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36";

function checksumOf(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}

function parseFecha(value: string): string | null {
  const [dd, mm, yyyy] = value.split("/");
  if (!dd || !mm || !yyyy) return null;
  return `${yyyy}-${mm.padStart(2, "0")}-${dd.padStart(2, "0")}`;
}

function parseNumero(value: string): number | null {
  const n = Number(value.replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

interface SupervisionRow {
  item: number;
  tipoInforme: string;
  numeroInforme: string;
  fechaEmision: string | null;
  actividad: string;
  departamento: string;
  provincia: string;
  distrito: string;
  cus: string | null;
  areaSupervisadaM2: number | null;
  resultadoSupervision: string;
  titularPredio: string;
  zonaPlayaProtegida: boolean;
}

function parseCsv(text: string): SupervisionRow[] {
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  const rows: SupervisionRow[] = [];
  for (const line of lines.slice(1)) {
    const cols = line.split(";");
    if (cols.length < 13) continue;
    const [item, tipoInforme, numeroInforme, fechaEmision, actividad, departamento, provincia, distrito, cus, area, resultado, titular, playa] = cols;
    rows.push({
      item: Number(item),
      tipoInforme: tipoInforme.trim(),
      numeroInforme: numeroInforme.trim(),
      fechaEmision: parseFecha(fechaEmision.trim()),
      actividad: actividad.trim(),
      departamento: departamento.trim(),
      provincia: provincia.trim(),
      distrito: distrito.trim(),
      cus: cus.trim() === "SIN CUS" ? null : cus.trim(),
      areaSupervisadaM2: parseNumero(area.trim()),
      resultadoSupervision: resultado.trim(),
      titularPredio: titular.trim(),
      zonaPlayaProtegida: playa.trim().toUpperCase().startsWith("S"),
    });
  }
  return rows;
}

export interface SbnSupervisionIngestSummary {
  rowsTotal: number;
  rowsUpserted: number;
  batchId: number;
}

export async function ingestSbnSupervision(): Promise<SbnSupervisionIngestSummary> {
  const res = await fetch(CSV_URL, { headers: { "User-Agent": USER_AGENT, Accept: "text/csv,*/*" } });
  if (!res.ok) throw new Error(`SBN supervisión devolvió ${res.status}`);
  const buffer = Buffer.from(await res.arrayBuffer());
  // El archivo viene en Latin-1 (ISO-8859-1), no UTF-8 — confirmado por los
  // acentos rotos al decodificar como UTF-8 directo.
  const csvText = buffer.toString("latin1");
  const rows = parseCsv(csvText);
  const checksum = checksumOf(csvText);

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const { rows: existing } = await client.query<{ id: number }>(
      `SELECT id FROM raw_sbn_supervision_batches WHERE source_url = $1 AND checksum = $2`,
      [CSV_URL, checksum]
    );
    let batchId: number;
    if (existing.length > 0) {
      batchId = existing[0].id;
    } else {
      const { rows: inserted } = await client.query<{ id: number }>(
        `INSERT INTO raw_sbn_supervision_batches (source_url, checksum, record_count)
         VALUES ($1, $2, $3) RETURNING id`,
        [CSV_URL, checksum, rows.length]
      );
      batchId = inserted[0].id;
    }

    let upserted = 0;
    for (const r of rows) {
      await client.query(
        `INSERT INTO sbn_supervision_predios (
           item, tipo_informe, numero_informe, fecha_emision, actividad,
           departamento, provincia, distrito, cus, area_supervisada_m2,
           resultado_supervision, titular_predio, zona_playa_protegida, source_batch_id
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
         ON CONFLICT (numero_informe, cus) DO UPDATE SET
           resultado_supervision = EXCLUDED.resultado_supervision,
           area_supervisada_m2 = EXCLUDED.area_supervisada_m2,
           source_batch_id = EXCLUDED.source_batch_id`,
        [
          r.item, r.tipoInforme, r.numeroInforme, r.fechaEmision, r.actividad,
          r.departamento, r.provincia, r.distrito, r.cus, r.areaSupervisadaM2,
          r.resultadoSupervision, r.titularPredio, r.zonaPlayaProtegida, batchId,
        ]
      );
      upserted += 1;
    }

    await client.query("COMMIT");
    return { rowsTotal: rows.length, rowsUpserted: upserted, batchId };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  ingestSbnSupervision()
    .then((summary) => console.log(JSON.stringify(summary, null, 2)))
    .finally(() => pool.end())
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}
