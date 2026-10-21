/**
 * Conector CLI — MIDAGRI/Agromercado, Reporte de Asistencias Técnicas IV Trimestre 2025.
 *
 * Fuente (misma familia que agromercado-articulacion.ts, mismo WAF que exige User-Agent
 * de navegador):
 *   https://www.datosabiertos.gob.pe/sites/default/files/A0005_AT_DataSet.csv
 * CSV delimitado por `;`, con BOM UTF-8. A diferencia del dataset de Planes, varias filas
 * traen la columna `nombre_AT` como texto libre MULTI-LÍNEA dentro de comillas (son la
 * descripción de la asistencia prestada, no un nombre de organización) — por eso usa
 * `parseDelimitedCsv` de `csv-util.ts` (parser de texto completo, no por línea).
 *
 * Qué trae: ~9980 registros de asistencia técnica individual prestada a organizaciones
 * agroexportadoras en 2025 (tema, actividad, departamento/provincia/distrito, beneficiarios
 * directos). NO es un padrón de organizaciones -- `nombre_AT`/`codigo_AT` identifican la
 * ficha/actividad, no una organización (confirmado: `codigo_AT` NO es único, 8559/9980 --
 * varias líneas temáticas pueden compartir código de ficha). Por eso no hay enlace a RUC
 * aquí: no hay nombre de organización que matchear, a diferencia de agromercado-articulacion.
 *
 * Sin clave natural estable -> cada corrida es un SNAPSHOT COMPLETO (DELETE + INSERT en
 * una transacción con advisory lock, mismo criterio que SERFOR/SERNANP en
 * apps/catastro-forestal/api/src/ingest/serfor-connector.ts).
 *
 * Uso:
 *   npx tsx src/ingest/agromercado-asistencias-tecnicas.ts
 *   npx tsx src/ingest/agromercado-asistencias-tecnicas.ts --dry-run   # fetch+parse, no escribe
 */
import { connect } from "./db.js";
import { parseDelimitedCsv, toIntOrNull, toStrOrNull, parseDmyDate } from "./csv-util.js";
import { pathToFileURL } from "node:url";

const CSV_URL = "https://www.datosabiertos.gob.pe/sites/default/files/A0005_AT_DataSet.csv";
const BROWSER_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36";
const INSERT_BATCH_SIZE = 1000;

const DDL = `
CREATE TABLE IF NOT EXISTS agromercado_asistencias_tecnicas (
  id             BIGSERIAL PRIMARY KEY,
  num_at         INTEGER,
  codigo_at      TEXT,
  anio           SMALLINT NOT NULL,
  mes            TEXT,
  fecha          DATE,
  ubigeo         TEXT,
  departamento   TEXT,
  provincia      TEXT,
  distrito       TEXT,
  region_natural TEXT,
  actividad      TEXT,
  tematica       TEXT,
  descripcion    TEXT,
  beneficiarios  INTEGER,
  ingested_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_agromercado_at_departamento ON agromercado_asistencias_tecnicas (departamento);
CREATE INDEX IF NOT EXISTS idx_agromercado_at_tematica ON agromercado_asistencias_tecnicas (tematica);
CREATE INDEX IF NOT EXISTS idx_agromercado_at_fecha ON agromercado_asistencias_tecnicas (fecha);
`;

export interface AsistenciaRow {
  numAt: number | null;
  codigoAt: string | null;
  anio: number;
  mes: string | null;
  fecha: string | null;
  ubigeo: string | null;
  departamento: string | null;
  provincia: string | null;
  distrito: string | null;
  regionNatural: string | null;
  actividad: string | null;
  tematica: string | null;
  descripcion: string | null;
  beneficiarios: number | null;
}

/** Convierte el CSV crudo (texto completo, con BOM) a filas tipadas. Pura, testeable. */
export function parseAsistenciasCsv(text: string): AsistenciaRow[] {
  const rows = parseDelimitedCsv(text);
  if (rows.length === 0) return [];
  const header = rows[0].map((h) => h.trim());
  const idx = (name: string) => header.indexOf(name);

  const iNum = idx("num_AT");
  const iCod = idx("codigo_AT");
  const iAno = idx("ano_AT");
  const iMes = idx("mes_AT");
  const iFecha = idx("fecha_AT");
  const iUbigeo = idx("ubigeo_AT");
  const iDepa = idx("depa_AT");
  const iProv = idx("prov_AT");
  const iDis = idx("dis_AT");
  const iRegNat = idx("regNat_AT");
  const iActividad = idx("actividad_AT");
  const iTematica = idx("tematica_AT");
  const iNombre = idx("nombre_AT");
  const iBenef = idx("beneficiadosD_AT");

  const out: AsistenciaRow[] = [];
  for (const cols of rows.slice(1)) {
    const departamento = toStrOrNull(cols[iDepa]);
    const tematica = toStrOrNull(cols[iTematica]);
    if (!departamento && !tematica) continue; // fila en blanco sin ningún dato útil, se descarta
    out.push({
      numAt: toIntOrNull(cols[iNum]),
      codigoAt: toStrOrNull(cols[iCod]),
      anio: toIntOrNull(cols[iAno]) ?? new Date().getFullYear(),
      mes: toStrOrNull(cols[iMes]),
      fecha: parseDmyDate(cols[iFecha]),
      ubigeo: toStrOrNull(cols[iUbigeo]),
      departamento,
      provincia: toStrOrNull(cols[iProv]),
      distrito: toStrOrNull(cols[iDis]),
      regionNatural: toStrOrNull(cols[iRegNat]),
      actividad: toStrOrNull(cols[iActividad]),
      tematica,
      descripcion: toStrOrNull(cols[iNombre]),
      beneficiarios: toIntOrNull(cols[iBenef]),
    });
  }
  return out;
}

async function fetchCsv(): Promise<string> {
  const res = await fetch(CSV_URL, {
    headers: { "User-Agent": BROWSER_UA, Accept: "text/csv,*/*" },
    signal: AbortSignal.timeout(60_000),
  });
  if (!res.ok) throw new Error(`datosabiertos.gob.pe devolvió HTTP ${res.status}`);
  const text = await res.text();
  if (text.trimStart().startsWith("<")) {
    throw new Error("datosabiertos.gob.pe devolvió HTML (probable bloqueo WAF), no CSV");
  }
  return text;
}

const COLS = [
  "num_at",
  "codigo_at",
  "anio",
  "mes",
  "fecha",
  "ubigeo",
  "departamento",
  "provincia",
  "distrito",
  "region_natural",
  "actividad",
  "tematica",
  "descripcion",
  "beneficiarios",
] as const;

async function insertBatch(client: { query: (sql: string, params: unknown[]) => Promise<unknown> }, rows: AsistenciaRow[]): Promise<void> {
  const values: unknown[] = [];
  const tuplas: string[] = [];
  rows.forEach((r, i) => {
    const base = i * COLS.length;
    tuplas.push(`(${COLS.map((_, j) => `$${base + j + 1}`).join(",")})`);
    values.push(
      r.numAt,
      r.codigoAt,
      r.anio,
      r.mes,
      r.fecha,
      r.ubigeo,
      r.departamento,
      r.provincia,
      r.distrito,
      r.regionNatural,
      r.actividad,
      r.tematica,
      r.descripcion,
      r.beneficiarios
    );
  });
  await client.query(`INSERT INTO agromercado_asistencias_tecnicas (${COLS.join(",")}) VALUES ${tuplas.join(",")}`, values);
}

interface Args {
  dryRun: boolean;
}
function parseArgs(argv: string[]): Args {
  return { dryRun: argv.includes("--dry-run") };
}

async function main() {
  const args = parseArgs(process.argv);
  const text = await fetchCsv();
  const rows = parseAsistenciasCsv(text);
  process.stdout.write(`agromercado-asistencias-tecnicas: ${rows.length} filas parseadas del CSV\n`);
  if (args.dryRun) return;

  const pool = connect("actividad-agraria");
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(hashtext('agromercado_asistencias_tecnicas_ingest'))");
    await client.query(DDL);
    await client.query("DELETE FROM agromercado_asistencias_tecnicas");
    for (let i = 0; i < rows.length; i += INSERT_BATCH_SIZE) {
      await insertBatch(client, rows.slice(i, i + INSERT_BATCH_SIZE));
    }
    await client.query("COMMIT");
    process.stdout.write(`agromercado-asistencias-tecnicas: ${rows.length} filas insertadas (snapshot completo)\n`);
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

const esEjecucionDirecta =
  process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;

if (esEjecucionDirecta) {
  main().catch((err) => {
    console.error("agromercado-asistencias-tecnicas falló:", err instanceof Error ? err.message : err);
    process.exit(1);
  });
}
