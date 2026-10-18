/**
 * Conector CLI — Doing Business histórico, un archivo congelado.
 *
 * El informe se discontinuó el 16 de septiembre de 2021. El archivo es el
 * Excel corregido que publica el archivo del Banco Mundial:
 *   https://archive.doingbusiness.org/content/dam/doingBusiness/excel/db2020/Historical-data---COMPLETE-dataset-with-scores.xlsx
 * Hoja `All Data`. La fila de temas está encima del encabezado
 * `Country code | Economy | Region | Income group | DB Year | …`.
 * DB Year es el año del informe en el archivo (2004–2020). No se reetiqueta.
 * Nombres de indicador repetidos (Procedures, Time) se distinguen por el tema.
 * `No Practice`, `No VAT`, `..` y `N/A` se guardan como nota, no como número.
 * Un texto `.5` es 0.5. No se concuerda con B-READY. No hay scheduler.
 *
 * Uso:
 *   npx tsx src/ingest/doing-business.ts --archivo <xlsx> --dry-run
 */
import { readFileSync } from "node:fs";
import { basename } from "node:path";
import { pathToFileURL } from "node:url";
import { connect } from "./db.js";
import { leerSharedStrings } from "./bready.js";
import { decodificarXml } from "./xlsx-rows.js";
import { entrada, readZipEntries } from "./zip-entries.js";

const HOJA = "All Data";
const IDENTIDAD = ["Country code", "Economy", "Region", "Income group", "DB Year"] as const;

const DDL = `
CREATE TABLE IF NOT EXISTS doingbusiness_historico (
  id            BIGSERIAL PRIMARY KEY,
  country_code  TEXT NOT NULL,
  economy       TEXT NOT NULL,
  region        TEXT NOT NULL,
  income_group  TEXT NOT NULL,
  db_year       SMALLINT NOT NULL,
  tema          TEXT NOT NULL,
  indicador     TEXT NOT NULL,
  valor         DOUBLE PRECISION,
  nota          TEXT,
  archivo       TEXT NOT NULL,
  UNIQUE (country_code, db_year, tema, indicador)
);
CREATE INDEX IF NOT EXISTS idx_doingbusiness_pais
  ON doingbusiness_historico (country_code, db_year);
`;

export interface DoingBusinessFila {
  countryCode: string;
  economy: string;
  region: string;
  incomeGroup: string;
  dbYear: number;
  tema: string;
  indicador: string;
  valor: number | null;
  nota: string | null;
}

function indiceColumna(letras: string): number {
  let n = 0;
  for (const ch of letras) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}

function densificar(celdas: { col: number; valor: string }[]): string[] {
  const max = celdas.reduce((m, c) => Math.max(m, c.col), -1);
  const out = Array.from({ length: max + 1 }, () => "");
  for (const c of celdas) out[c.col] = c.valor;
  return out;
}

const CELDA_RE = /<c r="([A-Z]+)(\d+)"([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g;
const FILA_RE = /<row\b[^>]*?(?:\/>|>([\s\S]*?)<\/row>)/g;

export function filasDoingBusiness(sheetXml: string, shared: string[]): string[][] {
  const filas: string[][] = [];
  for (const fila of sheetXml.matchAll(FILA_RE)) {
    const cuerpo = fila[1] ?? "";
    const celdas: { col: number; valor: string }[] = [];
    CELDA_RE.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = CELDA_RE.exec(cuerpo)) !== null) {
      const attrs = m[3];
      const inner = m[4] ?? "";
      const v = inner.match(/<v>([\s\S]*?)<\/v>/);
      const inline = inner.match(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/);
      let valor = "";
      if (/\bt="s"/.test(attrs)) {
        if (!v) throw new Error(`Celda ${m[1]}${m[2]} sin índice de shared string`);
        const idx = Number(v[1]);
        if (!Number.isInteger(idx) || shared[idx] === undefined) {
          throw new Error(`sharedStrings sin índice ${v[1]}`);
        }
        valor = shared[idx];
      } else if (inline) {
        valor = decodificarXml(inline[1]);
      } else if (v) {
        valor = decodificarXml(v[1]);
      }
      celdas.push({ col: indiceColumna(m[1]), valor });
    }
    filas.push(densificar(celdas));
  }
  return filas;
}

function hojaXml(entries: Map<string, Buffer>): string {
  const workbook = entrada(entries, "xl/workbook.xml").toString("utf8");
  const rels = entrada(entries, "xl/_rels/workbook.xml.rels").toString("utf8");
  const hoja = workbook.match(new RegExp(`<sheet name="${HOJA}"[^>]*r:id="([^"]+)"`));
  if (!hoja) throw new Error(`El libro no trae la hoja ${HOJA}`);
  const rel = rels.match(new RegExp(`Id="${hoja[1]}"[^>]*Target="([^"]+)"`));
  if (!rel) throw new Error(`Sin relación para ${HOJA}`);
  const target = rel[1].replace(/^\//, "");
  const ruta = target.startsWith("xl/") ? target : `xl/${target}`;
  return entrada(entries, ruta).toString("utf8");
}

export function leerDoingBusiness(buf: Buffer): string[][] {
  const entries = readZipEntries(buf);
  const shared = leerSharedStrings(entrada(entries, "xl/sharedStrings.xml").toString("utf8"));
  return filasDoingBusiness(hojaXml(entries), shared);
}

function pad(fila: string[], n: number): string[] {
  return fila.length >= n ? fila : [...fila, ...Array.from({ length: n - fila.length }, () => "")];
}

function temasDe(filaTema: string[], n: number): string[] {
  const base = pad(filaTema, n);
  let cur = "";
  return base.map((celda, i) => {
    if (i < IDENTIDAD.length) return "";
    if (celda !== "") cur = celda;
    if (cur === "") throw new Error(`Doing Business sin tema en la columna ${i}`);
    return cur;
  });
}

function clasificar(raw: string): { valor: number | null; nota: string | null } | null {
  if (raw.trim() === "") return null;
  const s = raw.trim();
  if (/^-?\d+(\.\d+)?$/.test(s) || /^\.\d+$/.test(s)) {
    const n = Number(s);
    if (!Number.isFinite(n)) throw new Error(`Número Doing Business ilegible: ${raw}`);
    return { valor: n, nota: null };
  }
  return { valor: null, nota: raw };
}

export function parseDoingBusiness(filas: string[][]): DoingBusinessFila[] {
  const headerIdx = filas.findIndex((f) => f[0] === IDENTIDAD[0]);
  if (headerIdx < 1) throw new Error("Doing Business sin la fila Country code");
  const header = filas[headerIdx];
  for (let i = 0; i < IDENTIDAD.length; i++) {
    if (header[i] !== IDENTIDAD[i]) {
      throw new Error(`Encabezado Doing Business distinto en columna ${i}: ${header[i] ?? ""}`);
    }
  }
  const temas = temasDe(filas[headerIdx - 1], header.length);
  const vistosEnc = new Set<string>();
  for (let i = IDENTIDAD.length; i < header.length; i++) {
    if (header[i] === "") continue;
    const clave = `${temas[i]}\u0000${header[i]}`;
    if (vistosEnc.has(clave)) throw new Error(`Indicador Doing Business repetido: ${temas[i]} / ${header[i]}`);
    vistosEnc.add(clave);
  }
  const out: DoingBusinessFila[] = [];
  const vistos = new Set<string>();
  for (const cruda of filas.slice(headerIdx + 1)) {
    const fila = pad(cruda, header.length);
    if (fila.every((c) => c.trim() === "")) continue;
    const tieneIndicador = fila.slice(IDENTIDAD.length).some((c) => c.trim() !== "");
    if (!/^\d{4}$/.test(fila[4].trim())) {
      if (!tieneIndicador) continue;
      throw new Error(`Año DB ilegible: ${fila[4]}`);
    }
    if (fila[0].trim() === "") throw new Error("Fila Doing Business sin código de país");
    const dbYear = Number(fila[4].trim());
    for (let i = IDENTIDAD.length; i < header.length; i++) {
      const celda = clasificar(fila[i] ?? "");
      if (!celda) continue;
      if (header[i] === "") throw new Error(`Valor Doing Business sin indicador en la columna ${i}`);
      const clave = `${fila[0]}\u0000${dbYear}\u0000${temas[i]}\u0000${header[i]}`;
      if (vistos.has(clave)) throw new Error(`Fila Doing Business repetida: ${fila[0]} ${dbYear} ${header[i]}`);
      vistos.add(clave);
      out.push({
        countryCode: fila[0],
        economy: fila[1],
        region: fila[2],
        incomeGroup: fila[3],
        dbYear,
        tema: temas[i],
        indicador: header[i],
        valor: celda.valor,
        nota: celda.nota,
      });
    }
  }
  if (out.length === 0) throw new Error("Doing Business no trajo valores");
  return out;
}

async function insertar(pool: ReturnType<typeof connect>, filas: DoingBusinessFila[], archivo: string): Promise<void> {
  const TAM = 400;
  for (let i = 0; i < filas.length; i += TAM) {
    const lote = filas.slice(i, i + TAM);
    const valores: unknown[] = [];
    const tuplas: string[] = [];
    for (const f of lote) {
      const base = valores.length;
      tuplas.push(`(${Array.from({ length: 10 }, (_, j) => `$${base + j + 1}`).join(",")})`);
      valores.push(
        f.countryCode, f.economy, f.region, f.incomeGroup, f.dbYear,
        f.tema, f.indicador, f.valor, f.nota, archivo,
      );
    }
    await pool.query(
      `INSERT INTO doingbusiness_historico (
         country_code, economy, region, income_group, db_year, tema, indicador, valor, nota, archivo)
       VALUES ${tuplas.join(",")}
       ON CONFLICT (country_code, db_year, tema, indicador) DO UPDATE SET
         economy = EXCLUDED.economy, region = EXCLUDED.region, income_group = EXCLUDED.income_group,
         valor = EXCLUDED.valor, nota = EXCLUDED.nota, archivo = EXCLUDED.archivo`,
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
  const archivo = argumento(process.argv, "--archivo");
  if (!archivo) throw new Error("Falta --archivo. No hay otra llamada ni se baja otro libro.");
  const filas = parseDoingBusiness(leerDoingBusiness(readFileSync(archivo)));
  const pares = new Set(filas.map((f) => `${f.countryCode}\u0000${f.dbYear}`));
  const codigos = new Set(filas.map((f) => f.countryCode));
  let min = Infinity;
  let max = -Infinity;
  for (const f of filas) {
    if (f.dbYear < min) min = f.dbYear;
    if (f.dbYear > max) max = f.dbYear;
  }
  process.stdout.write(
    `doing-business: ${filas.length} filas, ${pares.size} pares país-año, ` +
      `DB Year ${min}-${max}, ${codigos.size} códigos${dryRun ? " (dry-run)" : ""}\n`,
  );
  if (dryRun) return;
  const pool = connect("bcrp-comercio-exterior");
  try {
    await pool.query(DDL);
    await insertar(pool, filas, basename(archivo));
  } finally {
    await pool.end();
  }
}

const esEjecucionDirecta =
  process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;

if (esEjecucionDirecta) {
  main().catch((err) => {
    console.error("doing-business falló:", err instanceof Error ? err.message : err);
    process.exit(1);
  });
}
