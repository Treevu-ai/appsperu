/**
 * Conector CLI — MIDAGRI/Agromercado (antes "Sierra y Selva Exportadora"),
 * Listado de Planes de Articulación Comercial 2025.
 *
 * Fuente (verificada en vivo el 2026-10-15, SIN key, requiere User-Agent de
 * navegador o el WAF del portal devuelve un bloqueo "访问被拦截"):
 *   https://www.datosabiertos.gob.pe/sites/default/files/A0004_Plan_DataSet.csv
 * CSV delimitado por `;`, con BOM UTF-8, algunos campos con comas dentro de
 * comillas (ej. "FIBRA, LANA..." en `cadena_plan`) — por eso el parser de
 * abajo es quote-aware, no un split ingenuo por `;`.
 *
 * Qué trae y para qué: las 317 organizaciones (cooperativas/asociaciones de
 * productores) con un Plan de Articulación Comercial vigente en 2025 —
 * agroexportación asistida por el Estado. Es el padrón de "tratamiento" que
 * faltaba para preguntas de investigación tipo "¿los programas de promoción
 * de exportación mejoran el desempeño exportador real?" (línea de
 * investigación de desempeño exportador / distancia institucional).
 *
 * El dataset NO trae RUC — solo razón social, departamento/provincia/distrito
 * y producto/cadena de valor. Se enlaza por nombre contra `contribuyentes`
 * (identidad-fiscal, cross-app) usando `@appsperu/entity-matcher` (el mismo
 * matcher consolidado que usa identidad-fiscal/compras-publicas/infobras,
 * ADR-0017) — acotado por departamento para no comparar contra los ~2.3M
 * contribuyentes completos (mismo patrón de `build-crosswalk.ts`).
 *
 * IMPORTANTE — el match es por nombre, no por ID compartido: cada fila trae
 * su `match_confianza` ("confirmada" | "candidata" | null) y `match_score`.
 * Nunca tratar un match como si fuera un RUC verificado — una "candidata"
 * exige revisión antes de usarse para análisis causal.
 *
 * Encoding conocido y NO corregido a propósito: un número chico de filas del
 * CSV fuente trae caracteres no-ASCII mal codificados (ej. "PEQUEÃ‘OS" en vez
 * de "PEQUEÑOS") mezclados con filas perfectamente codificadas en la misma
 * columna — confirmado que es inconsistente dentro del archivo, no un
 * problema global de encoding. Un reemplazo automático (reinterpretar como
 * Latin-1 y redecodificar) rompe las filas que SÍ están bien codificadas sin
 * arreglar del todo las que no, así que no se aplica ningún parche: las filas
 * afectadas se insertan tal cual vienen de la fuente, y pueden tener un
 * `match_score` más bajo de lo esperado por esa razón.
 *
 * Uso:
 *   npx tsx src/ingest/agromercado-articulacion.ts
 *   npx tsx src/ingest/agromercado-articulacion.ts --dry-run   # fetch+match, no escribe
 */
import { connect } from "./db.js";
import { matchEntities } from "@appsperu/entity-matcher";
import { pathToFileURL } from "node:url";

const CSV_URL = "https://www.datosabiertos.gob.pe/sites/default/files/A0004_Plan_DataSet.csv";
const BROWSER_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36";

const DDL = `
CREATE TABLE IF NOT EXISTS agromercado_planes_articulacion (
  id                  BIGSERIAL PRIMARY KEY,
  num_plan            INTEGER,
  anio                SMALLINT NOT NULL,
  codigo_plan         TEXT NOT NULL UNIQUE,
  organizacion        TEXT NOT NULL,
  beneficiarios       INTEGER,
  cadena              TEXT,
  producto            TEXT,
  mes_inicio          TEXT,
  ubigeo              TEXT,
  departamento        TEXT,
  provincia           TEXT,
  distrito            TEXT,
  ruc_match           TEXT,
  razon_social_match  TEXT,
  match_confianza     TEXT,
  match_score         DOUBLE PRECISION,
  ingested_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_agromercado_departamento
  ON agromercado_planes_articulacion (departamento);
CREATE INDEX IF NOT EXISTS idx_agromercado_producto
  ON agromercado_planes_articulacion (producto);
CREATE INDEX IF NOT EXISTS idx_agromercado_ruc_match
  ON agromercado_planes_articulacion (ruc_match) WHERE ruc_match IS NOT NULL;
`;

export interface PlanRow {
  numPlan: number | null;
  anio: number;
  codigoPlan: string;
  organizacion: string;
  beneficiarios: number | null;
  cadena: string | null;
  producto: string | null;
  mesInicio: string | null;
  ubigeo: string | null;
  departamento: string | null;
  provincia: string | null;
  distrito: string | null;
}

/**
 * Parser quote-aware de una línea CSV delimitada por `;` (no una librería
 * completa: el formato real es simple, pero algunos valores traen comas
 * dentro de comillas que un split ingenuo rompería).
 */
export function parseCsvLine(line: string, delimiter = ";"): string[] {
  const fields: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (inQuotes) {
      if (c === '"') {
        if (line[i + 1] === '"') {
          cur += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        cur += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === delimiter) {
      fields.push(cur);
      cur = "";
    } else {
      cur += c;
    }
  }
  fields.push(cur);
  return fields;
}

/** Convierte el CSV crudo (texto completo, con BOM) a filas tipadas. Pura, testeable. */
export function parseAgromercadoCsv(text: string): PlanRow[] {
  const sinBom = text.replace(/^﻿/, "");
  const lineas = sinBom.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lineas.length === 0) return [];
  const header = parseCsvLine(lineas[0]).map((h) => h.trim());
  const idx = (name: string) => header.indexOf(name);

  const iNum = idx("num_plan");
  const iAno = idx("ano_plan");
  const iCod = idx("cod_plan");
  const iOrgan = idx("organ_plan");
  const iBenef = idx("benef_plan");
  const iCadena = idx("cadena_plan");
  const iProducto = idx("producto_plan");
  const iMes = idx("mesInicio_plan");
  const iUbigeo = idx("ubigeo_plan");
  const iDepa = idx("depa_plan");
  const iProv = idx("prov_plan");
  const iDis = idx("dis_plan");

  const toIntOrNull = (v: string | undefined): number | null => {
    if (!v) return null;
    const n = Number(v.trim());
    return Number.isFinite(n) ? n : null;
  };
  const toStrOrNull = (v: string | undefined): string | null => {
    const t = v?.trim();
    return t && t.length > 0 ? t : null;
  };

  const rows: PlanRow[] = [];
  for (const linea of lineas.slice(1)) {
    const cols = parseCsvLine(linea);
    const codigoPlan = cols[iCod]?.trim();
    const organizacion = cols[iOrgan]?.trim();
    if (!codigoPlan || !organizacion) continue; // fila sin las dos claves minimas, se descarta
    rows.push({
      numPlan: toIntOrNull(cols[iNum]),
      anio: toIntOrNull(cols[iAno]) ?? new Date().getFullYear(),
      codigoPlan,
      organizacion,
      beneficiarios: toIntOrNull(cols[iBenef]),
      cadena: toStrOrNull(cols[iCadena]),
      producto: toStrOrNull(cols[iProducto]),
      mesInicio: toStrOrNull(cols[iMes]),
      ubigeo: toStrOrNull(cols[iUbigeo]),
      departamento: toStrOrNull(cols[iDepa]),
      provincia: toStrOrNull(cols[iProv]),
      distrito: toStrOrNull(cols[iDis]),
    });
  }
  return rows;
}

async function fetchCsv(): Promise<string> {
  const res = await fetch(CSV_URL, {
    headers: { "User-Agent": BROWSER_UA, Accept: "text/csv,*/*" },
    signal: AbortSignal.timeout(60_000),
  });
  if (!res.ok) throw new Error(`datosabiertos.gob.pe devolvió HTTP ${res.status}`);
  const text = await res.text();
  if (text.trimStart().startsWith("<")) {
    throw new Error("datosabiertos.gob.pe devolvió HTML (probable bloqueo WAF), no CSV");
  }
  return text;
}

interface MatchResult {
  rucMatch: string | null;
  razonSocialMatch: string | null;
  confianza: "confirmada" | "candidata" | null;
  score: number | null;
}

/**
 * Enlaza cada plan contra el padrón RUC (identidad-fiscal) por nombre,
 * acotando la consulta por departamento (mismo patrón de rendimiento que
 * `apps/identidad-fiscal/api/src/crossref/build-crosswalk.ts`: comparar
 * contra los ~2.3M contribuyentes completos sin acotar toma ~90s por
 * corrida; acotar por departamento lo reduce a un subconjunto manejable).
 */
async function matchContraPadron(
  rows: PlanRow[],
  identidadFiscalPool: ReturnType<typeof connect>
): Promise<Map<string, MatchResult>> {
  const resultados = new Map<string, MatchResult>();
  const porDepartamento = new Map<string, PlanRow[]>();
  for (const r of rows) {
    const key = r.departamento ?? "__SIN_DEPARTAMENTO__";
    const lista = porDepartamento.get(key) ?? [];
    lista.push(r);
    porDepartamento.set(key, lista);
  }

  for (const [departamento, planes] of porDepartamento) {
    if (departamento === "__SIN_DEPARTAMENTO__") continue;
    const ubigeoPrefix = planes[0]?.ubigeo?.slice(0, 2);
    const { rows: padronRows } = await identidadFiscalPool.query<{ ruc: string; razon_social: string }>(
      ubigeoPrefix
        ? `SELECT ruc, razon_social FROM contribuyentes WHERE ubigeo LIKE $1`
        : `SELECT ruc, razon_social FROM contribuyentes WHERE ubigeo IS NULL`,
      ubigeoPrefix ? [`${ubigeoPrefix}%`] : []
    );
    if (padronRows.length === 0) continue;

    const matches = matchEntities(
      padronRows.map((p) => ({ id: p.ruc, nombre: p.razon_social })),
      planes.map((p) => ({ id: p.codigoPlan, nombre: p.organizacion }))
    );
    for (const m of matches) {
      resultados.set(m.b.id, {
        rucMatch: m.a.id,
        razonSocialMatch: m.a.nombre,
        confianza: m.confidence,
        score: m.score,
      });
    }
  }
  return resultados;
}

interface Args {
  dryRun: boolean;
}
function parseArgs(argv: string[]): Args {
  return { dryRun: argv.includes("--dry-run") };
}

async function main() {
  const args = parseArgs(process.argv);
  const text = await fetchCsv();
  const rows = parseAgromercadoCsv(text);
  process.stdout.write(`agromercado-articulacion: ${rows.length} filas parseadas del CSV\n`);

  const destPool = args.dryRun ? null : connect("actividad-agraria");
  const origenPool = args.dryRun ? null : connect("identidad-fiscal");

  try {
    let matchResults = new Map<string, MatchResult>();
    if (origenPool) {
      matchResults = await matchContraPadron(rows, origenPool);
    }
    const confirmadas = [...matchResults.values()].filter((m) => m.confianza === "confirmada").length;
    const candidatas = [...matchResults.values()].filter((m) => m.confianza === "candidata").length;
    process.stdout.write(
      `agromercado-articulacion: ${confirmadas} match confirmadas, ${candidatas} candidatas, ` +
        `${rows.length - confirmadas - candidatas} sin match\n`
    );

    if (destPool) {
      await destPool.query(DDL);
      const COLS = 16;
      const values: unknown[] = [];
      const tuplas: string[] = [];
      rows.forEach((r, i) => {
        const match = matchResults.get(r.codigoPlan);
        const base = i * COLS;
        tuplas.push(`(${Array.from({ length: COLS }, (_, j) => `$${base + j + 1}`).join(",")})`);
        values.push(
          r.numPlan,
          r.anio,
          r.codigoPlan,
          r.organizacion,
          r.beneficiarios,
          r.cadena,
          r.producto,
          r.mesInicio,
          r.ubigeo,
          r.departamento,
          r.provincia,
          r.distrito,
          match?.rucMatch ?? null,
          match?.razonSocialMatch ?? null,
          match?.confianza ?? null,
          match?.score ?? null
        );
      });

      await destPool.query(
        `INSERT INTO agromercado_planes_articulacion
           (num_plan, anio, codigo_plan, organizacion, beneficiarios, cadena, producto,
            mes_inicio, ubigeo, departamento, provincia, distrito,
            ruc_match, razon_social_match, match_confianza, match_score)
         VALUES ${tuplas.join(",")}
         ON CONFLICT (codigo_plan) DO UPDATE SET
           organizacion = EXCLUDED.organizacion,
           beneficiarios = EXCLUDED.beneficiarios,
           cadena = EXCLUDED.cadena,
           producto = EXCLUDED.producto,
           mes_inicio = EXCLUDED.mes_inicio,
           ubigeo = EXCLUDED.ubigeo,
           departamento = EXCLUDED.departamento,
           provincia = EXCLUDED.provincia,
           distrito = EXCLUDED.distrito,
           ruc_match = EXCLUDED.ruc_match,
           razon_social_match = EXCLUDED.razon_social_match,
           match_confianza = EXCLUDED.match_confianza,
           match_score = EXCLUDED.match_score`,
        values
      );
      process.stdout.write(`agromercado-articulacion: ${rows.length} filas insertadas/actualizadas\n`);
    }
  } finally {
    if (destPool) await destPool.end();
    if (origenPool) await origenPool.end();
  }
}

const esEjecucionDirecta =
  process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;

if (esEjecucionDirecta) {
  main().catch((err) => {
    console.error("agromercado-articulacion falló:", err instanceof Error ? err.message : err);
    process.exit(1);
  });
}
