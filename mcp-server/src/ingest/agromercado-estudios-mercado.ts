/**
 * Conector CLI — MIDAGRI/Agromercado, Listado de Estudios Especializados al 2025.
 *
 * Fuente:
 *   https://www.datosabiertos.gob.pe/sites/default/files/A0020_EstudiosMercado_DataSet.csv
 * CSV delimitado por `;`, con BOM UTF-8.
 *
 * Qué trae: catálogo chico (5 filas verificadas el 2026-10-20) de perfiles/estudios de
 * mercado publicados por Agromercado en gob.pe, con `uri` al informe público. Sin ningún
 * dato de organización -- no aplica match a RUC.
 *
 * SNAPSHOT COMPLETO (DELETE + INSERT transaccional con advisory lock), mismo criterio que
 * el resto de conectores de Agromercado.
 *
 * Uso:
 *   npx tsx src/ingest/agromercado-estudios-mercado.ts
 *   npx tsx src/ingest/agromercado-estudios-mercado.ts --dry-run
 */
import { connect } from "./db.js";
import { parseDelimitedCsv, toIntOrNull, toStrOrNull } from "./csv-util.js";
import { pathToFileURL } from "node:url";

const CSV_URL = "https://www.datosabiertos.gob.pe/sites/default/files/A0020_EstudiosMercado_DataSet.csv";
const BROWSER_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36";

const DDL = `
CREATE TABLE IF NOT EXISTS agromercado_estudios_mercado (
  id          BIGSERIAL PRIMARY KEY,
  num_estudio INTEGER,
  anio        SMALLINT,
  mes         TEXT,
  trimestre   TEXT,
  titulo      TEXT,
  cadena      TEXT,
  region      TEXT,
  uri         TEXT,
  ingested_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
`;

export interface EstudioRow {
  numEstudio: number | null;
  anio: number | null;
  mes: string | null;
  trimestre: string | null;
  titulo: string | null;
  cadena: string | null;
  region: string | null;
  uri: string | null;
}

export function parseEstudiosCsv(text: string): EstudioRow[] {
  const rows = parseDelimitedCsv(text);
  if (rows.length === 0) return [];
  const header = rows[0].map((h) => h.trim());
  const idx = (name: string) => header.indexOf(name);

  const iNum = idx("num_estudio");
  const iAno = idx("año_estudio");
  const iMes = idx("mes_estudio");
  const iTrim = idx("trim_estudio");
  const iTitulo = idx("titulo_estudio");
  const iCadena = idx("cadena_estudio");
  const iRegion = idx("región_estudio");
  const iUri = idx("uri_estudio");

  const out: EstudioRow[] = [];
  for (const cols of rows.slice(1)) {
    const cadena = toStrOrNull(cols[iCadena]);
    if (!cadena) continue; // fila sin la clave mínima (cadena de valor del estudio), se descarta
    out.push({
      numEstudio: toIntOrNull(cols[iNum]),
      anio: toIntOrNull(cols[iAno]),
      mes: toStrOrNull(cols[iMes]),
      trimestre: toStrOrNull(cols[iTrim]),
      titulo: toStrOrNull(cols[iTitulo]),
      cadena,
      region: toStrOrNull(cols[iRegion]),
      uri: toStrOrNull(cols[iUri]),
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

interface Args {
  dryRun: boolean;
}
function parseArgs(argv: string[]): Args {
  return { dryRun: argv.includes("--dry-run") };
}

async function main() {
  const args = parseArgs(process.argv);
  const text = await fetchCsv();
  const rows = parseEstudiosCsv(text);
  process.stdout.write(`agromercado-estudios-mercado: ${rows.length} filas parseadas del CSV\n`);
  if (args.dryRun) return;

  const pool = connect("actividad-agraria");
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(hashtext('agromercado_estudios_mercado_ingest'))");
    await client.query(DDL);
    await client.query("DELETE FROM agromercado_estudios_mercado");

    const COLS = 8;
    const values: unknown[] = [];
    const tuplas: string[] = [];
    rows.forEach((r, i) => {
      const base = i * COLS;
      tuplas.push(`(${Array.from({ length: COLS }, (_, j) => `$${base + j + 1}`).join(",")})`);
      values.push(r.numEstudio, r.anio, r.mes, r.trimestre, r.titulo, r.cadena, r.region, r.uri);
    });
    if (tuplas.length > 0) {
      await client.query(
        `INSERT INTO agromercado_estudios_mercado
           (num_estudio, anio, mes, trimestre, titulo, cadena, region, uri)
         VALUES ${tuplas.join(",")}`,
        values
      );
    }
    await client.query("COMMIT");
    process.stdout.write(`agromercado-estudios-mercado: ${rows.length} filas insertadas (snapshot completo)\n`);
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
    console.error("agromercado-estudios-mercado falló:", err instanceof Error ? err.message : err);
    process.exit(1);
  });
}
