/**
 * Conector CLI — CEPII BACI HS92, vintage 202601.
 *
 * El zip local del estudio es
 *   investigaciones/rca-shift-share-cptpp-china/data/raw/BACI_HS92_V202601.zip
 * Un CSV anual no se descomprime a disco. 7-Zip lo escribe por stdout y esta
 * corrida se queda con un solo país foco, en los dos sentidos del flujo
 * (como exportador y como importador).
 *
 * Conteo del 2026-10-17 sobre BACI_HS92_Y2024_V202601.csv, encabezado real
 * `t,i,j,k,v,q`: 10580049 filas mundiales, 43022 con exportador 604 (Perú) y
 * 67793 con importador 604. El panel mundial no se carga. El default del
 * estudio de gravedad es Perú (ambos sentidos), todos los socios, HS6,
 * 2015–2024. No se mezclan otras revisiones del Sistema Armonizado.
 * `rta_20260111` no es esta tabla.
 *
 * El mismo zip trae country_codes_V202601.csv (código CEPII, nombre, ISO2,
 * ISO3), 238 filas. Se carga siempre junto al panel de flujos: es la única
 * forma de nombrar a un socio sin salir de esta tabla. Cuatro códigos son
 * agregados sin ISO2 real (ej. "Other Asia, nes", Namibia por un hueco del
 * propio archivo fuente): iso2 queda NULL, no se inventa un valor.
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
CREATE INDEX IF NOT EXISTS idx_baci_flujos_importador ON baci_flujos (anio, importador);
CREATE TABLE IF NOT EXISTS baci_paises (
  id            BIGSERIAL PRIMARY KEY,
  country_code  INTEGER NOT NULL,
  country_name  TEXT NOT NULL,
  iso2          TEXT,
  iso3          TEXT NOT NULL,
  vintage       TEXT NOT NULL,
  archivo       TEXT NOT NULL,
  UNIQUE (country_code, vintage)
);
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

export const BACI_PAISES_COLUMNAS = ["country_code", "country_name", "country_iso2", "country_iso3"] as const;
export const BACI_ARCHIVO_PAISES = "country_codes_V202601.csv";

export interface BaciPais {
  countryCode: number;
  countryName: string;
  iso2: string | null;
  iso3: string;
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

/** Devuelve null cuando el país foco no exporta ni importa en esta fila. No rellena otras revisiones. */
export function filaBaci(
  campos: string[],
  opts: { pais: number; archivo: string },
): BaciFila | null {
  if (campos.length !== BACI_COLUMNAS.length) {
    throw new Error(`Fila BACI trae ${campos.length} columnas`);
  }
  const exportador = entero(campos[1], "Exportador");
  const importador = entero(campos[2], "Importador");
  if (exportador !== opts.pais && importador !== opts.pais) return null;
  const hs6 = campos[3];
  if (!/^\d{6}$/.test(hs6)) throw new Error(`HS6 BACI inválido: ${hs6}`);
  return {
    anio: entero(campos[0], "Año"),
    exportador,
    importador,
    hs6,
    valorMilesUsd: numeroOpcional(campos[4], "v"),
    cantidad: numeroOpcional(campos[5], "q"),
    vintage: BACI_VINTAGE,
    archivo: opts.archivo,
  };
}

export function parseBaciCsv(texto: string, pais = BACI_PERU, archivo = archivoBaci(2024)): BaciFila[] {
  const lineas = texto.replace(/^\uFEFF/, "").split(/\r?\n/).filter((l) => l.length > 0);
  exigirEncabezadoBaci(partirCsv(lineas[0] ?? ""));
  const filas: BaciFila[] = [];
  for (let i = 1; i < lineas.length; i++) {
    const fila = filaBaci(partirCsv(lineas[i]), { pais, archivo });
    if (fila) filas.push(fila);
  }
  return filas;
}

export function parseBaciPaises(texto: string, archivo = BACI_ARCHIVO_PAISES): BaciPais[] {
  const lineas = texto.replace(/^﻿/, "").split(/\r?\n/).filter((l) => l.length > 0);
  const header = partirCsv(lineas[0] ?? "");
  if (header.join("|") !== BACI_PAISES_COLUMNAS.join("|")) {
    throw new Error(`Encabezado del catálogo de países BACI distinto: ${header.join(",")}`);
  }
  return lineas.slice(1).map((linea, i) => {
    const c = partirCsv(linea);
    if (c.length !== BACI_PAISES_COLUMNAS.length) {
      throw new Error(`Fila ${i + 2} del catálogo de países BACI trae ${c.length} columnas`);
    }
    const [codigo, nombre, iso2, iso3] = c;
    if (!/^\d+$/.test(codigo)) throw new Error(`Código de país BACI inválido: ${codigo}`);
    if (!nombre || !iso3) throw new Error(`Fila ${i + 2} del catálogo de países BACI incompleta`);
    return {
      countryCode: Number(codigo),
      countryName: nombre,
      iso2: iso2 === "" ? null : iso2,
      iso3,
      vintage: BACI_VINTAGE,
      archivo,
    };
  });
}

function leerAnio(zip: string, anio: number, pais: number): Promise<BaciFila[]> {
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
      const fila = filaBaci(partirCsv(linea), { pais, archivo });
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

function leerPaises(zip: string): Promise<BaciPais[]> {
  const bin = resolver7z();
  const child = spawn(bin, ["e", "-so", "-bd", zip, BACI_ARCHIVO_PAISES], { windowsHide: true });
  const trozos: Buffer[] = [];
  let stderr = "";
  child.stdout.on("data", (buf: Buffer) => trozos.push(buf));
  child.stderr.on("data", (buf: Buffer) => {
    stderr += buf.toString("utf8");
  });
  return new Promise((ok, fail) => {
    child.on("error", (err) => fail(new Error(`No se pudo ejecutar 7z (${bin}). ${err.message}`)));
    child.on("close", (code) => {
      if (code !== 0) {
        fail(new Error(`7z salió ${code} al leer ${BACI_ARCHIVO_PAISES}: ${stderr.trim()}`));
        return;
      }
      ok(parseBaciPaises(Buffer.concat(trozos).toString("utf8")));
    });
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

async function insertarPaises(pool: ReturnType<typeof connect>, filas: BaciPais[]): Promise<void> {
  const valores: unknown[] = [];
  const tuplas: string[] = [];
  for (const f of filas) {
    const base = valores.length;
    tuplas.push(`(${Array.from({ length: 6 }, (_, j) => `$${base + j + 1}`).join(",")})`);
    valores.push(f.countryCode, f.countryName, f.iso2, f.iso3, f.vintage, f.archivo);
  }
  await pool.query(
    `INSERT INTO baci_paises (country_code, country_name, iso2, iso3, vintage, archivo)
     VALUES ${tuplas.join(",")}
     ON CONFLICT (country_code, vintage) DO UPDATE SET
       country_name = EXCLUDED.country_name, iso2 = EXCLUDED.iso2, iso3 = EXCLUDED.iso3,
       archivo = EXCLUDED.archivo`,
    valores,
  );
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

export function paisPedido(argv: readonly string[]): number {
  const raw = argumento(argv, "--pais") ?? String(BACI_PERU);
  if (!/^\d+$/.test(raw)) {
    throw new Error(`País foco BACI inválido: ${raw}. El default es ${BACI_PERU} (Perú). No hay carga mundial.`);
  }
  return Number(raw);
}

async function main() {
  rechazarPanelMundial(process.argv);
  const dryRun = process.argv.includes("--dry-run");
  const pais = paisPedido(process.argv);
  const anios = aniosPedidos(process.argv);
  const zip = argumento(process.argv, "--zip") ?? zipBaciPorDefecto();
  const paises = await leerPaises(zip);
  const filas: BaciFila[] = [];
  for (const anio of anios) {
    const delAnio = await leerAnio(zip, anio, pais);
    process.stdout.write(`baci ${anio}: ${delAnio.length} filas del país ${pais} (exporta o importa)\n`);
    filas.push(...delAnio);
  }
  process.stdout.write(
    `baci: ${filas.length} filas, país ${pais}, años ${anios[0]}-${anios[anios.length - 1]}, ` +
      `vintage ${BACI_VINTAGE}, ${paises.length} países en el catálogo${dryRun ? " (dry-run)" : ""}\n`,
  );
  if (dryRun) return;
  const pool = connect("bcrp-comercio-exterior");
  try {
    await pool.query(DDL);
    await insertar(pool, filas);
    await insertarPaises(pool, paises);
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
