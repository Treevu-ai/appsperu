/**
 * Conector CLI — UN Comtrade (benchmark externo de comercio).
 *
 * Fuente (verificada en vivo el 2026-10-14, SIN API key, endpoint preview):
 *   https://comtradeapi.un.org/public/v1/preview/C/A/HS
 *     ?reporterCode=604&period=2024&partnerCode=0,842,156&cmdCode=TOTAL,04&flowCode=X
 * Acepta varios valores por parámetro separados por coma, así que un request
 * cubre un reporter × año × flujo × (todos los partners y capítulos pedidos).
 *
 * Qué trae y para qué: flujos de exportación/importación de Perú (y de países
 * comparadores opcionales) por partner y capítulo arancelario, en USD — el
 * benchmark externo que permite calcular ventaja comparativa revelada y cuota
 * de mercado contra competidores, que las fuentes nacionales (BCRP, SUNAT)
 * agregan y no permiten.
 *
 * Escribe en la base de la app `bcrp-comercio-exterior` (dominio: comercio
 * exterior). Sin app Express propia: conector + handler MCP + catálogo.
 *
 * Uso:
 *   npx tsx src/ingest/comtrade-benchmark.ts                       # defaults
 *   npx tsx src/ingest/comtrade-benchmark.ts --reporters 604,218   # Perú y Ecuador
 *   npx tsx src/ingest/comtrade-benchmark.ts --dry-run             # fetch, no escribe
 */
import { connect } from "./db.js";
import { pathToFileURL } from "node:url";

const API = "https://comtradeapi.un.org/public/v1/preview/C/A/HS";
const ANIOS_DEFAULT = [2019, 2020, 2021, 2022, 2023, 2024];
const FLUJOS_DEFAULT = ["X", "M"];
const REPORTERS_DEFAULT = ["604"]; // 604 = Perú
const PARTNERS_DEFAULT = ["0", "842", "156", "76", "152", "484", "124", "724", "392", "410", "276", "380", "218", "170", "699"];
const CMD_DEFAULT = ["TOTAL", "01", "02", "04", "07", "08", "09", "10", "12", "15", "16", "20", "22", "24", "27", "28", "29", "30", "38", "39", "40", "44", "47", "48", "52", "54", "55", "57", "61", "62", "63", "64", "69", "70", "71", "72", "73", "74", "76", "84", "85", "86", "87", "90", "94", "95"];
const DELAY_MS = 400;

const DDL = `
CREATE TABLE IF NOT EXISTS comtrade_flujos (
  id             BIGSERIAL PRIMARY KEY,
  anio           SMALLINT NOT NULL,
  flujo          TEXT NOT NULL,
  reporter_code  TEXT NOT NULL,
  partner_code   TEXT NOT NULL,
  cmd_code       TEXT NOT NULL,
  fob_usd        NUMERIC(20, 2),
  cif_usd        NUMERIC(20, 2),
  primary_usd    NUMERIC(20, 2),
  net_wgt_kg     NUMERIC(20, 3),
  es_estimado    BOOLEAN NOT NULL DEFAULT false,
  es_agregado    BOOLEAN NOT NULL DEFAULT false,
  fetched_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (anio, flujo, reporter_code, partner_code, cmd_code)
);

CREATE INDEX IF NOT EXISTS idx_comtrade_reporter_anio
  ON comtrade_flujos (reporter_code, anio, flujo);
CREATE INDEX IF NOT EXISTS idx_comtrade_partner
  ON comtrade_flujos (partner_code);
CREATE INDEX IF NOT EXISTS idx_comtrade_cmd
  ON comtrade_flujos (cmd_code);
`;

export interface ComtradeFila {
  anio: number;
  flujo: string;
  reporterCode: string;
  partnerCode: string;
  cmdCode: string;
  fobUsd: number | null;
  cifUsd: number | null;
  primaryUsd: number | null;
  netWgtKg: number | null;
  esEstimado: boolean;
  esAgregado: boolean;
}

interface ComtradeApiRow {
  refYear: number;
  flowCode: string;
  reporterCode: number;
  partnerCode: number;
  cmdCode: string;
  fobvalue: number | null;
  cifvalue: number | null;
  primaryValue: number | null;
  netWgt: number | null;
  isNetWgtEstimated: boolean;
  isAggregate: boolean;
}

/**
 * Convierte una fila del preview de Comtrade a la fila propia. Pura para poder
 * testearla con el JSON real capturado de la API (los nulls de reporterDesc /
 * cmdDesc del preview se resuelven con códigos: acá se guarda el código).
 */
export function normalizarComtrade(row: ComtradeApiRow): ComtradeFila | null {
  if (!Number.isInteger(row.refYear) || !row.flowCode) return null;
  return {
    anio: row.refYear,
    flujo: row.flowCode,
    reporterCode: String(row.reporterCode),
    partnerCode: String(row.partnerCode),
    cmdCode: String(row.cmdCode),
    fobUsd: row.fobvalue ?? null,
    cifUsd: row.cifvalue ?? null,
    primaryUsd: row.primaryValue ?? null,
    netWgtKg: row.netWgt ?? null,
    esEstimado: Boolean(row.isNetWgtEstimated),
    esAgregado: Boolean(row.isAggregate),
  };
}

export function buildUrl(opts: {
  reporter: string;
  anio: number;
  flujo: string;
  partners: string[];
  cmds: string[];
}): string {
  const params = new URLSearchParams({
    reporterCode: opts.reporter,
    period: String(opts.anio),
    partnerCode: opts.partners.join(","),
    cmdCode: opts.cmds.join(","),
    flowCode: opts.flujo,
  });
  return `${API}?${params.toString()}`;
}

async function fetchComtrade(url: string): Promise<ComtradeApiRow[]> {
  // Timeout explícito: sin él, un request colgado deja el conector vivo para
  // siempre (se observó en el dry-run de WDI) y la corrida nunca termina.
  const res = await fetch(url, { signal: AbortSignal.timeout(60_000) });
  if (!res.ok) throw new Error(`Comtrade devolvió HTTP ${res.status}`);
  const body = (await res.json()) as { data?: ComtradeApiRow[]; error?: unknown };
  if (body.error) throw new Error(`Comtrade devolvió error: ${JSON.stringify(body.error)}`);
  return body.data ?? [];
}

interface Args {
  anios: number[];
  flujos: string[];
  reporters: string[];
  partners: string[];
  cmds: string[];
  dryRun: boolean;
}

function parseArgs(argv: string[]): Args {
  const args: Args = {
    anios: ANIOS_DEFAULT,
    flujos: FLUJOS_DEFAULT,
    reporters: REPORTERS_DEFAULT,
    partners: PARTNERS_DEFAULT,
    cmds: CMD_DEFAULT,
    dryRun: false,
  };
  const lista = (raw: string | undefined, fallback: string[]) =>
    (raw ?? "").split(",").map((s) => s.trim()).filter(Boolean).length > 0
      ? (raw as string).split(",").map((s) => s.trim()).filter(Boolean)
      : fallback;
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--dry-run") args.dryRun = true;
    else if (a === "--years") {
      const v = (argv[++i] ?? "").split(",").map((s) => Number(s.trim())).filter((n) => Number.isInteger(n));
      if (v.length > 0) args.anios = v;
    }
    else if (a === "--flujos") args.flujos = lista(argv[++i], FLUJOS_DEFAULT);
    else if (a === "--reporters") args.reporters = lista(argv[++i], REPORTERS_DEFAULT);
    else if (a === "--partners") args.partners = lista(argv[++i], PARTNERS_DEFAULT);
    else if (a === "--cmds") args.cmds = lista(argv[++i], CMD_DEFAULT);
  }
  return args;
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function main() {
  const args = parseArgs(process.argv);
  const pool = args.dryRun ? null : connect("bcrp-comercio-exterior");
  if (pool) await pool.query(DDL);

  let insertadas = 0;
  let requests = 0;
  try {
    for (const reporter of args.reporters) {
      for (const anio of args.anios) {
        for (const flujo of args.flujos) {
          const url = buildUrl({ reporter, anio, flujo, partners: args.partners, cmds: args.cmds });
          const rows = (await fetchComtrade(url)).map(normalizarComtrade).filter((r): r is ComtradeFila => r !== null);
          requests += 1;
          if (pool) {
            for (let i = 0; i < rows.length; i += 500) {
              const lote = rows.slice(i, i + 500);
              const valores: unknown[] = [];
              const tuplas: string[] = [];
              for (const r of lote) {
                const base = valores.length;
                tuplas.push(
                  `(${Array.from({ length: 11 }, (_, j) => `$${base + j + 1}`).join(",")})`
                );
                valores.push(
                  r.anio, r.flujo, r.reporterCode, r.partnerCode, r.cmdCode,
                  r.fobUsd, r.cifUsd, r.primaryUsd, r.netWgtKg, r.esEstimado, r.esAgregado
                );
              }
              const res = await pool.query(
                `INSERT INTO comtrade_flujos
                   (anio, flujo, reporter_code, partner_code, cmd_code, fob_usd, cif_usd,
                    primary_usd, net_wgt_kg, es_estimado, es_agregado)
                 VALUES ${tuplas.join(",")}
                 ON CONFLICT (anio, flujo, reporter_code, partner_code, cmd_code) DO UPDATE SET
                   fob_usd = EXCLUDED.fob_usd, cif_usd = EXCLUDED.cif_usd,
                   primary_usd = EXCLUDED.primary_usd, net_wgt_kg = EXCLUDED.net_wgt_kg,
                   es_estimado = EXCLUDED.es_estimado, es_agregado = EXCLUDED.es_agregado,
                   fetched_at = now()`,
                valores
              );
              insertadas += res.rowCount ?? 0;
            }
          } else {
            insertadas += rows.length; // dry-run: cuenta lo que se habría insertado
          }
          process.stdout.write(`  reporter ${reporter} ${anio} ${flujo}: ${rows.length} filas\n`);
          await sleep(DELAY_MS);
        }
      }
    }
  } finally {
    if (pool) await pool.end();
  }
  process.stdout.write(
    `comtrade-benchmark: ${requests} requests, ${insertadas} filas${args.dryRun ? " (dry-run)" : ""}\n`
  );
}

/**
 * El `main()` solo corre cuando el archivo se ejecuta directo (npm run
 * ingest:*). Los tests importan las funciones puras del módulo; sin esta guarda
 * el import disparaba la corrida real y el proceso moría con process.exit(1).
 */
const esEjecucionDirecta =
  process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;

if (esEjecucionDirecta) {
  main().catch((err) => {
    console.error("comtrade-benchmark falló:", err instanceof Error ? err.message : err);
    process.exit(1);
  });
}
