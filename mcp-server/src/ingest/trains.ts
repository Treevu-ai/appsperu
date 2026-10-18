/**
 * Conector CLI — UNCTAD TRAINS, una llamada WITS.
 *
 * La API documentada no pide la cuenta del sitio. Esta corrida tampoco
 * guarda una contraseña. Si la respuesta no es el JSON SDMX esperado, se
 * detiene y no inventa filas.
 *
 * Llamada pedida: reporter 604 (Perú), partner 000 (Mundo), product=All,
 * year 2021, datatype=reported, format=JSON.
 * URL: https://wits.worldbank.org/API/V1/SDMX/V21/datasource/TRN/...
 *
 * Archivo capturado el 2026-10-17 (header.prepared 2026-10-17T23:00:26):
 * 5388 series, todas HS6, nomenclatura H5, tipo MFN, medida SimpleAverage.
 * `structure.dimensions.series` declara keyPosition 3 para PRODUCTCODE y 2
 * para PARTNER, pero la clave de serie varía en el tercer campo:
 * `0:0:5:0:0` es el producto de índice 5 (010229), no el partner.
 * Una partida, 271000, trae el conteo de líneas como cadena vacía.
 *
 * No baja medidas no arancelarias ni otro partner.
 *
 * Uso:
 *   npx tsx src/ingest/trains.ts --reporter 604 --anio 2021 --partner 000 --dry-run
 */
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { connect } from "./db.js";

export const TRAINS_ATRIBUTOS = [
  "NOMENCODE",
  "EXCLUDEDFROM",
  "TARIFFTYPE",
  "SUM_OF_RATES",
  "MIN_RATE",
  "MAX_RATE",
  "TOTALNOOFLINES",
  "NBR_PREF_LINES",
  "NBR_MFN_LINES",
  "NBR_NA_LINES",
  "OBS_VALUE_MEASURE",
] as const;

const ENTEROS = new Set(["TOTALNOOFLINES", "NBR_PREF_LINES", "NBR_MFN_LINES", "NBR_NA_LINES"]);

const DDL = `
CREATE TABLE IF NOT EXISTS trains_aranceles (
  id BIGSERIAL PRIMARY KEY,
  anio SMALLINT NOT NULL,
  frecuencia TEXT NOT NULL,
  reporter TEXT NOT NULL,
  partner TEXT NOT NULL,
  producto TEXT NOT NULL,
  producto_nombre TEXT,
  datatype TEXT NOT NULL,
  nomenclatura TEXT,
  excluido_de TEXT,
  tipo_arancel TEXT,
  promedio_simple DOUBLE PRECISION,
  suma_tasas DOUBLE PRECISION,
  tasa_min DOUBLE PRECISION,
  tasa_max DOUBLE PRECISION,
  lineas_total INTEGER,
  lineas_preferenciales INTEGER,
  lineas_mfn INTEGER,
  lineas_na INTEGER,
  medida TEXT,
  consultado TEXT NOT NULL,
  UNIQUE (anio, reporter, partner, producto, datatype)
);
CREATE INDEX IF NOT EXISTS idx_trains_aranceles_producto
  ON trains_aranceles (anio, reporter, producto);
`;

export interface TrainsFila {
  anio: number;
  frecuencia: string;
  reporter: string;
  partner: string;
  producto: string;
  productoNombre: string | null;
  datatype: string;
  nomenclatura: string | null;
  excluidoDe: string | null;
  tipoArancel: string | null;
  promedioSimple: number | null;
  sumaTasas: number | null;
  tasaMin: number | null;
  tasaMax: number | null;
  lineasTotal: number | null;
  lineasPreferenciales: number | null;
  lineasMfn: number | null;
  lineasNa: number | null;
  medida: string | null;
  consultado: string;
}

interface Valor {
  id: string;
  name?: string;
}

interface Dimension {
  id: string;
  keyPosition: number;
  values: Valor[];
}

interface Atributo {
  id: string;
  values: Valor[];
}

export function urlTrains(reporter: string, partner: string, anio: number): string {
  if (!/^\d+$/.test(reporter)) throw new Error(`Reporter TRAINS inválido: ${reporter}`);
  if (!/^[A-Za-z0-9]+$/.test(partner)) throw new Error(`Partner TRAINS inválido: ${partner}`);
  if (!Number.isInteger(anio) || anio < 1988 || anio > 2026) {
    throw new Error(`Año TRAINS inválido: ${anio}`);
  }
  return "https://wits.worldbank.org/API/V1/SDMX/V21/datasource/TRN" +
    `/reporter/${reporter}/partner/${partner}/product/All/year/${anio}/datatype/reported?format=JSON`;
}

function esRegistro(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function dimensiones(doc: Record<string, unknown>): Dimension[] {
  const structure = doc.structure;
  if (!esRegistro(structure) || !esRegistro(structure.dimensions)) {
    throw new Error("TRAINS sin structure.dimensions");
  }
  const series = structure.dimensions.series;
  if (!Array.isArray(series)) throw new Error("TRAINS sin dimensiones de serie");
  return series.map((d) => {
    if (!esRegistro(d) || typeof d.id !== "string" || !Array.isArray(d.values)) {
      throw new Error("Dimensión TRAINS ilegible");
    }
    return {
      id: d.id,
      keyPosition: Number(d.keyPosition),
      values: d.values.map((valor) => {
        if (!esRegistro(valor) || typeof valor.id !== "string") {
          throw new Error(`Valor ilegible en la dimensión ${d.id}`);
        }
        return { id: valor.id, name: typeof valor.name === "string" ? valor.name : undefined };
      }),
    };
  });
}

function atributos(doc: Record<string, unknown>): Atributo[] {
  const structure = doc.structure;
  if (!esRegistro(structure) || !esRegistro(structure.attributes) || !Array.isArray(structure.attributes.observation)) {
    throw new Error("TRAINS sin atributos de observación");
  }
  const lista = structure.attributes.observation.map((a) => {
    if (!esRegistro(a) || typeof a.id !== "string" || !Array.isArray(a.values)) {
      throw new Error("Atributo TRAINS ilegible");
    }
    return {
      id: a.id,
      values: a.values.map((valor) => {
        if (!esRegistro(valor) || typeof valor.id !== "string") {
          throw new Error(`Valor ilegible en el atributo ${a.id}`);
        }
        return { id: valor.id };
      }),
    };
  });
  if (lista.map((a) => a.id).join("|") !== TRAINS_ATRIBUTOS.join("|")) {
    throw new Error(`Atributos TRAINS distintos: ${lista.map((a) => a.id).join(",")}`);
  }
  return lista;
}

function dimension(dims: Dimension[], id: string): Dimension {
  const encontrada = dims.find((d) => d.id === id);
  if (!encontrada) throw new Error(`TRAINS sin la dimensión ${id}`);
  return encontrada;
}

function unico(dim: Dimension): Valor {
  if (dim.values.length !== 1) {
    throw new Error(`TRAINS ${dim.id} trae ${dim.values.length} valores; esta llamada espera uno`);
  }
  return dim.values[0];
}

function ranuraProducto(claves: string[], nProductos: number): number {
  const partes = claves.map((clave) => clave.split(":").map(Number));
  const candidatas: number[] = [];
  const ancho = partes[0]?.length ?? 0;
  for (let s = 0; s < ancho; s++) {
    const idxs = partes.map((p) => p[s]);
    const distintos = new Set(idxs).size;
    const max = Math.max(...idxs);
    if (distintos > 1 && max < nProductos) candidatas.push(s);
  }
  if (candidatas.length !== 1) {
    throw new Error(`Ranura de producto TRAINS ambigua: ${candidatas.join(",") || "ninguna"}`);
  }
  return candidatas[0];
}

function numero(raw: string, campo: string, entero: boolean): number {
  if (!/^-?\d+(\.\d+)?$/.test(raw)) throw new Error(`Valor no numérico en ${campo}: ${raw}`);
  const n = Number(raw);
  if (entero && !Number.isInteger(n)) throw new Error(`Entero esperado en ${campo}: ${raw}`);
  return n;
}

function atributo(arr: unknown[], attrs: Atributo[], id: string): string | null {
  const i = attrs.findIndex((a) => a.id === id);
  const idx = arr[i + 1];
  if (idx === null || idx === undefined) return null;
  if (typeof idx !== "number" || !attrs[i].values[idx]) {
    throw new Error(`Índice inválido de ${id}: ${String(idx)}`);
  }
  const raw = attrs[i].values[idx].id;
  return raw === "" ? null : raw;
}

function anioDelDocumento(doc: Record<string, unknown>): number {
  const structure = doc.structure;
  if (!esRegistro(structure) || !esRegistro(structure.dimensions) || !Array.isArray(structure.dimensions.observation)) {
    throw new Error("TRAINS sin dimensión de año");
  }
  const tiempo = structure.dimensions.observation.find((d) => esRegistro(d) && d.id === "TIME_PERIOD");
  if (!esRegistro(tiempo) || !Array.isArray(tiempo.values) || tiempo.values.length !== 1) {
    throw new Error("TRAINS no trae un único año");
  }
  const valor = tiempo.values[0];
  if (!esRegistro(valor) || typeof valor.id !== "string" || !/^\d{4}$/.test(valor.id)) {
    throw new Error("Año TRAINS ilegible");
  }
  return Number(valor.id);
}

export function parseTrains(doc: unknown): TrainsFila[] {
  if (!esRegistro(doc) || !esRegistro(doc.header) || doc.header.id !== "DF_WITS_Tariff_TRAINS") {
    throw new Error("Encabezado TRAINS distinto");
  }
  if (typeof doc.header.prepared !== "string" || doc.header.prepared.length === 0) {
    throw new Error("TRAINS sin fecha prepared");
  }
  const dims = dimensiones(doc);
  const attrs = atributos(doc);
  const anio = anioDelDocumento(doc);
  const freq = unico(dimension(dims, "FREQ"));
  const reporter = unico(dimension(dims, "REPORTER"));
  const partner = unico(dimension(dims, "PARTNER"));
  const datatype = unico(dimension(dims, "DATATYPE"));
  const productos = dimension(dims, "PRODUCTCODE");
  const dataSets = doc.dataSets;
  if (!Array.isArray(dataSets) || dataSets.length !== 1 || !esRegistro(dataSets[0]) || !esRegistro(dataSets[0].series)) {
    throw new Error("TRAINS no trae una única colección de series");
  }
  const series = dataSets[0].series;
  const claves = Object.keys(series);
  if (claves.length === 0) throw new Error("TRAINS sin series");
  const ranura = productos.values.length === 1 ? null : ranuraProducto(claves, productos.values.length);
  const consultado = doc.header.prepared;
  const filas: TrainsFila[] = [];
  const vistos = new Set<string>();
  for (const clave of claves) {
    const obs = series[clave];
    if (!esRegistro(obs) || !esRegistro(obs.observations)) throw new Error(`Serie TRAINS ilegible: ${clave}`);
    const tiempos = Object.keys(obs.observations);
    if (tiempos.length !== 1 || tiempos[0] !== "0") throw new Error(`Serie ${clave} sin el año único`);
    const arr = obs.observations["0"];
    if (!Array.isArray(arr) || arr.length !== TRAINS_ATRIBUTOS.length + 1) {
      throw new Error(`Observación TRAINS de ${clave} trae ${Array.isArray(arr) ? arr.length : "otro tipo"} campos`);
    }
    const indice = ranura === null ? 0 : Number(clave.split(":")[ranura]);
    const producto = productos.values[indice];
    if (!producto) throw new Error(`Serie ${clave} fuera del catálogo de productos`);
    if (!/^\d{6}$/.test(producto.id)) throw new Error(`Producto TRAINS no es HS6: ${producto.id}`);
    if (vistos.has(producto.id)) throw new Error(`Producto TRAINS repetido: ${producto.id}`);
    vistos.add(producto.id);
    const promedio = arr[0];
    if (promedio !== null && typeof promedio !== "number") {
      throw new Error(`Promedio TRAINS ilegible en ${producto.id}`);
    }
    const tasa = (id: string) => {
      const raw = atributo(arr, attrs, id);
      return raw === null ? null : numero(raw, id, ENTEROS.has(id));
    };
    const texto = (id: string) => atributo(arr, attrs, id);
    filas.push({
      anio,
      frecuencia: freq.id,
      reporter: reporter.id,
      partner: partner.id,
      producto: producto.id,
      productoNombre: producto.name ?? null,
      datatype: datatype.id,
      nomenclatura: texto("NOMENCODE"),
      excluidoDe: texto("EXCLUDEDFROM"),
      tipoArancel: texto("TARIFFTYPE"),
      promedioSimple: promedio,
      sumaTasas: tasa("SUM_OF_RATES"),
      tasaMin: tasa("MIN_RATE"),
      tasaMax: tasa("MAX_RATE"),
      lineasTotal: tasa("TOTALNOOFLINES"),
      lineasPreferenciales: tasa("NBR_PREF_LINES"),
      lineasMfn: tasa("NBR_MFN_LINES"),
      lineasNa: tasa("NBR_NA_LINES"),
      medida: texto("OBS_VALUE_MEASURE"),
      consultado,
    });
  }
  return filas;
}

async function bajar(url: string): Promise<unknown> {
  const respuesta = await fetch(url, { signal: AbortSignal.timeout(180_000) });
  if (!respuesta.ok) throw new Error(`TRAINS respondió HTTP ${respuesta.status}`);
  const texto = await respuesta.text();
  try {
    return JSON.parse(texto) as unknown;
  } catch {
    throw new Error(`TRAINS no devolvió JSON. Inicio: ${texto.slice(0, 120)}`);
  }
}

async function insertar(pool: ReturnType<typeof connect>, filas: TrainsFila[]): Promise<void> {
  const TAM = 400;
  for (let i = 0; i < filas.length; i += TAM) {
    const lote = filas.slice(i, i + TAM);
    const valores: unknown[] = [];
    const tuplas: string[] = [];
    for (const f of lote) {
      const base = valores.length;
      tuplas.push(`(${Array.from({ length: 20 }, (_, j) => `$${base + j + 1}`).join(",")})`);
      valores.push(
        f.anio, f.frecuencia, f.reporter, f.partner, f.producto, f.productoNombre, f.datatype,
        f.nomenclatura, f.excluidoDe, f.tipoArancel, f.promedioSimple, f.sumaTasas, f.tasaMin,
        f.tasaMax, f.lineasTotal, f.lineasPreferenciales, f.lineasMfn, f.lineasNa, f.medida,
        f.consultado,
      );
    }
    await pool.query(
      `INSERT INTO trains_aranceles (
         anio, frecuencia, reporter, partner, producto, producto_nombre, datatype,
         nomenclatura, excluido_de, tipo_arancel, promedio_simple, suma_tasas, tasa_min,
         tasa_max, lineas_total, lineas_preferenciales, lineas_mfn, lineas_na, medida,
         consultado)
       VALUES ${tuplas.join(",")}
       ON CONFLICT (anio, reporter, partner, producto, datatype) DO UPDATE SET
         frecuencia = EXCLUDED.frecuencia,
         producto_nombre = EXCLUDED.producto_nombre,
         nomenclatura = EXCLUDED.nomenclatura,
         excluido_de = EXCLUDED.excluido_de,
         tipo_arancel = EXCLUDED.tipo_arancel,
         promedio_simple = EXCLUDED.promedio_simple,
         suma_tasas = EXCLUDED.suma_tasas,
         tasa_min = EXCLUDED.tasa_min,
         tasa_max = EXCLUDED.tasa_max,
         lineas_total = EXCLUDED.lineas_total,
         lineas_preferenciales = EXCLUDED.lineas_preferenciales,
         lineas_mfn = EXCLUDED.lineas_mfn,
         lineas_na = EXCLUDED.lineas_na,
         medida = EXCLUDED.medida,
         consultado = EXCLUDED.consultado`,
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
  const reporter = argumento(process.argv, "--reporter");
  const partner = argumento(process.argv, "--partner");
  const anioRaw = argumento(process.argv, "--anio");
  if (!reporter || !partner || !anioRaw) {
    throw new Error("Hacen falta --reporter, --partner y --anio. No hay otra llamada.");
  }
  const anio = Number(anioRaw);
  const url = urlTrains(reporter, partner, anio);
  const archivo = argumento(process.argv, "--archivo");
  const doc = archivo ? JSON.parse(readFileSync(archivo, "utf8")) as unknown : await bajar(url);
  const filas = parseTrains(doc);
  const ajenas = filas.filter((f) => f.reporter !== reporter || f.partner !== partner || f.anio !== anio);
  if (ajenas.length > 0) {
    throw new Error(`TRAINS devolvió ${ajenas.length} filas fuera de ${reporter}/${partner}/${anio}`);
  }
  if (filas.some((f) => f.datatype !== "Reported")) {
    throw new Error("TRAINS devolvió un datatype distinto de Reported");
  }
  process.stdout.write(
    `trains: ${filas.length} filas, reporter ${reporter}, partner ${partner}, año ${anio}, ` +
      `datatype reported${dryRun ? " (dry-run)" : ""}\n`,
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
    console.error("trains falló:", err instanceof Error ? err.message : err);
    process.exit(1);
  });
}
