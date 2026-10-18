/**
 * Conector CLI — UNCTAD Liner Shipping Connectivity Index (US.LSCI).
 *
 * Verificado el 2026-10-17: el bulk
 *   https://unctadstat-api.unctad.org/bulkdownload/US.LSCI/US_LSCI
 * es un 7z (firma 37 7A BC AF 27 1C), 205865 bytes, con un solo CSV
 * `US_LSCI.csv` (1090422 bytes, fecha interna 2026-09-08). El rango del
 * archivo es 2006Q01–2026Q03. No se piden US.LSCI_M ni US.PLSCI.
 *
 * La descompresión usa el binario `7z` (7-Zip). No hay descompresor LZMA2
 * en el repo y no se agrega una dependencia para un archivo de 200 KB.
 *
 * Uso:
 *   npx tsx src/ingest/lsci.ts --dry-run
 *   npx tsx src/ingest/lsci.ts --publicado 2026-09-18
 */
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { connect } from "./db.js";
import { partirCsv } from "./atlas-rankings.js";

const URL_BULK = "https://unctadstat-api.unctad.org/bulkdownload/US.LSCI/US_LSCI";

export const LSCI_COLUMNAS = [
  "Quarter",
  "Quarter Label",
  "Economy",
  "Economy Label",
  "Index (average Q1 2023 = 100)",
  "Index (average Q1 2023 = 100) Footnote",
  "Index (average Q1 2023 = 100) Missing value",
  "Growth rate, year-on-year",
  "Growth rate, year-on-year Footnote",
  "Growth rate, year-on-year Missing value",
  "Growth rate (over previous period)",
  "Growth rate (over previous period) Footnote",
  "Growth rate (over previous period) Missing value",
  "Ranking per quarter",
  "Ranking per quarter Footnote",
  "Ranking per quarter Missing value",
] as const;

const MEDIDAS: Array<{ indice: number; codigo: string }> = [
  { indice: 4, codigo: "index" },
  { indice: 7, codigo: "growth_yoy" },
  { indice: 10, codigo: "growth_previous" },
  { indice: 13, codigo: "ranking" },
];

const DDL = `
CREATE TABLE IF NOT EXISTS lsci (
  id                BIGSERIAL PRIMARY KEY,
  economia_codigo   TEXT NOT NULL,
  economia_nombre   TEXT NOT NULL,
  periodo           TEXT NOT NULL,
  periodo_etiqueta  TEXT NOT NULL,
  indicador         TEXT NOT NULL,
  valor             DOUBLE PRECISION NOT NULL,
  publicado_el      TEXT NOT NULL DEFAULT '',
  archivo           TEXT NOT NULL,
  UNIQUE (economia_codigo, periodo, indicador)
);
CREATE INDEX IF NOT EXISTS idx_lsci_periodo ON lsci (periodo);
`;

export interface LsciFila {
  economiaCodigo: string;
  economiaNombre: string;
  periodo: string;
  periodoEtiqueta: string;
  indicador: string;
  valor: number;
  publicadoEl: string;
  archivo: string;
}

export function parseLsciCsv(texto: string, publicadoEl = ""): LsciFila[] {
  const lineas = texto.replace(/^\uFEFF/, "").split(/\r?\n/).filter((l) => l.length > 0);
  const header = partirCsv(lineas[0] ?? "");
  if (header.join("|") !== LSCI_COLUMNAS.join("|")) {
    throw new Error(`Encabezado LSCI distinto al de US_LSCI.csv: ${header.join(",")}`);
  }
  const filas: LsciFila[] = [];
  for (let i = 1; i < lineas.length; i++) {
    const c = partirCsv(lineas[i]);
    if (c.length === 1 && c[0] === "") continue;
    if (c.length !== LSCI_COLUMNAS.length) {
      throw new Error(`Fila ${i + 1} de LSCI trae ${c.length} columnas`);
    }
    const periodo = c[0];
    if (!/^\d{4}Q0[1-4]$/.test(periodo)) {
      throw new Error(`Periodo LSCI inválido en la fila ${i + 1}: ${periodo}`);
    }
    for (const medida of MEDIDAS) {
      const raw = c[medida.indice];
      if (raw === "") continue;
      const valor = Number(raw);
      if (!Number.isFinite(valor)) {
        throw new Error(`Valor no numérico en ${medida.codigo}, fila ${i + 1}: ${raw}`);
      }
      filas.push({
        economiaCodigo: c[2],
        economiaNombre: c[3],
        periodo,
        periodoEtiqueta: c[1],
        indicador: medida.codigo,
        valor,
        publicadoEl,
        archivo: "US_LSCI.csv",
      });
    }
  }
  return filas;
}

export function resolver7z(): string {
  const desdeEntorno = process.env.SEVEN_ZIP;
  const candidatos = [
    desdeEntorno,
    "C:\\Program Files\\7-Zip\\7z.exe",
    "C:\\Program Files (x86)\\7-Zip\\7z.exe",
  ].filter((p): p is string => Boolean(p));
  for (const ruta of candidatos) {
    if (existsSync(ruta)) return ruta;
  }
  return "7z";
}

export function extraerCsv7z(buf: Buffer): string {
  const dir = mkdtempSync(join(tmpdir(), "lsci-"));
  const archivo = join(dir, "bulk.7z");
  try {
    writeFileSync(archivo, buf);
    const bin = resolver7z();
    const resultado = spawnSync(bin, ["e", "-so", archivo], { maxBuffer: 20_000_000 });
    if (resultado.error) {
      throw new Error(
        `No se pudo ejecutar 7z (${bin}). Instalá 7-Zip o definí SEVEN_ZIP. ${resultado.error.message}`,
      );
    }
    if (resultado.status !== 0) {
      throw new Error(`7z salió ${resultado.status}: ${resultado.stderr.toString()}`);
    }
    return resultado.stdout.toString("utf8");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

async function bajarBulk(): Promise<Buffer> {
  const res = await fetch(URL_BULK, { signal: AbortSignal.timeout(60_000) });
  if (!res.ok) throw new Error(`UNCTADstat devolvió HTTP ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

function rango(filas: LsciFila[]): string {
  const periodos = [...new Set(filas.map((f) => f.periodo))].sort();
  return `${periodos[0] ?? "?"}–${periodos[periodos.length - 1] ?? "?"}`;
}

async function insertar(pool: ReturnType<typeof connect>, filas: LsciFila[]): Promise<void> {
  const TAM = 400;
  for (let i = 0; i < filas.length; i += TAM) {
    const lote = filas.slice(i, i + TAM);
    const valores: unknown[] = [];
    const tuplas: string[] = [];
    for (const f of lote) {
      const base = valores.length;
      tuplas.push(`(${Array.from({ length: 8 }, (_, j) => `$${base + j + 1}`).join(",")})`);
      valores.push(
        f.economiaCodigo, f.economiaNombre, f.periodo, f.periodoEtiqueta,
        f.indicador, f.valor, f.publicadoEl, f.archivo,
      );
    }
    await pool.query(
      `INSERT INTO lsci
         (economia_codigo, economia_nombre, periodo, periodo_etiqueta,
          indicador, valor, publicado_el, archivo)
       VALUES ${tuplas.join(",")}
       ON CONFLICT (economia_codigo, periodo, indicador) DO UPDATE SET
         economia_nombre = EXCLUDED.economia_nombre,
         periodo_etiqueta = EXCLUDED.periodo_etiqueta,
         valor = EXCLUDED.valor,
         publicado_el = EXCLUDED.publicado_el,
         archivo = EXCLUDED.archivo`,
      valores,
    );
  }
}

function publicadoDe(argv: string[]): string {
  const i = argv.indexOf("--publicado");
  return i >= 0 ? (argv[i + 1] ?? "") : "";
}

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const publicadoEl = publicadoDe(process.argv);
  const buf = await bajarBulk();
  const filas = parseLsciCsv(extraerCsv7z(buf), publicadoEl);
  process.stdout.write(
    `lsci: ${filas.length} filas, ${rango(filas)}, bulk ${buf.length} bytes${dryRun ? " (dry-run)" : ""}\n`,
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
    console.error("lsci falló:", err instanceof Error ? err.message : err);
    process.exit(1);
  });
}
