/**
 * Conector CLI — Banco Mundial, World Development Indicators (contexto país).
 *
 * Fuente (verificada en vivo el 2026-10-14, SIN key):
 *   https://api.worldbank.org/v2/country/<iso3;...>/indicator/<code>?format=json&date=<desde>:<hasta>
 * La API acepta UN indicador por request y varios países por request
 * (verificado: varios indicadores en la misma URL devuelven HTTP de error
 * "Invalid value"), por eso el loop es por indicador.
 *
 * Qué trae y para qué: panel país × año de indicadores de contexto para
 * internacionalización (PIB, PIB per cápita, crecimiento, exportaciones %PBI,
 * arancel aplicado, inflación, población, IDI de uso de internet) — las
 * covariables de distancia económica/institucional y tamaño de mercado que los
 * modelos de internacionalización necesitan y que Rastro no tenía en ninguna
 * forma.
 *
 * Escribe en la base de la app `bcrp-comercio-exterior` (dominio: comercio
 * exterior y macro). Sin app Express propia: conector + handler MCP + catálogo.
 *
 * Uso:
 *   npx tsx src/ingest/wdi-contexto.ts                       # defaults
 *   npx tsx src/ingest/wdi-contexto.ts --indicators NY.GDP.MKTP.CD
 *   npx tsx src/ingest/wdi-contexto.ts --dry-run             # fetch, no escribe
 */
import { connect } from "./db.js";
import { pathToFileURL } from "node:url";

const API = "https://api.worldbank.org/v2/country";
const ANIOS_DEFAULT = { desde: 2015, hasta: 2024 };
const PAISES_DEFAULT = ["PER", "CHN", "USA", "ECU", "COL", "CHL", "BRA", "MEX", "CAN", "JPN", "KOR", "DEU", "ESP", "NLD", "IND"];
const INDICADORES_DEFAULT = [
  "NY.GDP.MKTP.CD",      // PIB (US$ actuales)
  "NY.GDP.PCAP.CD",      // PIB per cápita (US$ actuales)
  "NY.GDP.MKTP.KD.ZG",   // Crecimiento del PIB (% anual)
  "NE.EXP.GNFS.ZS",      // Exportaciones de bienes y servicios (% del PIB)
  "NE.IMP.GNFS.ZS",      // Importaciones de bienes y servicios (% del PIB)
  "TM.TAX.MRCH.SM.AR.ZS", // Arancel aplicado, media simple, todos los productos (%)
  "FP.CPI.TOTL.ZG",      // Inflación, precios al consumidor (% anual)
  "SP.POP.TOTL",         // Población total
  "IT.NET.USER.ZS",      // Personas usando Internet (% de la población)
  "SL.UEM.TOTL.ZS",      // Desempleo total (% de la fuerza laboral)
  "BX.KLT.DINV.CD.WD",   // IED, entradas netas (Balanza de pagos, US$ actuales)
];

const DDL = `
CREATE TABLE IF NOT EXISTS wdi_indicadores (
  id                BIGSERIAL PRIMARY KEY,
  pais_codigo       TEXT NOT NULL,
  pais_iso3         TEXT NOT NULL,
  pais_nombre       TEXT NOT NULL,
  indicador_codigo  TEXT NOT NULL,
  indicador_nombre  TEXT NOT NULL,
  anio              SMALLINT NOT NULL,
  valor             DOUBLE PRECISION,
  fuente_actualizada TEXT NOT NULL DEFAULT '',
  UNIQUE (pais_codigo, indicador_codigo, anio)
);

CREATE INDEX IF NOT EXISTS idx_wdi_indicador_anio
  ON wdi_indicadores (indicador_codigo, anio);
CREATE INDEX IF NOT EXISTS idx_wdi_pais
  ON wdi_indicadores (pais_iso3);
`;

export interface WdiFila {
  paisCodigo: string;
  paisIso3: string;
  paisNombre: string;
  indicadorCodigo: string;
  indicadorNombre: string;
  anio: number;
  valor: number | null;
  fuenteActualizada: string;
}

interface WdiApiRow {
  indicator: { id: string; value: string };
  country: { id: string; value: string };
  countryiso3code?: string;
  date: string;
  value: number | null;
}

/**
 * Convierte una fila de la API del Banco Mundial a la fila propia. Pura para
 * testearla con el JSON real capturado de la API.
 */
export function normalizarWdi(row: WdiApiRow): WdiFila | null {
  if (!row.country?.id || !row.indicator?.id) return null;
  const anio = Number(row.date);
  if (!Number.isInteger(anio)) return null;
  return {
    paisCodigo: row.country.id,
    // La API devuelve el ISO3 en el nivel superior de la fila (countryiso3code),
    // no dentro de `country` — verificado en la respuesta real.
    paisIso3: row.countryiso3code || row.country.id,
    paisNombre: row.country.value,
    indicadorCodigo: row.indicator.id,
    indicadorNombre: row.indicator.value,
    anio,
    valor: row.value,
    fuenteActualizada: "",
  };
}

export function buildUrl(opts: {
  paises: string[];
  indicador: string;
  desde: number;
  hasta: number;
}): string {
  const params = new URLSearchParams({
    format: "json",
    date: `${opts.desde}:${opts.hasta}`,
    per_page: "20000",
  });
  return `${API}/${opts.paises.join(";")}/indicator/${opts.indicador}?${params.toString()}`;
}

async function fetchWdi(url: string): Promise<{ rows: WdiFila[]; ultimaActualizacion: string }> {
  // Timeout explícito: sin él, un request colgado del Banco Mundial deja el
  // conector vivo para siempre y la corrida nunca termina.
  const res = await fetch(url, { signal: AbortSignal.timeout(60_000) });
  if (!res.ok) throw new Error(`Banco Mundial devolvió HTTP ${res.status}`);
  const body = (await res.json()) as [unknown, WdiApiRow[]] | [ { message: unknown[] } ];
  if (Array.isArray(body[0]) && body[0].length > 0) {
    throw new Error(`Banco Mundial rechazó el indicador: ${JSON.stringify(body[0])}`);
  }
  const meta = body[0] as { lastupdated?: string } | undefined;
  const data = body[1] ?? [];
  const rows = data.map(normalizarWdi).filter((r): r is WdiFila => r !== null);
  return { rows, ultimaActualizacion: meta?.lastupdated ?? "" };
}

interface Args {
  paises: string[];
  indicadores: string[];
  desde: number;
  hasta: number;
  dryRun: boolean;
}

function parseArgs(argv: string[]): Args {
  const args: Args = {
    paises: PAISES_DEFAULT,
    indicadores: INDICADORES_DEFAULT,
    desde: ANIOS_DEFAULT.desde,
    hasta: ANIOS_DEFAULT.hasta,
    dryRun: false,
  };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--dry-run") args.dryRun = true;
    else if (a === "--paises") {
      const v = (argv[++i] ?? "").split(",").map((s) => s.trim().toUpperCase()).filter(Boolean);
      if (v.length > 0) args.paises = v;
    } else if (a === "--indicators") {
      const v = (argv[++i] ?? "").split(",").map((s) => s.trim()).filter(Boolean);
      if (v.length > 0) args.indicadores = v;
    } else if (a === "--desde") args.desde = Number(argv[++i]);
    else if (a === "--hasta") args.hasta = Number(argv[++i]);
  }
  return args;
}

async function main() {
  const args = parseArgs(process.argv);
  const pool = args.dryRun ? null : connect("bcrp-comercio-exterior");
  if (pool) await pool.query(DDL);

  let filas = 0;
  const fallidos: string[] = [];
  try {
    for (const indicador of args.indicadores) {
      const url = buildUrl({ paises: args.paises, indicador, desde: args.desde, hasta: args.hasta });
      try {
        const { rows, ultimaActualizacion } = await fetchWdi(url);
        for (const r of rows) r.fuenteActualizada = ultimaActualizacion;
        filas += rows.length;
        if (pool && rows.length > 0) {
          const valores: unknown[] = [];
          const tuplas: string[] = [];
          for (const r of rows) {
            const base = valores.length;
            tuplas.push(`(${Array.from({ length: 8 }, (_, j) => `$${base + j + 1}`).join(",")})`);
            valores.push(
              r.paisCodigo, r.paisIso3, r.paisNombre, r.indicadorCodigo,
              r.indicadorNombre, r.anio, r.valor, r.fuenteActualizada
            );
          }
          await pool.query(
            `INSERT INTO wdi_indicadores
               (pais_codigo, pais_iso3, pais_nombre, indicador_codigo,
                indicador_nombre, anio, valor, fuente_actualizada)
             VALUES ${tuplas.join(",")}
             ON CONFLICT (pais_codigo, indicador_codigo, anio) DO UPDATE SET
               pais_nombre = EXCLUDED.pais_nombre, indicador_nombre = EXCLUDED.indicador_nombre,
               valor = EXCLUDED.valor, fuente_actualizada = EXCLUDED.fuente_actualizada`,
            valores
          );
        }
        process.stdout.write(`  ${indicador}: ${rows.length} filas\n`);
      } catch (err) {
        // Un indicador inexistente (cambio de código en la fuente) no aborta la
        // corrida: se reporta al final con exit code 0 si hubo al menos datos.
        fallidos.push(`${indicador}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  } finally {
    if (pool) await pool.end();
  }
  for (const f of fallidos) process.stdout.write(`  FALLIDO ${f}\n`);
  process.stdout.write(
    `wdi-contexto: ${args.indicadores.length - fallidos.length}/${args.indicadores.length} indicadores, ${filas} filas${args.dryRun ? " (dry-run)" : ""}\n`
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
    console.error("wdi-contexto falló:", err instanceof Error ? err.message : err);
    process.exit(1);
  });
}
