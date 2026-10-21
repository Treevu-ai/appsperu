/**
 * Conector CLI — MIDAGRI/Agromercado, Eventos de Articulación Comercial realizados en el 2025.
 *
 * Fuente:
 *   https://www.datosabiertos.gob.pe/sites/default/files/A0016_Mecanismo_DataSet.csv
 * CSV delimitado por `;`, con BOM UTF-8. Algunas descripciones de evento (`nom_mac`) traen
 * comillas dobles escapadas (ej. nombres de ferias entre comillas dentro del propio campo),
 * de ahí el parser quote-aware de `csv-util.ts`.
 *
 * Qué trae: ~120 eventos (ferias, ruedas de negocio, activaciones) de articulación comercial
 * en 2025, con el número de organizaciones participantes (`num_organ_mac`) -- un CONTEO, no
 * nombres de organización, así que (igual que organizaciones-distrito) este conector no hace
 * ningún match contra RUC.
 *
 * `num_mac` es único en la fuente (120/120 verificado), pero se trata igual como SNAPSHOT
 * COMPLETO (DELETE + INSERT transaccional con advisory lock) por el mismo criterio que el
 * resto de conectores de Agromercado: es un reporte de corte anual, no una tabla incremental.
 *
 * Uso:
 *   npx tsx src/ingest/agromercado-eventos-articulacion.ts
 *   npx tsx src/ingest/agromercado-eventos-articulacion.ts --dry-run
 */
import { connect } from "./db.js";
import { parseDelimitedCsv, toIntOrNull, toStrOrNull, parseDmyDate } from "./csv-util.js";
import { pathToFileURL } from "node:url";

const CSV_URL = "https://www.datosabiertos.gob.pe/sites/default/files/A0016_Mecanismo_DataSet.csv";
const BROWSER_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36";

const DDL = `
CREATE TABLE IF NOT EXISTS agromercado_eventos_articulacion (
  id                 BIGSERIAL PRIMARY KEY,
  num_evento         INTEGER,
  nombre             TEXT,
  productos          TEXT,
  tipo               TEXT,
  departamento       TEXT,
  fecha              DATE,
  alcance_mercado    TEXT,
  num_organizaciones INTEGER,
  ingested_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_agromercado_eventos_departamento ON agromercado_eventos_articulacion (departamento);
CREATE INDEX IF NOT EXISTS idx_agromercado_eventos_tipo ON agromercado_eventos_articulacion (tipo);
`;

export interface EventoRow {
  numEvento: number | null;
  nombre: string | null;
  productos: string | null;
  tipo: string | null;
  departamento: string | null;
  fecha: string | null;
  alcanceMercado: string | null;
  numOrganizaciones: number | null;
}

export function parseEventosCsv(text: string): EventoRow[] {
  const rows = parseDelimitedCsv(text);
  if (rows.length === 0) return [];
  const header = rows[0].map((h) => h.trim());
  const idx = (name: string) => header.indexOf(name);

  const iNum = idx("num_mac");
  const iNombre = idx("nom_mac");
  const iProductos = idx("productos_mac");
  const iTipo = idx("tipo_mac");
  const iDepa = idx("depa_mac");
  const iFecha = idx("fecha_mac");
  const iAlcance = idx("alcance_mercado_mac");
  const iNumOrgan = idx("num_organ_mac");

  const out: EventoRow[] = [];
  for (const cols of rows.slice(1)) {
    const nombre = toStrOrNull(cols[iNombre]);
    if (!nombre) continue; // fila sin la clave mínima (descripción del evento), se descarta
    out.push({
      numEvento: toIntOrNull(cols[iNum]),
      nombre,
      productos: toStrOrNull(cols[iProductos]),
      tipo: toStrOrNull(cols[iTipo]),
      departamento: toStrOrNull(cols[iDepa]),
      fecha: parseDmyDate(cols[iFecha]),
      alcanceMercado: toStrOrNull(cols[iAlcance]),
      numOrganizaciones: toIntOrNull(cols[iNumOrgan]),
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
  const rows = parseEventosCsv(text);
  process.stdout.write(`agromercado-eventos-articulacion: ${rows.length} filas parseadas del CSV\n`);
  if (args.dryRun) return;

  const pool = connect("actividad-agraria");
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(hashtext('agromercado_eventos_articulacion_ingest'))");
    await client.query(DDL);
    await client.query("DELETE FROM agromercado_eventos_articulacion");

    const COLS = 8;
    const values: unknown[] = [];
    const tuplas: string[] = [];
    rows.forEach((r, i) => {
      const base = i * COLS;
      tuplas.push(`(${Array.from({ length: COLS }, (_, j) => `$${base + j + 1}`).join(",")})`);
      values.push(
        r.numEvento,
        r.nombre,
        r.productos,
        r.tipo,
        r.departamento,
        r.fecha,
        r.alcanceMercado,
        r.numOrganizaciones
      );
    });
    if (tuplas.length > 0) {
      await client.query(
        `INSERT INTO agromercado_eventos_articulacion
           (num_evento, nombre, productos, tipo, departamento, fecha, alcance_mercado, num_organizaciones)
         VALUES ${tuplas.join(",")}`,
        values
      );
    }
    await client.query("COMMIT");
    process.stdout.write(`agromercado-eventos-articulacion: ${rows.length} filas insertadas (snapshot completo)\n`);
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
    console.error("agromercado-eventos-articulacion falló:", err instanceof Error ? err.message : err);
    process.exit(1);
  });
}
