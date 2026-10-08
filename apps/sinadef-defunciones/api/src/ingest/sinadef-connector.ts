import { createHash } from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createInterface } from "node:readline";
import { Readable } from "node:stream";
import { pathToFileURL } from "node:url";
import type { PoolClient } from "pg";
import { pool } from "../db/pool.js";

const SOURCE_URL = "https://drive.minsa.gob.pe/s/PigmdwnCGEdyqos/download";
const DATASET = "sinadef_fallecidos";
/** Clave fija para el advisory lock — evita que dos corridas concurrentes de esta ingesta se pisen. */
const ADVISORY_LOCK_KEY = "sinadef_ingest";
const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36";

/**
 * Filtro de cobertura (CT-XX, "Foco La Libertad"): el CSV es un volcado
 * plano nacional sin orden ni partición por departamento (a diferencia del
 * archivo del MEF, que sí viene seccionado) — no hay forma de descargar
 * solo La Libertad por rango de bytes, hay que leer el archivo completo
 * (~365MB, ~1.1M filas estimadas) y filtrar fila por fila al vuelo. Se
 * ingiere solo La Libertad (~4-5% de las filas) para mantener el volumen
 * de escritura a Neon razonable; ampliar a nacional es un cambio de un
 * array si hace falta más adelante.
 */
const DEPARTAMENTOS_COBERTURA = new Set(["LA LIBERTAD"]);

const BATCH_SIZE = 500;

/**
 * Hallazgo confirmado en vivo el 2026-10-07: el `Last-Modified` real del
 * recurso es 2024-05-06 — más de 2 años desactualizado respecto a la fecha
 * de "modificado" que muestra el catálogo de datosabiertos.gob.pe (que solo
 * refleja un toque a los metadatos, no al archivo). No existe una fuente
 * alternativa más fresca: el dashboard "Cuadro de Mando" de SINADEF en
 * Tableau Public está protegido por AWS WAF/captcha y es una SPA en React
 * que de todos modos solo expondría agregados, no filas. Este conector
 * sirve como línea base histórica (hasta donde llegue el corte real del
 * archivo), no como fuente de monitoreo del año en curso — ver
 * docs/conectores.md.
 */
const COLUMNS = [
  "numero", "tipoSeguro", "sexo", "edad", "tiempoEdad", "estadoCivil", "nivelInstruccion", "etnia",
  "ubigeoDomicilio", "paisDomicilio", "departamentoDomicilio", "provinciaDomicilio", "distritoDomicilio",
  "fecha", "anio", "mes", "tipoLugar", "institucion", "muerteViolenta", "necropsia",
  "causaA", "cieA", "causaB", "cieB", "causaC", "cieC", "causaD", "cieD", "causaE", "cieE", "causaF", "cieF",
] as const;

interface DefuncionRow {
  tipoSeguro: string | null;
  sexo: string | null;
  edad: number | null;
  tiempoEdad: string | null;
  estadoCivil: string | null;
  nivelInstruccion: string | null;
  etnia: string | null;
  ubigeoDomicilio: string | null;
  paisDomicilio: string | null;
  departamentoDomicilio: string | null;
  provinciaDomicilio: string | null;
  distritoDomicilio: string | null;
  fecha: string | null;
  anio: number | null;
  mes: number | null;
  tipoLugar: string | null;
  institucion: string | null;
  muerteViolenta: string | null;
  necropsia: string | null;
  causaA: string | null;
  cieA: string | null;
  causaB: string | null;
  cieB: string | null;
  causaC: string | null;
  cieC: string | null;
  causaD: string | null;
  cieD: string | null;
  causaE: string | null;
  cieE: string | null;
  causaF: string | null;
  cieF: string | null;
}

function toNullable(value: string | undefined): string | null {
  const trimmed = (value ?? "").trim();
  return trimmed === "" ? null : trimmed;
}

function toInt(value: string | undefined): number | null {
  const trimmed = (value ?? "").trim();
  if (trimmed === "") return null;
  const n = Number.parseInt(trimmed, 10);
  return Number.isNaN(n) ? null : n;
}

/** La fuente ya viene en "YYYY-MM-DD" cuando hay fecha — null si no. */
function toIsoDate(value: string | undefined): string | null {
  const trimmed = (value ?? "").trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(trimmed) ? trimmed : null;
}

/**
 * Parsea una línea cruda (delimitada por `|`, 32 columnas, confirmado en
 * vivo). Devuelve `null` si la fila no es de La Libertad (filtro de
 * cobertura) o si tiene menos columnas de las esperadas (fila corrupta).
 */
export function parseSinadefLine(line: string): DefuncionRow | null {
  const cols = line.split("|");
  if (cols.length < 32) return null;

  const departamento = toNullable(cols[10]);
  if (!departamento || !DEPARTAMENTOS_COBERTURA.has(departamento.toUpperCase())) return null;

  return {
    tipoSeguro: toNullable(cols[1]),
    sexo: toNullable(cols[2]),
    edad: toInt(cols[3]),
    tiempoEdad: toNullable(cols[4]),
    estadoCivil: toNullable(cols[5]),
    nivelInstruccion: toNullable(cols[6]),
    etnia: toNullable(cols[7]),
    ubigeoDomicilio: toNullable(cols[8]),
    paisDomicilio: toNullable(cols[9]),
    departamentoDomicilio: departamento,
    provinciaDomicilio: toNullable(cols[11]),
    distritoDomicilio: toNullable(cols[12]),
    fecha: toIsoDate(cols[13]),
    anio: toInt(cols[14]),
    mes: toInt(cols[15]),
    tipoLugar: toNullable(cols[16]),
    institucion: toNullable(cols[17]),
    muerteViolenta: toNullable(cols[18]),
    necropsia: toNullable(cols[19]),
    causaA: toNullable(cols[20]),
    cieA: toNullable(cols[21]),
    causaB: toNullable(cols[22]),
    cieB: toNullable(cols[23]),
    causaC: toNullable(cols[24]),
    cieC: toNullable(cols[25]),
    causaD: toNullable(cols[26]),
    cieD: toNullable(cols[27]),
    causaE: toNullable(cols[28]),
    cieE: toNullable(cols[29]),
    causaF: toNullable(cols[30]),
    cieF: toNullable(cols[31]),
  };
}

async function downloadToFile(destPath: string): Promise<{ bytes: number; checksum: string }> {
  const res = await fetch(SOURCE_URL, { headers: { "User-Agent": USER_AGENT } });
  if (!res.ok || !res.body) {
    throw new Error(`SINADEF devolvió ${res.status} al pedir ${SOURCE_URL}`);
  }

  const hash = createHash("sha256");
  let bytes = 0;
  const writeStream = createWriteStream(destPath);
  const nodeStream = Readable.fromWeb(res.body as import("node:stream/web").ReadableStream);

  await new Promise<void>((resolve, reject) => {
    nodeStream.on("data", (chunk: Buffer) => {
      hash.update(chunk);
      bytes += chunk.length;
    });
    nodeStream.on("error", reject);
    writeStream.on("error", reject);
    writeStream.on("finish", resolve);
    nodeStream.pipe(writeStream);
  });

  return { bytes, checksum: hash.digest("hex") };
}

async function insertBatch(client: PoolClient, batchId: number, rows: DefuncionRow[]): Promise<void> {
  if (rows.length === 0) return;

  const values: string[] = [];
  const params: unknown[] = [];
  for (const row of rows) {
    const base = params.length;
    const cols = COLUMNS.filter((c) => c !== "numero").map((c) => row[c as keyof DefuncionRow]);
    cols.forEach((v) => params.push(v));
    const placeholders = cols.map((_, i) => `$${base + i + 1}`);
    values.push(`(${placeholders.join(",")}, $${base + cols.length + 1})`);
    params.push(batchId);
  }

  await client.query(
    `INSERT INTO defunciones
       (tipo_seguro, sexo, edad, tiempo_edad, estado_civil, nivel_instruccion, etnia,
        ubigeo_domicilio, pais_domicilio, departamento_domicilio, provincia_domicilio, distrito_domicilio,
        fecha_defuncion, anio_defuncion, mes_defuncion, tipo_lugar, institucion, muerte_violenta, necropsia,
        causa_a, cie_a, causa_b, cie_b, causa_c, cie_c, causa_d, cie_d, causa_e, cie_e, causa_f, cie_f,
        source_batch_id)
     VALUES ${values.join(",")}`,
    params
  );
}

export interface SinadefIngestSummary {
  batchId: number;
  filasLeidas: number;
  filasLaLibertad: number;
  filasInsertadas: number;
  bytesDescargados: number;
}

/**
 * Carga por reemplazo completo, atómica: un solo `PoolClient` sostiene el
 * advisory lock (evita que dos corridas concurrentes se pisen) y una única
 * transacción (vacía `defunciones` y vuelve a insertar todo, incluido el
 * registro en `raw_sinadef_batches`). Antes cada INSERT de 500 filas se
 * confirmaba por separado contra `pool` sin lock ni limpieza de corridas
 * anteriores — una segunda ejecución duplicaba el snapshot completo, y una
 * falla a mitad de la descarga/parseo dejaba filas parciales de la corrida
 * fallida mezcladas con las de corridas previas. Con COMMIT solo al final,
 * cualquier error (red, parseo, DB) revierte TODO, incluida la limpieza —
 * los datos previos quedan intactos si la corrida nueva falla.
 */
export async function ingestSinadef(): Promise<SinadefIngestSummary> {
  const tmpDir = await mkdtemp(path.join(tmpdir(), "sinadef-"));
  const csvPath = path.join(tmpDir, "fallecidos_sinadef.csv");
  const client = await pool.connect();

  try {
    await client.query("SELECT pg_advisory_lock(hashtext($1))", [ADVISORY_LOCK_KEY]);

    console.log(`Descargando ${SOURCE_URL} a ${csvPath}...`);
    const { bytes, checksum } = await downloadToFile(csvPath);
    console.log(`Descarga completa: ${bytes.toLocaleString()} bytes.`);

    let filasLeidas = 0;
    let filasLaLibertad = 0;
    let filasInsertadas = 0;
    let pendientes: DefuncionRow[] = [];
    let headerSkipped = false;
    let batchId = -1;

    await client.query("BEGIN");
    try {
      // Reemplazo completo: limpia el snapshot anterior antes de cargar el
      // nuevo. TRUNCATE es transaccional en Postgres — si algo falla más
      // abajo, el ROLLBACK también deshace esta limpieza.
      await client.query("TRUNCATE defunciones");

      const { rows: batchRows } = await client.query<{ id: number }>(
        `INSERT INTO raw_sinadef_batches (dataset, source_url, checksum, record_count) VALUES ($1, $2, $3, 0) RETURNING id`,
        [DATASET, SOURCE_URL, checksum]
      );
      batchId = batchRows[0].id;

      const rl = createInterface({ input: createReadStream(csvPath, { encoding: "utf8" }), crlfDelay: Infinity });
      for await (const line of rl) {
        if (!headerSkipped) {
          headerSkipped = true;
          continue;
        }
        if (line.trim() === "") continue;
        filasLeidas++;

        const parsed = parseSinadefLine(line);
        if (!parsed) continue;
        filasLaLibertad++;
        pendientes.push(parsed);

        if (pendientes.length >= BATCH_SIZE) {
          await insertBatch(client, batchId, pendientes);
          filasInsertadas += pendientes.length;
          pendientes = [];
          if (filasLaLibertad % 5000 < BATCH_SIZE) {
            console.log(`  ${filasLeidas.toLocaleString()} filas leídas, ${filasLaLibertad.toLocaleString()} de La Libertad...`);
          }
        }
      }
      if (pendientes.length > 0) {
        await insertBatch(client, batchId, pendientes);
        filasInsertadas += pendientes.length;
      }

      await client.query(`UPDATE raw_sinadef_batches SET record_count = $1 WHERE id = $2`, [filasInsertadas, batchId]);
      await client.query("COMMIT");
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    }

    return { batchId, filasLeidas, filasLaLibertad, filasInsertadas, bytesDescargados: bytes };
  } finally {
    await client.query("SELECT pg_advisory_unlock(hashtext($1))", [ADVISORY_LOCK_KEY]).catch(() => {});
    client.release();
    await rm(tmpDir, { recursive: true, force: true });
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  ingestSinadef()
    .then((summary) => {
      console.log(JSON.stringify(summary, null, 2));
      return pool.end();
    })
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}
