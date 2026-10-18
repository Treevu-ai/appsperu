/**
 * Conector CLI — CEPII BACI HS92, vintage 202601.
 *
 * El zip local del estudio es
 *   investigaciones/rca-shift-share-cptpp-china/data/raw/BACI_HS92_V202601.zip
 * Un CSV anual no se descomprime a disco. 7-Zip lo escribe por stdout y esta
 * corrida se queda solo con un exportador.
 *
 * Conteo del 2026-10-17 sobre BACI_HS92_Y2024_V202601.csv, encabezado real
 * `t,i,j,k,v,q`: 10580049 filas mundiales y 43022 con exportador 604 (Perú,
 * 171 socios). El panel mundial no se carga. El default del estudio de
 * gravedad es Perú, todos los socios, HS6, 2015–2024. No se mezclan otras
 * revisiones del Sistema Armonizado. `rta_20260111` no es esta tabla.
 *
 * Valores `v` en miles de USD y cantidades `q` en toneladas, como el Readme
 * de la versión 202601 (publicada el 2026-01-22).
 *
 * Uso:
 *   npx tsx src/ingest/baci.ts --dry-run --anio 2024
 *   npx tsx src/ingest/baci.ts --desde 2015 --hasta 2024
 */
import { spawn } from "node:child_process";
import { createInterface } from "node:readline";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { connect } from "./db.js";
import { partirCsv } from "./atlas-rankings.js";
import { resolver7z } from "./lsci.js";

export const BACI_COLUMNAS = ["t", "i", "j", "k", "v", "q"] as const;
export const BACI_VINTAGE = "202601";
export const BACI_PERU = 604;
export const BACI_FILAS_MUNDO_2024 = 10_580_049;
export const BACI_DESDE_DEFAULT = 2015;
export const BACI_HASTA_DEFAULT = 2024;

const DDL = `
CREATE TABLE IF NOT EXISTS baci_flujos (
  id               BIGSERIAL PRIMARY KEY,
  anio             SMALLINT NOT NULL,
  exportador       INTEGER NOT NULL,
  importador       INTEGER NOT NULL,
  hs6              TEXT NOT NULL,
  valor_miles_usd  DOUBLE PRECISION,
  cantidad         DOUBLE PRECISION,
  vintage          TEXT NOT NULL,
  archivo          TEXT NOT NULL,
  UNIQUE (anio, exportador, importador, hs6, vintage)
);
CREATE INDEX IF NOT EXISTS idx_baci_flujos_anio ON baci_flujos (anio, exportador);
`;

export interface BaciFila {
  anio: number;
  exportador: number;
  importador: number;
  hs6: string;
  valorMilesUsd: number | null;
  cantidad: number | null;
  vintage: string;
  archivo: string;
}

export function zipBaciPorDefecto(): string {
  return resolve(
    dirname(fileURLToPath(import.meta.url)),
    "..", "..", "..",
    "investigaciones", "rca-shift-share-cptpp-china", "data", "raw",
    "BACI_HS92_V202601.zip",
  );
}

export function archivoBaci(anio: number): string {
  return `BACI_HS92_Y${anio}_V${BACI_VINTAGE}.csv`;
}

/** El panel mundial queda fuera. Un año 2024 no cabe en una carga ingenua. */
export function rechazarPanelMundial(argv: readonly string[]): void {
  if (argv.includes("--mundo")) {
    throw new Error(
      `Un año mundial de BACI HS92 V${BACI_VINTAGE} (2024) tiene ${BACI_FILAS_MUNDO_2024} filas. ` +
        "Esta corrida no carga el panel mundial.",
    );
  }
}

function numeroOpcional(raw: string, campo: string): number | null {
  if (raw === "") return null;
  const n = Number(raw);
  if (!Number.isFinite(n)) throw new Error(`Valor no numérico en ${campo}: ${raw}`);
  return n;
}

function entero(raw: string, campo: string): number {
  if (!/^-?\d+$/.test(raw)) throw new Error(`${campo} BACI inválido: ${raw}`);
  return Number(raw);
}

export function exigirEncabezadoBaci(header: string[]): void {
  if (header.join("|") !== BACI_COLUMNAS.join("|")) {
    throw new Error(`Encabezado BACI distinto al de V${BACI_VINTAGE}: ${header.join(",")}`);
  }
}

/** Devuelve null cuando el exportador no es el pedido. No rellena otras revisiones. */
export function filaBaci(
  campos: string[],
  opts: { exportador: number; archivo: string },
): BaciFila | null {
  if (campos.length !== BACI_COLUMNAS.length) {
    throw new Error(`Fila BACI trae ${campos.length} columnas`);
  }
  const exportador = entero(campos[1], "Exportador");
  if (exportador !== opts.exportador) return null;
  const hs6 = campos[3];
  if (!/^\d{6}$/.test(hs6)) throw new Error(`HS6 BACI inválido: ${hs6}`);
  return {
    anio: entero(campos[0], "Año"),
    exportador,
    importador: entero(campos[2], "Importador"),
    hs6,
    valorMilesUsd: numeroOpcional(campos[4], "v"),
    cantidad: numeroOpcional(campos[5], "q"),
    vintage: BACI_VINTAGE,
    archivo: opts.archivo,
  };
}

export function parseBaciCsv(texto: string, exportador = BACI_PERU, archivo = archivoBaci(2024)): BaciFila[] {
  const lineas = texto.replace(/^\uFEFF/, "").split(/\r?\n/).filter((l) => l.length > 0);
  exigirEncabezadoBaci(partirCsv(lineas[0] ?? ""));
  const filas: BaciFila[] = [];
  for (let i = 1; i < lineas.length; i++) {
    const fila = filaBaci(partirCsv(lineas[i]), { exportador, archivo });
    if (fila) filas.push(fila);
  }
  return filas;
}

function leerAnio(zip: string, anio: number, exportador: number): Promise<BaciFila[]> {
  const archivo = archivoBaci(anio);
  const bin = resolver7z();
  const child = spawn(bin, ["e", "-so", "-bd", zip, archivo], { windowsHide: true });
  let stderr = "";
  child.stderr.on("data", (buf: Buffer) => {
    stderr += buf.toString("utf8");
  });
  const cerrado = new Promise<number>((ok, fail) => {
    child.on("error", (err) => {
      fail(new Error(`No se pudo ejecutar 7z (${bin}). Instalá 7-Zip o definí SEVEN_ZIP. ${err.message}`));
    });
    child.on("close", (code) => ok(code ?? 1));
  });
  const rl = createInterface({ input: child.stdout, crlfDelay: Infinity });
  const filas: BaciFila[] = [];
  const lectura = (async () => {
    let headerVisto = false;
    try {
    for await (const linea of rl) {
      if (!headerVisto) {
        try {
          exigirEncabezadoBaci(partirCsv(linea.replace(/^\uFEFF/, "")));
        } catch (err) {
          child.kill();
          throw err;
        }
        headerVisto = true;
        continue;
      }
      if (linea.length === 0) continue;
      const fila = filaBaci(partirCsv(linea), { exportador, archivo });
      if (fila) filas.push(fila);
    }
    if (!headerVisto) throw new Error(`BACI no trajo encabezado en ${archivo}`);
    } catch (err) {
      child.kill();
      throw err;
    }
  })();
  return lectura.then(async () => {
    const code = await cerrado;
    if (code !== 0) throw new Error(`7z salió ${code} al leer ${archivo}: ${stderr.trim()}`);
    return filas;
  });
}

async function insertar(pool: ReturnType<typeof connect>, filas: BaciFila[]): Promise<void> {
  const TAM = 500;
  for (let i = 0; i < filas.length; i += TAM) {
    const lote = filas.slice(i, i + TAM);
    const valores: unknown[] = [];
    const tuplas: string[] = [];
    for (const f of lote) {
      const base = valores.length;
      tuplas.push(`(${Array.from({ length: 8 }, (_, j) => `$${base + j + 1}`).join(",")})`);
      valores.push(f.anio, f.exportador, f.importador, f.hs6, f.valorMilesUsd, f.cantidad, f.vintage, f.archivo);
    }
    await pool.query(
      `INSERT INTO baci_flujos
         (anio, exportador, importador, hs6, valor_miles_usd, cantidad, vintage, archivo)
       VALUES ${tuplas.join(",")}
       ON CONFLICT (anio, exportador, importador, hs6, vintage) DO UPDATE SET
         valor_miles_usd = EXCLUDED.valor_miles_usd,
         cantidad = EXCLUDED.cantidad,
         archivo = EXCLUDED.archivo`,
      valores,
    );
  }
}

function argumento(argv: readonly string[], nombre: string): string | undefined {
  const i = argv.indexOf(nombre);
  if (i < 0) return undefined;
  return argv[i + 1];
}

export function aniosPedidos(argv: readonly string[]): number[] {
  const suelto = argumento(argv, "--anio");
  const desde = Number(argumento(argv, "--desde") ?? suelto ?? BACI_DESDE_DEFAULT);
  const hasta = Number(argumento(argv, "--hasta") ?? suelto ?? BACI_HASTA_DEFAULT);
  if (!Number.isInteger(desde) || !Number.isInteger(hasta) || desde < 1995 || hasta > 2024 || desde > hasta) {
    throw new Error(`Rango BACI inválido: ${desde}–${hasta}. El zip V${BACI_VINTAGE} cubre 1995–2024.`);
  }
  const anios: number[] = [];
  for (let anio = desde; anio <= hasta; anio++) anios.push(anio);
  return anios;
}

export function exportadorPedido(argv: readonly string[]): number {
  const raw = argumento(argv, "--exportador") ?? String(BACI_PERU);
  if (!/^\d+$/.test(raw)) {
    throw new Error(`Exportador BACI inválido: ${raw}. El default es ${BACI_PERU} (Perú). No hay carga mundial.`);
  }
  return Number(raw);
}

async function main() {
  rechazarPanelMundial(process.argv);
  const dryRun = process.argv.includes("--dry-run");
  const exportador = exportadorPedido(process.argv);
  const anios = aniosPedidos(process.argv);
  const zip = argumento(process.argv, "--zip") ?? zipBaciPorDefecto();
  const filas: BaciFila[] = [];
  for (const anio of anios) {
    const delAnio = await leerAnio(zip, anio, exportador);
    process.stdout.write(`baci ${anio}: ${delAnio.length} filas del exportador ${exportador}\n`);
    filas.push(...delAnio);
  }
  process.stdout.write(
    `baci: ${filas.length} filas, exportador ${exportador}, años ${anios[0]}-${anios[anios.length - 1]}, ` +
      `vintage ${BACI_VINTAGE}${dryRun ? " (dry-run)" : ""}\n`,
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
    console.error("baci falló:", err instanceof Error ? err.message : err);
    process.exit(1);
  });
}
