/**
 * Conector CLI — Business Ready (B-READY) 2025, solo la hoja de puntajes
 * por economía y pilar.
 *
 * Zip público, sin login, verificado el 2026-10-17 (5525642 bytes):
 *   https://www.worldbank.org/content/dam/sites/b-ready/documents/excel/B-READY_ALL_DATA_2025.zip
 * Dentro, `01_B-READY-2025-PILLAR-TOPIC-SCORES.xlsx`. La hoja
 * `00_B-READY_Pillar_Score` (sheet2, A1:E109) trae Economy, Economy Code y
 * tres puntajes. Las hojas 01–10 son el detalle por tema y no entran.
 * No se concuerda con Doing Business. La ficha del catálogo marca Custom
 * License y no publica el texto: uso interno.
 *
 * Uso:
 *   npx tsx src/ingest/bready.ts --dry-run
 */
import { pathToFileURL } from "node:url";
import { connect } from "./db.js";
import { decodificarXml } from "./xlsx-rows.js";
import { entrada, readZipEntries } from "./zip-entries.js";

const URL_ZIP =
  "https://www.worldbank.org/content/dam/sites/b-ready/documents/excel/B-READY_ALL_DATA_2025.zip";
const XLSX = "01_B-READY-2025-PILLAR-TOPIC-SCORES.xlsx";
const HOJA = "00_B-READY_Pillar_Score";
export const BREADY_EDICION = "2025";

export const ENCABEZADO_PILLAR = [
  "Economy",
  "Economy Code",
  "Pillar 1\nRegulatory Framework",
  "Pillar 2\nPublic Services",
  "Pillar 3\nOperational Efficiency",
] as const;

const PILAR_POR_COL: Record<string, string> = {
  C: "Pillar 1 Regulatory Framework",
  D: "Pillar 2 Public Services",
  E: "Pillar 3 Operational Efficiency",
};

const DDL = `
CREATE TABLE IF NOT EXISTS bready_puntajes (
  id                BIGSERIAL PRIMARY KEY,
  economia          TEXT NOT NULL,
  economia_codigo   TEXT NOT NULL,
  edicion           TEXT NOT NULL,
  pilar             TEXT NOT NULL,
  tema              TEXT NOT NULL DEFAULT '',
  indicador         TEXT NOT NULL,
  valor             DOUBLE PRECISION NOT NULL,
  archivo           TEXT NOT NULL,
  UNIQUE (economia_codigo, edicion, pilar, tema, indicador)
);
CREATE INDEX IF NOT EXISTS idx_bready_edicion ON bready_puntajes (edicion, economia_codigo);
`;

export interface BreadyFila {
  economia: string;
  economiaCodigo: string;
  edicion: string;
  pilar: string;
  tema: string;
  indicador: string;
  valor: number;
  archivo: string;
}

export function leerSharedStrings(xml: string): string[] {
  const out: string[] = [];
  for (const bloque of xml.matchAll(/<si>([\s\S]*?)<\/si>/g)) {
    const textos = [...bloque[1].matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)].map((m) =>
      decodificarXml(m[1]),
    );
    out.push(textos.join(""));
  }
  return out;
}

const CELDA_RE =
  /<c r="([A-Z]+)\d+"([^>]*)>(?:<is><t(?:\s[^>]*)?>([\s\S]*?)<\/t><\/is>|<v>([\s\S]*?)<\/v>)?<\/c>/g;

function celdasDeFila(rowXml: string, shared: string[]): Map<string, string> {
  const celdas = new Map<string, string>();
  CELDA_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = CELDA_RE.exec(rowXml)) !== null) {
    const [, col, attrs, inline, v] = m;
    let valor = "";
    if (/\bt="s"/.test(attrs)) {
      const idx = Number(v);
      if (!Number.isInteger(idx) || shared[idx] === undefined) {
        throw new Error(`sharedStrings sin índice ${v}`);
      }
      valor = shared[idx];
    } else if (inline !== undefined) {
      valor = decodificarXml(inline);
    } else if (v !== undefined) {
      valor = decodificarXml(v);
    }
    celdas.set(col, valor);
  }
  return celdas;
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

/** Una fila larga por pilar. Falla si el encabezado de la hoja cambió. */
export function parsePillarScore(sheetXml: string, shared: string[]): BreadyFila[] {
  const filasXml = [...sheetXml.matchAll(/<row\b[\s\S]*?<\/row>/g)].map((m) => m[0]);
  if (filasXml.length === 0) throw new Error("La hoja de puntajes no trae filas");
  const header = celdasDeFila(filasXml[0], shared);
  const leido = ["A", "B", "C", "D", "E"].map((col) => header.get(col) ?? "");
  // El xlsx real guarda el salto del encabezado como CRLF. El fixture de test usa LF.
  const plano = (s: string) => s.replaceAll("\r\n", "\n").replaceAll("\r", "\n");
  if (leido.map(plano).join("|") !== ENCABEZADO_PILLAR.map(plano).join("|")) {
    throw new Error(`Encabezado B-READY distinto: ${leido.join(" / ")}`);
  }
  const filas: BreadyFila[] = [];
  for (const rowXml of filasXml.slice(1)) {
    const c = celdasDeFila(rowXml, shared);
    const economia = c.get("A") ?? "";
    const codigo = c.get("B") ?? "";
    if (!economia || !codigo) continue;
    for (const [col, pilar] of Object.entries(PILAR_POR_COL)) {
      const raw = c.get(col) ?? "";
      if (raw === "") continue;
      const valor = Number(raw);
      if (!Number.isFinite(valor)) {
        throw new Error(`Puntaje no numérico para ${codigo} ${pilar}: ${raw}`);
      }
      filas.push({
        economia,
        economiaCodigo: codigo,
        edicion: BREADY_EDICION,
        pilar,
        tema: "",
        indicador: "pillar_score",
        valor,
        archivo: XLSX,
      });
    }
  }
  return filas;
}

export function parseBreadyXlsx(xlsx: Buffer): BreadyFila[] {
  const entries = readZipEntries(xlsx);
  const shared = leerSharedStrings(entrada(entries, "xl/sharedStrings.xml").toString("utf8"));
  return parsePillarScore(hojaXml(entries), shared);
}

export function parseBreadyZip(zip: Buffer): BreadyFila[] {
  const entries = readZipEntries(zip);
  return parseBreadyXlsx(entrada(entries, XLSX));
}

async function bajarZip(): Promise<Buffer> {
  const res = await fetch(URL_ZIP, { signal: AbortSignal.timeout(120_000) });
  if (!res.ok) throw new Error(`Banco Mundial devolvió HTTP ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

async function insertar(pool: ReturnType<typeof connect>, filas: BreadyFila[]): Promise<void> {
  const valores: unknown[] = [];
  const tuplas: string[] = [];
  for (const f of filas) {
    const base = valores.length;
    tuplas.push(`(${Array.from({ length: 8 }, (_, j) => `$${base + j + 1}`).join(",")})`);
    valores.push(f.economia, f.economiaCodigo, f.edicion, f.pilar, f.tema, f.indicador, f.valor, f.archivo);
  }
  await pool.query(
    `INSERT INTO bready_puntajes
       (economia, economia_codigo, edicion, pilar, tema, indicador, valor, archivo)
     VALUES ${tuplas.join(",")}
     ON CONFLICT (economia_codigo, edicion, pilar, tema, indicador) DO UPDATE SET
       economia = EXCLUDED.economia,
       valor = EXCLUDED.valor,
       archivo = EXCLUDED.archivo`,
    valores,
  );
}

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const filas = parseBreadyZip(await bajarZip());
  const economias = new Set(filas.map((f) => f.economiaCodigo)).size;
  process.stdout.write(
    `bready: ${filas.length} puntajes, ${economias} economías, edición ${BREADY_EDICION}, hoja ${HOJA}${dryRun ? " (dry-run)" : ""}\n`,
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
    console.error("bready falló:", err instanceof Error ? err.message : err);
    process.exit(1);
  });
}
