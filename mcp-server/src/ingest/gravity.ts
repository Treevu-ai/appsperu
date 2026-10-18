/**
 * Conector CLI — CEPII Gravity V202211, solo las columnas de acuerdos.
 *
 * Un solo zip: https://www.cepii.fr/DATA_DOWNLOAD/gravity/data/Gravity_csv_V202211.zip
 * (206707748 bytes). Se ignoran los marcados "Do not use". Licencia Etalab 2.0.
 *
 * Gravity_V202211.csv pesa 1251418200 bytes y trae 87 columnas. No se carga
 * ese CSV ancho. La proyección, leída del encabezado real el 2026-10-17, es
 * año, country_id e iso3 de origen y destino, country_exists_o/d, fta_wto,
 * fta_wto_raw, rta_coverage y rta_type.
 *
 * No existe rta_type.csv. Las etiquetas están en Label_rta_type_V202211.csv
 * y Label_rta_coverage_V202211.csv. El zip rta_20260111 no es esta tabla.
 *
 * Uso:
 *   npx tsx src/ingest/gravity.ts --dry-run --zip <Gravity_csv_V202211.zip>
 */
import { spawn } from "node:child_process";
import { createInterface } from "node:readline";
import { pathToFileURL } from "node:url";
import { connect } from "./db.js";
import { partirCsv } from "./atlas-rankings.js";
import { resolver7z } from "./lsci.js";

export const GRAVITY_URL = "https://www.cepii.fr/DATA_DOWNLOAD/gravity/data/Gravity_csv_V202211.zip";
export const GRAVITY_VINTAGE = "202211";
export const GRAVITY_ARCHIVO = "Gravity_V202211.csv";

/** Encabezado real de Gravity_V202211.csv, sin las comillas del CSV. */
export const GRAVITY_COLUMNAS = [
  "year", "country_id_o", "country_id_d", "iso3_o", "iso3_d", "iso3num_o", "iso3num_d",
  "country_exists_o", "country_exists_d", "gmt_offset_2020_o", "gmt_offset_2020_d",
  "distw_harmonic", "distw_arithmetic", "distw_harmonic_jh", "distw_arithmetic_jh",
  "dist", "main_city_source_o", "main_city_source_d", "distcap", "contig",
  "diplo_disagreement", "scaled_sci_2021", "comlang_off", "comlang_ethno", "comcol", "col45",
  "legal_old_o", "legal_old_d", "legal_new_o", "legal_new_d", "comleg_pretrans", "comleg_posttrans",
  "transition_legalchange", "comrelig", "heg_o", "heg_d", "col_dep_ever", "col_dep",
  "col_dep_end_year", "col_dep_end_conflict", "empire", "sibling_ever", "sibling", "sever_year",
  "sib_conflict", "pop_o", "pop_d", "gdp_o", "gdp_d", "gdpcap_o", "gdpcap_d",
  "pop_source_o", "pop_source_d", "gdp_source_o", "gdp_source_d", "gdp_ppp_o", "gdp_ppp_d",
  "gdpcap_ppp_o", "gdpcap_ppp_d", "pop_pwt_o", "pop_pwt_d", "gdp_ppp_pwt_o", "gdp_ppp_pwt_d",
  "gatt_o", "gatt_d", "wto_o", "wto_d", "eu_o", "eu_d",
  "fta_wto", "fta_wto_raw", "rta_coverage", "rta_type",
  "entry_cost_o", "entry_cost_d", "entry_proc_o", "entry_proc_d", "entry_time_o", "entry_time_d",
  "entry_tp_o", "entry_tp_d", "tradeflow_comtrade_o", "tradeflow_comtrade_d", "tradeflow_baci",
  "manuf_tradeflow_baci", "tradeflow_imf_o", "tradeflow_imf_d",
] as const;

export const RTA_TYPE_COLUMNAS = ["rta_type", "rta_type_lbl"] as const;
export const RTA_COVERAGE_COLUMNAS = ["rta_coverage", "rta_coverage_lbl"] as const;

const COL = Object.fromEntries(GRAVITY_COLUMNAS.map((nombre, i) => [nombre, i])) as Record<
  (typeof GRAVITY_COLUMNAS)[number],
  number
>;

const DDL = `
CREATE TABLE IF NOT EXISTS gravity_acuerdos (
  id                 BIGSERIAL PRIMARY KEY,
  anio               SMALLINT NOT NULL,
  country_id_o       TEXT NOT NULL,
  country_id_d       TEXT NOT NULL,
  iso3_o             TEXT NOT NULL,
  iso3_d             TEXT NOT NULL,
  country_exists_o   SMALLINT,
  country_exists_d   SMALLINT,
  fta_wto            TEXT,
  fta_wto_raw        TEXT,
  rta_coverage       TEXT,
  rta_type           TEXT,
  vintage            TEXT NOT NULL,
  UNIQUE (anio, country_id_o, country_id_d, vintage)
);
CREATE INDEX IF NOT EXISTS idx_gravity_acuerdos_par ON gravity_acuerdos (iso3_o, iso3_d, anio);
CREATE TABLE IF NOT EXISTS gravity_rta_etiquetas (
  id        BIGSERIAL PRIMARY KEY,
  variable  TEXT NOT NULL,
  codigo    TEXT NOT NULL,
  etiqueta  TEXT NOT NULL,
  vintage   TEXT NOT NULL,
  UNIQUE (variable, codigo, vintage)
);
`;

export interface GravityAcuerdo {
  anio: number;
  countryIdO: string;
  countryIdD: string;
  iso3O: string;
  iso3D: string;
  countryExistsO: number | null;
  countryExistsD: number | null;
  ftaWto: string | null;
  ftaWtoRaw: string | null;
  rtaCoverage: string | null;
  rtaType: string | null;
  vintage: string;
}

export interface GravityEtiqueta {
  variable: "rta_type" | "rta_coverage";
  codigo: string;
  etiqueta: string;
  vintage: string;
}

function vacio(raw: string): string | null {
  return raw === "" ? null : raw;
}

function enteroOpcional(raw: string, campo: string): number | null {
  if (raw === "") return null;
  if (!/^-?\d+$/.test(raw)) throw new Error(`${campo} de Gravity inválido: ${raw}`);
  return Number(raw);
}

export function exigirEncabezadoGravity(header: string[]): void {
  if (header.join("|") !== GRAVITY_COLUMNAS.join("|")) {
    throw new Error(`Encabezado Gravity distinto al de V${GRAVITY_VINTAGE}: ${header.join(",")}`);
  }
}

export function filaGravity(campos: string[]): GravityAcuerdo {
  if (campos.length !== GRAVITY_COLUMNAS.length) {
    throw new Error(`Fila Gravity trae ${campos.length} columnas`);
  }
  const anio = enteroOpcional(campos[COL.year], "year");
  const countryIdO = vacio(campos[COL.country_id_o]);
  const countryIdD = vacio(campos[COL.country_id_d]);
  const iso3O = vacio(campos[COL.iso3_o]);
  const iso3D = vacio(campos[COL.iso3_d]);
  if (anio === null || !countryIdO || !countryIdD || !iso3O || !iso3D) {
    throw new Error("Fila Gravity sin año o sin país de origen o destino");
  }
  return {
    anio,
    countryIdO,
    countryIdD,
    iso3O,
    iso3D,
    countryExistsO: enteroOpcional(campos[COL.country_exists_o], "country_exists_o"),
    countryExistsD: enteroOpcional(campos[COL.country_exists_d], "country_exists_d"),
    ftaWto: vacio(campos[COL.fta_wto]),
    ftaWtoRaw: vacio(campos[COL.fta_wto_raw]),
    rtaCoverage: vacio(campos[COL.rta_coverage]),
    rtaType: vacio(campos[COL.rta_type]),
    vintage: GRAVITY_VINTAGE,
  };
}

export function parseGravityCsv(texto: string): GravityAcuerdo[] {
  const lineas = texto.replace(/^\uFEFF/, "").split(/\r?\n/).filter((l) => l.length > 0);
  exigirEncabezadoGravity(partirCsv(lineas[0] ?? ""));
  return lineas.slice(1).map((linea) => filaGravity(partirCsv(linea)));
}

function parseEtiquetas(
  texto: string,
  columnas: readonly string[],
  variable: GravityEtiqueta["variable"],
): GravityEtiqueta[] {
  const lineas = texto.replace(/^\uFEFF/, "").split(/\r?\n/).filter((l) => l.length > 0);
  const header = partirCsv(lineas[0] ?? "");
  if (header.join("|") !== columnas.join("|")) {
    throw new Error(`Encabezado ${variable} distinto: ${header.join(",")}`);
  }
  return lineas.slice(1).map((linea) => {
    const c = partirCsv(linea);
    if (c.length !== 2 || c[0] === "" || c[1] === "") {
      throw new Error(`Etiqueta ${variable} incompleta: ${linea}`);
    }
    return { variable, codigo: c[0], etiqueta: c[1], vintage: GRAVITY_VINTAGE };
  });
}

export function parseRtaType(texto: string): GravityEtiqueta[] {
  return parseEtiquetas(texto, RTA_TYPE_COLUMNAS, "rta_type");
}

export function parseRtaCoverage(texto: string): GravityEtiqueta[] {
  return parseEtiquetas(texto, RTA_COVERAGE_COLUMNAS, "rta_coverage");
}

function extraerTexto(zip: string, nombre: string): Promise<string> {
  const bin = resolver7z();
  const child = spawn(bin, ["e", "-so", "-bd", zip, nombre], { windowsHide: true });
  const trozos: Buffer[] = [];
  let stderr = "";
  child.stdout.on("data", (buf: Buffer) => trozos.push(buf));
  child.stderr.on("data", (buf: Buffer) => {
    stderr += buf.toString("utf8");
  });
  return new Promise((ok, fail) => {
    child.on("error", (err) => fail(new Error(`No se pudo ejecutar 7z (${bin}). ${err.message}`)));
    child.on("close", (code) => {
      if (code !== 0) fail(new Error(`7z salió ${code} al leer ${nombre}: ${stderr.trim()}`));
      else ok(Buffer.concat(trozos).toString("utf8"));
    });
  });
}

export interface GravityConteo {
  filas: number;
  conAcuerdo: number;
  anioMin: number;
  anioMax: number;
}

function contarZip(zip: string): Promise<GravityConteo> {
  const bin = resolver7z();
  const child = spawn(bin, ["e", "-so", "-bd", zip, GRAVITY_ARCHIVO], { windowsHide: true });
  let stderr = "";
  child.stderr.on("data", (buf: Buffer) => {
    stderr += buf.toString("utf8");
  });
  const cerrado = new Promise<number>((ok, fail) => {
    child.on("error", (err) => fail(new Error(`No se pudo ejecutar 7z (${bin}). ${err.message}`)));
    child.on("close", (code) => ok(code ?? 1));
  });
  const rl = createInterface({ input: child.stdout, crlfDelay: Infinity });
  const lectura = (async () => {
    let headerVisto = false;
    let filas = 0;
    let conAcuerdo = 0;
    let anioMin = 9999;
    let anioMax = 0;
    try {
    for await (const linea of rl) {
      if (!headerVisto) {
        try {
          exigirEncabezadoGravity(partirCsv(linea.replace(/^\uFEFF/, "")));
        } catch (err) {
          child.kill();
          throw err;
        }
        headerVisto = true;
        continue;
      }
      if (linea.length === 0) continue;
      const fila = filaGravity(partirCsv(linea));
      filas += 1;
      if (fila.ftaWto !== null || fila.ftaWtoRaw !== null || fila.rtaCoverage !== null || fila.rtaType !== null) {
        conAcuerdo += 1;
      }
      if (fila.anio < anioMin) anioMin = fila.anio;
      if (fila.anio > anioMax) anioMax = fila.anio;
    }
    if (!headerVisto) throw new Error("Gravity no trajo encabezado");
    return { filas, conAcuerdo, anioMin, anioMax };
    } catch (err) {
      child.kill();
      throw err;
    }
  })();
  return lectura.then(async (conteo) => {
    const code = await cerrado;
    if (code !== 0) throw new Error(`7z salió ${code} al leer ${GRAVITY_ARCHIVO}: ${stderr.trim()}`);
    return conteo;
  });
}

async function insertar(pool: ReturnType<typeof connect>, zip: string): Promise<number> {
  const bin = resolver7z();
  const child = spawn(bin, ["e", "-so", "-bd", zip, GRAVITY_ARCHIVO], { windowsHide: true });
  let stderr = "";
  child.stderr.on("data", (buf: Buffer) => {
    stderr += buf.toString("utf8");
  });
  const cerrado = new Promise<number>((ok, fail) => {
    child.on("error", (err) => fail(err));
    child.on("close", (code) => ok(code ?? 1));
  });
  const rl = createInterface({ input: child.stdout, crlfDelay: Infinity });
  let headerVisto = false;
  let total = 0;
  let lote: GravityAcuerdo[] = [];
  const volcar = async () => {
    if (lote.length === 0) return;
    const valores: unknown[] = [];
    const tuplas: string[] = [];
    for (const f of lote) {
      const base = valores.length;
      tuplas.push(`(${Array.from({ length: 12 }, (_, j) => `$${base + j + 1}`).join(",")})`);
      valores.push(
        f.anio, f.countryIdO, f.countryIdD, f.iso3O, f.iso3D,
        f.countryExistsO, f.countryExistsD, f.ftaWto, f.ftaWtoRaw, f.rtaCoverage, f.rtaType, f.vintage,
      );
    }
    await pool.query(
      `INSERT INTO gravity_acuerdos (
         anio, country_id_o, country_id_d, iso3_o, iso3_d,
         country_exists_o, country_exists_d, fta_wto, fta_wto_raw, rta_coverage, rta_type, vintage)
       VALUES ${tuplas.join(",")}
       ON CONFLICT (anio, country_id_o, country_id_d, vintage) DO UPDATE SET
         iso3_o = EXCLUDED.iso3_o, iso3_d = EXCLUDED.iso3_d,
         country_exists_o = EXCLUDED.country_exists_o, country_exists_d = EXCLUDED.country_exists_d,
         fta_wto = EXCLUDED.fta_wto, fta_wto_raw = EXCLUDED.fta_wto_raw,
         rta_coverage = EXCLUDED.rta_coverage, rta_type = EXCLUDED.rta_type`,
      valores,
    );
    total += lote.length;
    lote = [];
  };
  for await (const linea of rl) {
    if (!headerVisto) {
      exigirEncabezadoGravity(partirCsv(linea.replace(/^\uFEFF/, "")));
      headerVisto = true;
      continue;
    }
    if (linea.length === 0) continue;
    lote.push(filaGravity(partirCsv(linea)));
    if (lote.length >= 400) await volcar();
  }
  await volcar();
  const code = await cerrado;
  if (code !== 0) throw new Error(`7z salió ${code}: ${stderr.trim()}`);
  return total;
}

async function insertarEtiquetas(pool: ReturnType<typeof connect>, filas: GravityEtiqueta[]): Promise<void> {
  const valores: unknown[] = [];
  const tuplas: string[] = [];
  for (const f of filas) {
    const base = valores.length;
    tuplas.push(`(${Array.from({ length: 4 }, (_, j) => `$${base + j + 1}`).join(",")})`);
    valores.push(f.variable, f.codigo, f.etiqueta, f.vintage);
  }
  await pool.query(
    `INSERT INTO gravity_rta_etiquetas (variable, codigo, etiqueta, vintage)
     VALUES ${tuplas.join(",")}
     ON CONFLICT (variable, codigo, vintage) DO UPDATE SET etiqueta = EXCLUDED.etiqueta`,
    valores,
  );
}

function argumento(argv: readonly string[], nombre: string): string | undefined {
  const i = argv.indexOf(nombre);
  return i < 0 ? undefined : argv[i + 1];
}

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const zip = argumento(process.argv, "--zip");
  if (!zip) {
    throw new Error(`Falta --zip. El archivo es ${GRAVITY_URL}. No se usa rta_20260111.`);
  }
  const tipos = parseRtaType(await extraerTexto(zip, "Label_rta_type_V202211.csv"));
  const coberturas = parseRtaCoverage(await extraerTexto(zip, "Label_rta_coverage_V202211.csv"));
  if (dryRun) {
    const conteo = await contarZip(zip);
    process.stdout.write(
      `gravity: ${conteo.filas} pares-año ${conteo.anioMin}-${conteo.anioMax}, ` +
        `${conteo.conAcuerdo} con algún campo de acuerdo, ` +
        `${tipos.length} etiquetas rta_type, ${coberturas.length} rta_coverage, ` +
        `vintage ${GRAVITY_VINTAGE} (dry-run)\n`,
    );
    return;
  }
  const pool = connect("bcrp-comercio-exterior");
  try {
    await pool.query(DDL);
    await insertarEtiquetas(pool, [...tipos, ...coberturas]);
    const total = await insertar(pool, zip);
    process.stdout.write(
      `gravity: ${total} pares-año, ${tipos.length} etiquetas rta_type, ` +
        `${coberturas.length} rta_coverage, vintage ${GRAVITY_VINTAGE}\n`,
    );
  } finally {
    await pool.end();
  }
}

const esEjecucionDirecta =
  process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;

if (esEjecucionDirecta) {
  main().catch((err) => {
    console.error("gravity falló:", err instanceof Error ? err.message : err);
    process.exit(1);
  });
}
