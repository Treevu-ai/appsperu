/**
 * Conector CLI — CEPII GeoDist (geo_cepii y dist_cepii).
 *
 * Precondición: se usa la ficha vigente de CEPII (Etalab 2.0 / Licence Ouverte)
 * para uso interno. `distances.htm` todavía dice CC BY-NC-ND 3.0. Si el estudio
 * va a republicar el archivo, esta corrida no corresponde.
 *
 * Lee los xls que ya están en el estudio, no baja otra copia y no reemplaza
 * `geodist_peru.csv`. El zip `dist_cepii.zip` envuelve el mismo xls.
 * Encabezados leídos el 2026-10-17 con xlrd:
 *   geo_cepii: 238 filas, 225 ISO3, 34 columnas, hoja geo_cepii.
 *     13 países traen dos ciudades. La clave es (iso3, cap, maincity),
 *     no iso3: Australia es Sydney (cap 0, maincity 1) y Canberra
 *     (cap 1, maincity 0). Tanzania repite el nombre Dar es Salaam.
 *   dist_cepii: 50176 díadas, 14 columnas, hoja dist_cepii. La clave
 *     (iso_o, iso_d) no se repite.
 * La conversión xls → CSV usa el Python del entorno (xlrd). No se agrega
 * una dependencia npm: el repo no tiene lector BIFF.
 *
 * Uso:
 *   npx tsx src/ingest/geodist.ts --dry-run
 */
import { spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { connect } from "./db.js";
import { partirCsv } from "./atlas-rankings.js";

export const GEO_PAISES_COLUMNAS = [
  "iso2", "iso3", "cnum", "country", "pays", "area", "dis_int", "landlocked",
  "continent", "city_en", "city_fr", "lat", "lon", "cap", "maincity", "citynum",
  "langoff_1", "langoff_2", "langoff_3",
  "lang20_1", "lang20_2", "lang20_3", "lang20_4",
  "lang9_1", "lang9_2", "lang9_3", "lang9_4",
  "colonizer1", "colonizer2", "colonizer3", "colonizer4",
  "short_colonizer1", "short_colonizer2", "short_colonizer3",
] as const;

export const GEO_DIADAS_COLUMNAS = [
  "iso_o", "iso_d", "contig", "comlang_off", "comlang_ethno", "colony",
  "comcol", "curcol", "col45", "smctry", "dist", "distcap", "distw", "distwces",
] as const;

const ENTEROS_DIADA = new Set([
  "contig", "comlang_off", "comlang_ethno", "colony", "comcol", "curcol", "col45", "smctry",
]);
const DDL = `
CREATE TABLE IF NOT EXISTS geodist_paises (
  id BIGSERIAL PRIMARY KEY,
  iso2 TEXT NOT NULL,
  iso3 TEXT NOT NULL,
  cnum INTEGER,
  country TEXT,
  pays TEXT,
  area DOUBLE PRECISION,
  dis_int DOUBLE PRECISION,
  landlocked SMALLINT,
  continent TEXT,
  city_en TEXT,
  city_fr TEXT,
  lat DOUBLE PRECISION,
  lon DOUBLE PRECISION,
  cap SMALLINT,
  maincity SMALLINT,
  citynum INTEGER,
  langoff_1 TEXT, langoff_2 TEXT, langoff_3 TEXT,
  lang20_1 TEXT, lang20_2 TEXT, lang20_3 TEXT, lang20_4 TEXT,
  lang9_1 TEXT, lang9_2 TEXT, lang9_3 TEXT, lang9_4 TEXT,
  colonizer1 TEXT, colonizer2 TEXT, colonizer3 TEXT, colonizer4 TEXT,
  short_colonizer1 TEXT, short_colonizer2 TEXT, short_colonizer3 TEXT,
  archivo TEXT NOT NULL
);
ALTER TABLE geodist_paises DROP CONSTRAINT IF EXISTS geodist_paises_iso3_key;
CREATE UNIQUE INDEX IF NOT EXISTS geodist_paises_iso3_cap_maincity
  ON geodist_paises (iso3, cap, maincity);
CREATE TABLE IF NOT EXISTS geodist_diadas (
  id BIGSERIAL PRIMARY KEY,
  iso_o TEXT NOT NULL,
  iso_d TEXT NOT NULL,
  contig SMALLINT,
  comlang_off SMALLINT,
  comlang_ethno SMALLINT,
  colony SMALLINT,
  comcol SMALLINT,
  curcol SMALLINT,
  col45 SMALLINT,
  smctry SMALLINT,
  dist DOUBLE PRECISION,
  distcap DOUBLE PRECISION,
  distw DOUBLE PRECISION,
  distwces DOUBLE PRECISION,
  archivo TEXT NOT NULL,
  UNIQUE (iso_o, iso_d)
);
CREATE INDEX IF NOT EXISTS idx_geodist_diadas_origen ON geodist_diadas (iso_o);
`;

export interface GeoPais {
  iso2: string;
  iso3: string;
  cnum: number | null;
  country: string | null;
  pays: string | null;
  area: number | null;
  disInt: number | null;
  landlocked: number | null;
  continent: string | null;
  cityEn: string | null;
  cityFr: string | null;
  lat: number | null;
  lon: number | null;
  cap: number | null;
  maincity: number | null;
  citynum: number | null;
  langoff1: string | null;
  langoff2: string | null;
  langoff3: string | null;
  lang201: string | null;
  lang202: string | null;
  lang203: string | null;
  lang204: string | null;
  lang91: string | null;
  lang92: string | null;
  lang93: string | null;
  lang94: string | null;
  colonizer1: string | null;
  colonizer2: string | null;
  colonizer3: string | null;
  colonizer4: string | null;
  shortColonizer1: string | null;
  shortColonizer2: string | null;
  shortColonizer3: string | null;
  archivo: string;
}

export interface GeoDiada {
  isoO: string;
  isoD: string;
  contig: number | null;
  comlangOff: number | null;
  comlangEthno: number | null;
  colony: number | null;
  comcol: number | null;
  curcol: number | null;
  col45: number | null;
  smctry: number | null;
  dist: number | null;
  distcap: number | null;
  distw: number | null;
  distwces: number | null;
  archivo: string;
}

const SCRIPT_XLS = `
import csv, sys, xlrd
book = xlrd.open_workbook(sys.argv[1], on_demand=True)
sh = book.sheet_by_name(sys.argv[2])
writer = csv.writer(sys.stdout, lineterminator="\\n")
for r in range(sh.nrows):
    writer.writerow([sh.cell_value(r, c) for c in range(sh.ncols)])
`;

export function dirGeoPorDefecto(): string {
  return resolve(
    dirname(fileURLToPath(import.meta.url)),
    "..", "..", "..",
    "investigaciones", "rca-shift-share-cptpp-china", "data", "raw", "geodist",
  );
}

function textoCelda(raw: string): string | null {
  if (raw === "" || raw === ".") return null;
  return raw;
}

function numeroCelda(raw: string, campo: string, entero: boolean): number | null {
  if (raw === "" || raw === ".") return null;
  const n = Number(raw);
  if (!Number.isFinite(n)) throw new Error(`Valor no numérico en ${campo}: ${raw}`);
  if (entero && !Number.isInteger(n)) throw new Error(`Entero esperado en ${campo}: ${raw}`);
  return n;
}

function exigirEncabezado(leido: string[], esperado: readonly string[], nombre: string): void {
  if (leido.join("|") !== esperado.join("|")) {
    throw new Error(`Encabezado GeoDist ${nombre} distinto: ${leido.join(",")}`);
  }
}

function lineasCsv(texto: string): string[][] {
  return texto.replace(/^\uFEFF/, "").split(/\r?\n/).filter((l) => l.length > 0).map(partirCsv);
}

export function parseGeoPaises(texto: string, archivo = "geo_cepii.xls"): GeoPais[] {
  const filas = lineasCsv(texto);
  exigirEncabezado(filas[0] ?? [], GEO_PAISES_COLUMNAS, "geo_cepii");
  return filas.slice(1).map((c, i) => {
    if (c.length !== GEO_PAISES_COLUMNAS.length) {
      throw new Error(`Fila ${i + 2} de geo_cepii trae ${c.length} columnas`);
    }
    const celda = (nombre: string) => c[GEO_PAISES_COLUMNAS.indexOf(nombre as typeof GEO_PAISES_COLUMNAS[number])];
    const txt = (nombre: string) => textoCelda(celda(nombre));
    const ent = (nombre: string) => numeroCelda(celda(nombre), nombre, true);
    const dec = (nombre: string) => numeroCelda(celda(nombre), nombre, false);
    const iso3 = txt("iso3");
    const iso2 = txt("iso2");
    if (!iso3 || !iso2) throw new Error(`Fila ${i + 2} de geo_cepii sin iso2 o iso3`);
    return {
      iso2, iso3,
      cnum: ent("cnum"),
      country: txt("country"),
      pays: txt("pays"),
      area: dec("area"),
      disInt: dec("dis_int"),
      landlocked: ent("landlocked"),
      continent: txt("continent"),
      cityEn: txt("city_en"),
      cityFr: txt("city_fr"),
      lat: dec("lat"),
      lon: dec("lon"),
      cap: ent("cap"),
      maincity: ent("maincity"),
      citynum: ent("citynum"),
      langoff1: txt("langoff_1"),
      langoff2: txt("langoff_2"),
      langoff3: txt("langoff_3"),
      lang201: txt("lang20_1"),
      lang202: txt("lang20_2"),
      lang203: txt("lang20_3"),
      lang204: txt("lang20_4"),
      lang91: txt("lang9_1"),
      lang92: txt("lang9_2"),
      lang93: txt("lang9_3"),
      lang94: txt("lang9_4"),
      colonizer1: txt("colonizer1"),
      colonizer2: txt("colonizer2"),
      colonizer3: txt("colonizer3"),
      colonizer4: txt("colonizer4"),
      shortColonizer1: txt("short_colonizer1"),
      shortColonizer2: txt("short_colonizer2"),
      shortColonizer3: txt("short_colonizer3"),
      archivo,
    };
  });
}

export function exigirClaveCiudad(filas: readonly GeoPais[]): void {
  const vistos = new Map<string, GeoPais>();
  for (const f of filas) {
    if (f.cap === null || f.maincity === null) {
      throw new Error(`Fila ${f.iso3} ${f.cityEn ?? ""} sin cap o maincity`);
    }
    const clave = `${f.iso3}|${f.cap}|${f.maincity}`;
    const previa = vistos.get(clave);
    if (previa) {
      throw new Error(
        `Clave geo_cepii repetida ${f.iso3} cap=${f.cap} maincity=${f.maincity}: ${previa.cityEn} y ${f.cityEn}`,
      );
    }
    vistos.set(clave, f);
  }
}

export function parseGeoDiadas(texto: string, archivo = "dist_cepii.xls"): GeoDiada[] {
  const filas = lineasCsv(texto);
  exigirEncabezado(filas[0] ?? [], GEO_DIADAS_COLUMNAS, "dist_cepii");
  return filas.slice(1).map((c, i) => {
    if (c.length !== GEO_DIADAS_COLUMNAS.length) {
      throw new Error(`Fila ${i + 2} de dist_cepii trae ${c.length} columnas`);
    }
    const celda = (nombre: string) => c[GEO_DIADAS_COLUMNAS.indexOf(nombre as typeof GEO_DIADAS_COLUMNAS[number])];
    const txt = (nombre: string) => textoCelda(celda(nombre));
    const ent = (nombre: string) => numeroCelda(celda(nombre), nombre, ENTEROS_DIADA.has(nombre));
    const dec = (nombre: string) => numeroCelda(celda(nombre), nombre, false);
    const isoO = txt("iso_o");
    const isoD = txt("iso_d");
    if (!isoO || !isoD) throw new Error(`Fila ${i + 2} de dist_cepii sin iso_o o iso_d`);
    return {
      isoO, isoD,
      contig: ent("contig"),
      comlangOff: ent("comlang_off"),
      comlangEthno: ent("comlang_ethno"),
      colony: ent("colony"),
      comcol: ent("comcol"),
      curcol: ent("curcol"),
      col45: ent("col45"),
      smctry: ent("smctry"),
      dist: dec("dist"),
      distcap: dec("distcap"),
      distw: dec("distw"),
      distwces: dec("distwces"),
      archivo,
    };
  });
}

export function xlsACsv(ruta: string, hoja: string): string {
  const resultado = spawnSync("python", ["-c", SCRIPT_XLS, ruta, hoja], {
    encoding: "utf8",
    maxBuffer: 32_000_000,
    env: { ...process.env, PYTHONIOENCODING: "utf-8", PYTHONUTF8: "1" },
    windowsHide: true,
  });
  if (resultado.error) {
    throw new Error(`No se pudo ejecutar python para leer ${ruta}. ${resultado.error.message}`);
  }
  if (resultado.status !== 0) {
    throw new Error(`xlrd no pudo leer ${hoja} en ${ruta}: ${resultado.stderr}`);
  }
  return resultado.stdout;
}

async function insertarPaises(pool: ReturnType<typeof connect>, filas: GeoPais[]): Promise<void> {
  const TAM = 100;
  for (let i = 0; i < filas.length; i += TAM) {
    const lote = filas.slice(i, i + TAM);
    const valores: unknown[] = [];
    const tuplas: string[] = [];
    for (const f of lote) {
      const base = valores.length;
      tuplas.push(`(${Array.from({ length: 35 }, (_, j) => `$${base + j + 1}`).join(",")})`);
      valores.push(
        f.iso2, f.iso3, f.cnum, f.country, f.pays, f.area, f.disInt, f.landlocked,
        f.continent, f.cityEn, f.cityFr, f.lat, f.lon, f.cap, f.maincity, f.citynum,
        f.langoff1, f.langoff2, f.langoff3,
        f.lang201, f.lang202, f.lang203, f.lang204,
        f.lang91, f.lang92, f.lang93, f.lang94,
        f.colonizer1, f.colonizer2, f.colonizer3, f.colonizer4,
        f.shortColonizer1, f.shortColonizer2, f.shortColonizer3,
        f.archivo,
      );
    }
    await pool.query(
      `INSERT INTO geodist_paises (
         iso2, iso3, cnum, country, pays, area, dis_int, landlocked,
         continent, city_en, city_fr, lat, lon, cap, maincity, citynum,
         langoff_1, langoff_2, langoff_3,
         lang20_1, lang20_2, lang20_3, lang20_4,
         lang9_1, lang9_2, lang9_3, lang9_4,
         colonizer1, colonizer2, colonizer3, colonizer4,
         short_colonizer1, short_colonizer2, short_colonizer3, archivo)
       VALUES ${tuplas.join(",")}
       ON CONFLICT (iso3, cap, maincity) DO UPDATE SET
         iso2 = EXCLUDED.iso2, cnum = EXCLUDED.cnum, country = EXCLUDED.country, pays = EXCLUDED.pays,
         area = EXCLUDED.area, dis_int = EXCLUDED.dis_int, landlocked = EXCLUDED.landlocked,
         continent = EXCLUDED.continent, city_en = EXCLUDED.city_en, city_fr = EXCLUDED.city_fr,
         lat = EXCLUDED.lat, lon = EXCLUDED.lon, cap = EXCLUDED.cap, maincity = EXCLUDED.maincity,
         citynum = EXCLUDED.citynum,
         langoff_1 = EXCLUDED.langoff_1, langoff_2 = EXCLUDED.langoff_2, langoff_3 = EXCLUDED.langoff_3,
         lang20_1 = EXCLUDED.lang20_1, lang20_2 = EXCLUDED.lang20_2, lang20_3 = EXCLUDED.lang20_3,
         lang20_4 = EXCLUDED.lang20_4,
         lang9_1 = EXCLUDED.lang9_1, lang9_2 = EXCLUDED.lang9_2, lang9_3 = EXCLUDED.lang9_3,
         lang9_4 = EXCLUDED.lang9_4,
         colonizer1 = EXCLUDED.colonizer1, colonizer2 = EXCLUDED.colonizer2,
         colonizer3 = EXCLUDED.colonizer3, colonizer4 = EXCLUDED.colonizer4,
         short_colonizer1 = EXCLUDED.short_colonizer1, short_colonizer2 = EXCLUDED.short_colonizer2,
         short_colonizer3 = EXCLUDED.short_colonizer3, archivo = EXCLUDED.archivo`,
      valores,
    );
  }
}

async function insertarDiadas(pool: ReturnType<typeof connect>, filas: GeoDiada[]): Promise<void> {
  const TAM = 400;
  for (let i = 0; i < filas.length; i += TAM) {
    const lote = filas.slice(i, i + TAM);
    const valores: unknown[] = [];
    const tuplas: string[] = [];
    for (const f of lote) {
      const base = valores.length;
      tuplas.push(`(${Array.from({ length: 15 }, (_, j) => `$${base + j + 1}`).join(",")})`);
      valores.push(
        f.isoO, f.isoD, f.contig, f.comlangOff, f.comlangEthno, f.colony, f.comcol, f.curcol,
        f.col45, f.smctry, f.dist, f.distcap, f.distw, f.distwces, f.archivo,
      );
    }
    await pool.query(
      `INSERT INTO geodist_diadas (
         iso_o, iso_d, contig, comlang_off, comlang_ethno, colony, comcol, curcol, col45, smctry,
         dist, distcap, distw, distwces, archivo)
       VALUES ${tuplas.join(",")}
       ON CONFLICT (iso_o, iso_d) DO UPDATE SET
         contig = EXCLUDED.contig, comlang_off = EXCLUDED.comlang_off,
         comlang_ethno = EXCLUDED.comlang_ethno, colony = EXCLUDED.colony,
         comcol = EXCLUDED.comcol, curcol = EXCLUDED.curcol, col45 = EXCLUDED.col45,
         smctry = EXCLUDED.smctry, dist = EXCLUDED.dist, distcap = EXCLUDED.distcap,
         distw = EXCLUDED.distw, distwces = EXCLUDED.distwces, archivo = EXCLUDED.archivo`,
      valores,
    );
  }
}

function argumento(argv: readonly string[], nombre: string): string | undefined {
  const i = argv.indexOf(nombre);
  return i < 0 ? undefined : argv[i + 1];
}

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const dir = argumento(process.argv, "--dir") ?? dirGeoPorDefecto();
  const geo = argumento(process.argv, "--geo") ?? resolve(dir, "geo_cepii.xls");
  const dist = argumento(process.argv, "--dist") ?? resolve(dir, "dist_cepii.xls");
  const paises = parseGeoPaises(xlsACsv(geo, "geo_cepii"));
  const diadas = parseGeoDiadas(xlsACsv(dist, "dist_cepii"));
  exigirClaveCiudad(paises);
  const iso3 = new Set(paises.map((f) => f.iso3)).size;
  process.stdout.write(
    `geodist: ${paises.length} filas de país, ${iso3} ISO3, ${diadas.length} díadas${dryRun ? " (dry-run)" : ""}\n`,
  );
  if (dryRun) return;
  const pool = connect("bcrp-comercio-exterior");
  try {
    await pool.query(DDL);
    await insertarPaises(pool, paises);
    await insertarDiadas(pool, diadas);
  } finally {
    await pool.end();
  }
}

const esEjecucionDirecta =
  process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;

if (esEjecucionDirecta) {
  main().catch((err) => {
    console.error("geodist falló:", err instanceof Error ? err.message : err);
    process.exit(1);
  });
}
