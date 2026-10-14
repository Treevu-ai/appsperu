/**
 * Conector CLI — "Comercio Exterior de Bienes" (MINCETUR / DGIECE).
 *
 * Fuente (verificada en vivo el 2026-10-14):
 *   https://datosabiertos.mincetur.gob.pe/DGIECE/Comercio_exterior_bienes_<anio>.xlsx
 *   (anios 2019-2024, un XLSX por año; dataset publicado en el PNDA con
 *   diccionario de datos y metadatos)
 *
 * Cada XLSX es un dump mensual de ~630.000 filas (~680 MB de XML de hoja sin
 * comprimir), así que se lee por streaming (ver `xlsx-stream.ts`) y se agrega a
 * nivel (anio, flujo, subpartida, pais, via) antes de tocar la base — el nivel
 * mensual no se conserva (ver `mincetur-normalize.ts`).
 *
 * Escribe en la base de la app `sunat-aduanas` (mismo dominio: estadística de
 * comercio exterior por partida y aduana). No tiene app Express propia: este
 * conector + el handler MCP + la entrada de catálogo son toda la superficie,
 * decisión explícita del repo para fuentes sin API.
 *
 * Uso:
 *   npx tsx src/ingest/mincetur-comercio-bienes.ts                  # 2019-2024, descarga
 *   npx tsx src/ingest/mincetur-comercio-bienes.ts --file 2024.xlsx # un archivo local
 *   npx tsx src/ingest/mincetur-comercio-bienes.ts --dry-run        # parsea, no escribe
 */
import { createHash } from "node:crypto";
import { pathToFileURL } from "node:url";
import { mkdtemp, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { connect } from "./db.js";
import { iterSheetRows } from "./xlsx-stream.js";
import { AgregadorComercio, normalizarFila } from "./mincetur-normalize.js";

const ANIOS_DEFAULT = [2019, 2020, 2021, 2022, 2023, 2024];
const URL_TEMPLATE = "https://datosabiertos.mincetur.gob.pe/DGIECE/Comercio_exterior_bienes_%ANIO%.xlsx";
const INSERT_BATCH = 1000;

const DDL = `
CREATE TABLE IF NOT EXISTS raw_batches (
  id           BIGSERIAL PRIMARY KEY,
  source_file  TEXT NOT NULL,
  year         INTEGER NOT NULL,
  checksum     TEXT NOT NULL,
  row_count    INTEGER NOT NULL,
  ingested_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS comercio_bienes_agregado (
  id             BIGSERIAL PRIMARY KEY,
  anio           SMALLINT NOT NULL,
  flujo          TEXT NOT NULL,
  subpartida     TEXT NOT NULL,
  descripcion    TEXT NOT NULL DEFAULT '',
  sector         TEXT NOT NULL DEFAULT '',
  tipo           TEXT NOT NULL DEFAULT '',
  pais_codigo    TEXT NOT NULL,
  pais_nombre    TEXT NOT NULL DEFAULT '',
  continente     TEXT NOT NULL DEFAULT '',
  bloque_1       TEXT NOT NULL DEFAULT '',
  bloque_2       TEXT NOT NULL DEFAULT '',
  cuode          TEXT NOT NULL DEFAULT '',
  via_codigo     TEXT NOT NULL,
  via_nombre     TEXT NOT NULL DEFAULT '',
  usd_millones   NUMERIC(18, 6) NOT NULL DEFAULT 0,
  tm             NUMERIC(20, 6),
  filas_origen   INTEGER NOT NULL DEFAULT 1,
  fecha_corte    TEXT NOT NULL DEFAULT '',
  batch_id       BIGINT NOT NULL REFERENCES raw_batches(id),
  ingested_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (anio, flujo, subpartida, pais_codigo, via_codigo)
);

CREATE INDEX IF NOT EXISTS idx_comercio_bienes_anio_flujo
  ON comercio_bienes_agregado (anio, flujo);
CREATE INDEX IF NOT EXISTS idx_comercio_bienes_subpartida
  ON comercio_bienes_agregado (subpartida);
CREATE INDEX IF NOT EXISTS idx_comercio_bienes_pais
  ON comercio_bienes_agregado (pais_codigo);
`;

interface Args {
  anios: number[];
  file?: string;
  dir?: string;
  dryRun: boolean;
}

function parseArgs(argv: string[]): Args {
  const args: Args = { anios: ANIOS_DEFAULT, dryRun: false };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--dry-run") args.dryRun = true;
    else if (a === "--file") args.file = argv[++i];
    else if (a === "--dir") args.dir = argv[++i];
    else if (a === "--years") {
      args.anios = (argv[++i] ?? "")
        .split(",")
        .map((s) => Number(s.trim()))
        .filter((n) => Number.isInteger(n));
    }
  }
  return args;
}

async function sha256(path: string): Promise<string> {
  const { readFile } = await import("node:fs/promises");
  return createHash("sha256").update(await readFile(path)).digest("hex");
}

async function descargar(anio: number, dir: string): Promise<string> {
  const url = URL_TEMPLATE.replace("%ANIO%", String(anio));
  const destino = join(dir, `mincetur_${anio}.xlsx`);
  process.stdout.write(`  descargando ${url}\n`);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`MINCETUR devolvió HTTP ${res.status} para ${anio}`);
  const buf = Buffer.from(await res.arrayBuffer());
  const { writeFile } = await import("node:fs/promises");
  await writeFile(destino, buf);
  return destino;
}

async function main() {
  const args = parseArgs(process.argv);
  const trabajos: Array<{ anio: number; path: string }> = [];

  if (args.file) {
    const anioMatch = args.file.match(/(20\d{2})/);
    const anio = anioMatch ? Number(anioMatch[1]) : new Date().getFullYear();
    trabajos.push({ anio, path: args.file });
  } else {
    const dir = args.dir ?? (await mkdtemp(join(tmpdir(), "mincetur-")));
    for (const anio of args.anios) {
      const local = join(dir, `mincetur_${anio}.xlsx`);
      if (args.dir) {
        try {
          await stat(local);
          trabajos.push({ anio, path: local });
          continue;
        } catch {
          process.stdout.write(`  ${local} no existe, se descarga\n`);
        }
      }
      trabajos.push({ anio, path: await descargar(anio, dir) });
    }
  }

  const pool = args.dryRun ? null : connect("sunat-aduanas");
  if (pool) await pool.query(DDL);

  let totalFilas = 0;
  let totalAgregadas = 0;
  try {
    for (const { anio, path } of trabajos) {
      const agregador = new AgregadorComercio();
      let descartadas = 0;
      const stats = await iterSheetRows(path, (rowXml) => {
        const fila = normalizarFila(rowXml);
        if (!fila) {
          descartadas += 1;
          return;
        }
        agregador.add(fila);
      });
      const filas = agregador.toArray();
      totalFilas += stats.filas;
      totalAgregadas += filas.length;

      let batchId: number | null = null;
      if (pool) {
        const checksum = await sha256(path);
        const batch = await pool.query<{ id: string }>(
          `INSERT INTO raw_batches (source_file, year, checksum, row_count)
           VALUES ($1, $2, $3, $4) RETURNING id`,
          [`mincetur_${anio}.xlsx`, anio, checksum, stats.filas]
        );
        batchId = Number(batch.rows[0].id);
        for (let i = 0; i < filas.length; i += INSERT_BATCH) {
          const lote = filas.slice(i, i + INSERT_BATCH);
          const valores: unknown[] = [];
          const tuplas: string[] = [];
          for (const f of lote) {
            const cols = [
              f.anio, f.flujo, f.subpartida, f.descripcion, f.sector, f.tipo,
              f.paisCodigo, f.paisNombre, f.continente, f.bloque1, f.bloque2,
              f.cuode, f.viaCodigo, f.viaNombre, f.usdMillones, f.tm,
              f.filasOrigen, f.fechaCorte, batchId,
            ];
            const base = valores.length;
            tuplas.push(`(${cols.map((_, j) => `$${base + j + 1}`).join(",")})`);
            valores.push(...cols);
          }
          await pool.query(
            `INSERT INTO comercio_bienes_agregado
               (anio, flujo, subpartida, descripcion, sector, tipo, pais_codigo,
                pais_nombre, continente, bloque_1, bloque_2, cuode, via_codigo,
                via_nombre, usd_millones, tm, filas_origen, fecha_corte, batch_id)
             VALUES ${tuplas.join(",")}
             ON CONFLICT (anio, flujo, subpartida, pais_codigo, via_codigo) DO UPDATE SET
               descripcion = EXCLUDED.descripcion, sector = EXCLUDED.sector, tipo = EXCLUDED.tipo,
               pais_nombre = EXCLUDED.pais_nombre, continente = EXCLUDED.continente,
               bloque_1 = EXCLUDED.bloque_1, bloque_2 = EXCLUDED.bloque_2,
               cuode = EXCLUDED.cuode, via_nombre = EXCLUDED.via_nombre,
               usd_millones = EXCLUDED.usd_millones, tm = EXCLUDED.tm,
               filas_origen = EXCLUDED.filas_origen, fecha_corte = EXCLUDED.fecha_corte,
               batch_id = EXCLUDED.batch_id, ingested_at = now()`,
            valores
          );
        }
      }
      process.stdout.write(
        `  ${anio}: ${stats.filas} filas leídas, ${descartadas} descartadas, ` +
          `${filas.length} agregadas${batchId ? ` (batch ${batchId})` : " (dry-run)"}\n`
      );
    }
  } finally {
    if (pool) await pool.end();
  }
  process.stdout.write(
    `mincetur-comercio-bienes: ${trabajos.length} archivos, ${totalFilas} filas → ${totalAgregadas} agregadas\n`
  );
}

/**
 * El `main()` solo corre cuando el archivo se ejecuta directo (npm run
 * ingest:*). Los tests importan las funciones puras del módulo; sin esta guarda
 * el import disparaba la corrida real y el proceso moría con process.exit(1).
 */
const esEjecucionDirecta =
  process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;

if (esEjecucionDirecta) {
  main().catch((err) => {
    console.error("mincetur-comercio-bienes falló:", err instanceof Error ? err.message : err);
    process.exit(1);
  });
}