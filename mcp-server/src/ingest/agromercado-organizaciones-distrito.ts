/**
 * Conector CLI — MIDAGRI/Agromercado, Organizaciones Asistidas por Agromercado en el 2025.
 *
 * Fuente:
 *   https://www.datosabiertos.gob.pe/sites/default/files/A0012_Mapa_DataSet.csv
 * CSV delimitado por `;`, con BOM UTF-8.
 *
 * IMPORTANTE — a pesar del título del dataset ("Organizaciones Asistidas"), la fuente NO
 * trae organizaciones individuales: es un mapa agregado por distrito con un CONTEO de
 * organizaciones asistidas (`num_organaizacion_mapa`, typo de la fuente, no nuestro). No
 * hay nombre de organización que enlazar contra RUC -- a diferencia de
 * agromercado-articulacion.ts, este conector no hace ningún match de entidad.
 *
 * `ubigeo` es único en la fuente (196/196 filas verificado), pero igual se trata como
 * SNAPSHOT COMPLETO (DELETE + INSERT en una transacción con advisory lock) por consistencia
 * con el resto de conectores de Agromercado y porque la fuente es un reporte de corte anual,
 * no una tabla con altas/bajas incrementales.
 *
 * Uso:
 *   npx tsx src/ingest/agromercado-organizaciones-distrito.ts
 *   npx tsx src/ingest/agromercado-organizaciones-distrito.ts --dry-run
 */
import { connect } from "./db.js";
import { parseDelimitedCsv, toIntOrNull, toStrOrNull } from "./csv-util.js";
import { pathToFileURL } from "node:url";

const CSV_URL = "https://www.datosabiertos.gob.pe/sites/default/files/A0012_Mapa_DataSet.csv";
const BROWSER_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36";

const DDL = `
CREATE TABLE IF NOT EXISTS agromercado_organizaciones_distrito (
  id                 BIGSERIAL PRIMARY KEY,
  ubigeo             TEXT NOT NULL,
  departamento       TEXT,
  provincia          TEXT,
  distrito           TEXT,
  num_organizaciones INTEGER,
  ingested_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_agromercado_orgdist_departamento ON agromercado_organizaciones_distrito (departamento);
`;

export interface OrganizacionDistritoRow {
  ubigeo: string;
  departamento: string | null;
  provincia: string | null;
  distrito: string | null;
  numOrganizaciones: number | null;
}

export function parseOrganizacionesDistritoCsv(text: string): OrganizacionDistritoRow[] {
  const rows = parseDelimitedCsv(text);
  if (rows.length === 0) return [];
  const header = rows[0].map((h) => h.trim());
  const idx = (name: string) => header.indexOf(name);

  const iUbigeo = idx("ubigeo_mapa");
  const iDepa = idx("depa_mapa");
  const iProv = idx("prov_mapa");
  const iDis = idx("dis_mapa");
  const iNum = idx("num_organaizacion_mapa");

  const out: OrganizacionDistritoRow[] = [];
  for (const cols of rows.slice(1)) {
    const ubigeo = toStrOrNull(cols[iUbigeo]);
    if (!ubigeo) continue; // fila sin la clave mínima, se descarta
    out.push({
      ubigeo,
      departamento: toStrOrNull(cols[iDepa]),
      provincia: toStrOrNull(cols[iProv]),
      distrito: toStrOrNull(cols[iDis]),
      numOrganizaciones: toIntOrNull(cols[iNum]),
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
  const rows = parseOrganizacionesDistritoCsv(text);
  process.stdout.write(`agromercado-organizaciones-distrito: ${rows.length} filas parseadas del CSV\n`);
  if (args.dryRun) return;

  const pool = connect("actividad-agraria");
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(hashtext('agromercado_organizaciones_distrito_ingest'))");
    await client.query(DDL);
    await client.query("DELETE FROM agromercado_organizaciones_distrito");

    const COLS = 5;
    const values: unknown[] = [];
    const tuplas: string[] = [];
    rows.forEach((r, i) => {
      const base = i * COLS;
      tuplas.push(`(${Array.from({ length: COLS }, (_, j) => `$${base + j + 1}`).join(",")})`);
      values.push(r.ubigeo, r.departamento, r.provincia, r.distrito, r.numOrganizaciones);
    });
    if (tuplas.length > 0) {
      await client.query(
        `INSERT INTO agromercado_organizaciones_distrito (ubigeo, departamento, provincia, distrito, num_organizaciones)
         VALUES ${tuplas.join(",")}`,
        values
      );
    }
    await client.query("COMMIT");
    process.stdout.write(`agromercado-organizaciones-distrito: ${rows.length} filas insertadas (snapshot completo)\n`);
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
    console.error("agromercado-organizaciones-distrito falló:", err instanceof Error ? err.message : err);
    process.exit(1);
  });
}
