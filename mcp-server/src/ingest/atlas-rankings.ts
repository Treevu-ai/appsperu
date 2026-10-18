/**
 * Conector CLI — Growth Lab, rankings de complejidad económica.
 *
 * Un solo archivo, fijado el 2026-10-17 contra la API de Dataverse:
 *   doi:10.7910/DVN/XTAQMC versión 12 (distributionDate 2024-09-17, latest)
 *   file id 13439575, growth_proj_eci_rankings.csv, 198703 bytes, CC0.
 * No se baja la matriz de comercio. El ECI de producto del repo se calcula
 * desde BACI, no desde este CSV.
 *
 * Uso:
 *   npx tsx src/ingest/atlas-rankings.ts --dry-run
 */
import { connect } from "./db.js";
import { pathToFileURL } from "node:url";

export const ATLAS_DOI = "doi:10.7910/DVN/XTAQMC";
export const ATLAS_VERSION = "12";
export const ATLAS_FILE_ID = 13439575;
export const ATLAS_ARCHIVO = "growth_proj_eci_rankings.csv";
export const ATLAS_VINTAGE = "V12";
const URL_ARCHIVO = `https://dataverse.harvard.edu/api/access/datafile/${ATLAS_FILE_ID}`;

export const ATLAS_COLUMNAS = [
  "country_id",
  "country_iso3_code",
  "year",
  "growth_proj",
  "in_rankings",
  "eci_sitc",
  "eci_rank_sitc",
  "eci_hs92",
  "eci_rank_hs92",
  "eci_hs12",
  "eci_rank_hs12",
] as const;

const DDL = `
CREATE TABLE IF NOT EXISTS atlas_rankings (
  id              BIGSERIAL PRIMARY KEY,
  country_id      INTEGER NOT NULL,
  pais_iso3       TEXT NOT NULL,
  anio            SMALLINT NOT NULL,
  growth_proj     DOUBLE PRECISION,
  in_rankings     BOOLEAN NOT NULL,
  eci_sitc        DOUBLE PRECISION,
  eci_rank_sitc   INTEGER,
  eci_hs92        DOUBLE PRECISION,
  eci_rank_hs92   INTEGER,
  eci_hs12        DOUBLE PRECISION,
  eci_rank_hs12   INTEGER,
  vintage         TEXT NOT NULL,
  archivo         TEXT NOT NULL,
  UNIQUE (pais_iso3, anio, vintage)
);
CREATE INDEX IF NOT EXISTS idx_atlas_rankings_anio ON atlas_rankings (anio);
`;

export interface AtlasFila {
  countryId: number;
  paisIso3: string;
  anio: number;
  growthProj: number | null;
  inRankings: boolean;
  eciSitc: number | null;
  eciRankSitc: number | null;
  eciHs92: number | null;
  eciRankHs92: number | null;
  eciHs12: number | null;
  eciRankHs12: number | null;
  vintage: string;
  archivo: string;
}

export function partirCsv(linea: string): string[] {
  const out: string[] = [];
  let cur = "";
  let entreComillas = false;
  for (let i = 0; i < linea.length; i++) {
    const c = linea[i];
    if (entreComillas) {
      if (c === '"') {
        if (linea[i + 1] === '"') {
          cur += '"';
          i++;
        } else {
          entreComillas = false;
        }
      } else {
        cur += c;
      }
    } else if (c === '"') {
      entreComillas = true;
    } else if (c === ",") {
      out.push(cur);
      cur = "";
    } else {
      cur += c;
    }
  }
  out.push(cur);
  return out;
}

function numero(raw: string, campo: string): number | null {
  if (raw === "") return null;
  const n = Number(raw);
  if (!Number.isFinite(n)) throw new Error(`Valor no numérico en ${campo}: ${raw}`);
  return n;
}

function entero(raw: string, campo: string): number | null {
  const n = numero(raw, campo);
  if (n === null) return null;
  if (!Number.isInteger(n)) throw new Error(`Entero esperado en ${campo}: ${raw}`);
  return n;
}

/** Rechaza un encabezado distinto al de V12. No inventa columnas. */
export function parseAtlasCsv(texto: string): AtlasFila[] {
  const lineas = texto.replace(/^\uFEFF/, "").split(/\r?\n/).filter((l) => l.length > 0);
  const header = partirCsv(lineas[0] ?? "");
  if (header.join("|") !== ATLAS_COLUMNAS.join("|")) {
    throw new Error(`Encabezado de Atlas distinto al de V12: ${header.join(",")}`);
  }
  const filas: AtlasFila[] = [];
  for (let i = 1; i < lineas.length; i++) {
    const c = partirCsv(lineas[i]);
    if (c.length === 1 && c[0] === "") continue;
    if (c.length !== ATLAS_COLUMNAS.length) {
      throw new Error(`Fila ${i + 1} de Atlas trae ${c.length} columnas`);
    }
    const anio = entero(c[2], "year");
    const countryId = entero(c[0], "country_id");
    if (anio === null || countryId === null) throw new Error(`Fila ${i + 1} sin país o año`);
    const marca = c[4];
    if (marca !== "True" && marca !== "False") {
      throw new Error(`in_rankings inválido en la fila ${i + 1}: ${marca}`);
    }
    filas.push({
      countryId,
      paisIso3: c[1],
      anio,
      growthProj: numero(c[3], "growth_proj"),
      inRankings: marca === "True",
      eciSitc: numero(c[5], "eci_sitc"),
      eciRankSitc: entero(c[6], "eci_rank_sitc"),
      eciHs92: numero(c[7], "eci_hs92"),
      eciRankHs92: entero(c[8], "eci_rank_hs92"),
      eciHs12: numero(c[9], "eci_hs12"),
      eciRankHs12: entero(c[10], "eci_rank_hs12"),
      vintage: ATLAS_VINTAGE,
      archivo: ATLAS_ARCHIVO,
    });
  }
  return filas;
}

async function bajarCsv(): Promise<string> {
  const res = await fetch(URL_ARCHIVO, { signal: AbortSignal.timeout(60_000) });
  if (!res.ok) throw new Error(`Dataverse devolvió HTTP ${res.status}`);
  return res.text();
}

async function insertar(pool: ReturnType<typeof connect>, filas: AtlasFila[]): Promise<void> {
  const TAM = 400;
  for (let i = 0; i < filas.length; i += TAM) {
    const lote = filas.slice(i, i + TAM);
    const valores: unknown[] = [];
    const tuplas: string[] = [];
    for (const f of lote) {
      const base = valores.length;
      tuplas.push(`(${Array.from({ length: 13 }, (_, j) => `$${base + j + 1}`).join(",")})`);
      valores.push(
        f.countryId, f.paisIso3, f.anio, f.growthProj, f.inRankings,
        f.eciSitc, f.eciRankSitc, f.eciHs92, f.eciRankHs92, f.eciHs12, f.eciRankHs12,
        f.vintage, f.archivo,
      );
    }
    await pool.query(
      `INSERT INTO atlas_rankings
         (country_id, pais_iso3, anio, growth_proj, in_rankings,
          eci_sitc, eci_rank_sitc, eci_hs92, eci_rank_hs92, eci_hs12, eci_rank_hs12,
          vintage, archivo)
       VALUES ${tuplas.join(",")}
       ON CONFLICT (pais_iso3, anio, vintage) DO UPDATE SET
         country_id = EXCLUDED.country_id,
         growth_proj = EXCLUDED.growth_proj,
         in_rankings = EXCLUDED.in_rankings,
         eci_sitc = EXCLUDED.eci_sitc,
         eci_rank_sitc = EXCLUDED.eci_rank_sitc,
         eci_hs92 = EXCLUDED.eci_hs92,
         eci_rank_hs92 = EXCLUDED.eci_rank_hs92,
         eci_hs12 = EXCLUDED.eci_hs12,
         eci_rank_hs12 = EXCLUDED.eci_rank_hs12,
         archivo = EXCLUDED.archivo`,
      valores,
    );
  }
}

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const texto = await bajarCsv();
  const filas = parseAtlasCsv(texto);
  const anios = filas.map((f) => f.anio);
  process.stdout.write(
    `atlas-rankings: ${filas.length} filas, años ${Math.min(...anios)}-${Math.max(...anios)}, ` +
      `${ATLAS_DOI} ${ATLAS_VINTAGE} file ${ATLAS_FILE_ID}${dryRun ? " (dry-run)" : ""}\n`,
  );
  if (dryRun) return;
  const pool = connect("bcrp-comercio-exterior");
  try {
    await pool.query(DDL);
    await insertar(pool, filas);
  } finally {
    await pool.end();
  }
}

const esEjecucionDirecta =
  process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;

if (esEjecucionDirecta) {
  main().catch((err) => {
    console.error("atlas-rankings falló:", err instanceof Error ? err.message : err);
    process.exit(1);
  });
}
