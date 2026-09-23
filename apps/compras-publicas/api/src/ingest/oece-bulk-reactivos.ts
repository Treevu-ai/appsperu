import { createReadStream, createWriteStream, existsSync, mkdirSync, renameSync, statSync } from "node:fs";
import { createGunzip } from "node:zlib";
import { createInterface } from "node:readline";
import { pipeline } from "node:stream/promises";
import { Readable } from "node:stream";
import { fileURLToPath, pathToFileURL } from "node:url";
import { fetchWithTimeout } from "@appsperu/http-client";
import { pool } from "../db/pool.js";
import type { OcdsAward, OcdsRecord } from "./normalize-awards.js";
import {
  findReactivoMatches,
  firstAwardOf,
  upsertReactivoHallazgo,
  type OcdsReleaseWithItems,
  type ReactivoAward,
  type ReactivoMatch,
} from "./reactivos-medicos-scan.js";

/**
 * Segunda vía de ingesta para el mismo recorte temático "reactivos médicos"
 * que `reactivos-medicos-scan.ts`, pero fuente distinta: en vez de paginar
 * `/releases` (20/página, ventana acotada) y hacer un `GET /records?ocid=`
 * por cada match, descarga los `.jsonl.gz` anuales republicados por Open
 * Contracting Partnership en data.open-contracting.org/en/publication/135.
 *
 * Por qué existe esta vía además de la paginada: `GET /api/v1/search?supplier=`
 * de OECE ignora el filtro en servidor (confirmado en vivo el 2026-09-23,
 * comparando 3 llamadas con RUC distinto/inventado/ausente -> mismo
 * total_results en las tres) -- no hay forma de pedirle a la API "tráeme
 * todo el histórico de una vez" sin paginar millones de releases. El bulk
 * republicado sí trae, por año, el release compilado completo (`tender`,
 * `parties`, `awards`, `contracts`) en un solo archivo -- sin paginación y
 * sin el segundo round-trip a `/records?ocid=`, porque el award ya viene
 * embebido en el mismo release.
 *
 * Validado en vivo (2026-09-23) contra 2022-2026: 3,720 matches de "reactivo"
 * en 463,968 releases, 80% con adjudicatario ya embebido -- muy por encima
 * de la muestra manual de ~21 que motivó este ticket.
 *
 * Reutiliza `findReactivoMatches`/`firstAwardOf`/`upsertReactivoHallazgo` de
 * `reactivos-medicos-scan.ts` en vez de reimplementar la detección o el
 * upsert -- ambas vías convergen en la misma tabla y el mismo
 * `ON CONFLICT (ocid, item_desc)`, así un mismo hallazgo detectado por
 * cualquiera de las dos rutas no se duplica.
 */
const BULK_URL_TEMPLATE = "https://data.open-contracting.org/en/publication/135/download?name={name}";

export function bulkYearUrl(year: number): string {
  return BULK_URL_TEMPLATE.replace("{name}", `${year}.jsonl.gz`);
}

/**
 * Único formato soportado es un rango o lista de años -- a diferencia del
 * scan paginado, acá no tiene sentido un `--start-date`/`--end-date` fino:
 * el archivo se descarga por año completo o no se descarga.
 */
export function resolveBulkYears(yearsArg: string): number[] {
  const currentYear = new Date().getFullYear();
  if (yearsArg === "all") {
    const years: number[] = [];
    for (let y = 2003; y <= currentYear; y++) years.push(y);
    return years;
  }
  if (yearsArg.includes("-")) {
    const [start, end] = yearsArg.split("-", 2).map(Number);
    if (!Number.isInteger(start) || !Number.isInteger(end) || start > end) {
      throw new Error(`Rango de años inválido: "${yearsArg}"`);
    }
    const years: number[] = [];
    for (let y = start; y <= end; y++) years.push(y);
    return years;
  }
  if (yearsArg.includes(",")) {
    return yearsArg
      .split(",")
      .map((y) => Number(y.trim()))
      .filter((y) => Number.isInteger(y))
      .sort((a, b) => a - b);
  }
  const single = Number(yearsArg);
  if (!Number.isInteger(single)) throw new Error(`Año inválido: "${yearsArg}"`);
  return [single];
}

/** Release tal como viene en el bulk anual: mismo shape que `OcdsReleaseWithItems`
 * (reutilizable directo en `findReactivoMatches`) más `awards`, que la API
 * paginada de `/releases` no trae pero el bulk sí, embebido. */
export interface OcdsBulkRelease extends OcdsReleaseWithItems {
  date?: string;
  awards?: OcdsAward[];
}

/** Descarga el `.jsonl.gz` del año si no está ya en `cacheDir` (mismo criterio
 * que el resto de conectores de este repo: cache local en disco, nunca en
 * memoria -- los archivos pesan 50-200 MB comprimidos). Devuelve la ruta. */
export async function downloadBulkYear(year: number, cacheDir: string): Promise<string> {
  if (!Number.isInteger(year)) {
    throw new Error(`Año inválido para descarga de bulk OCDS: ${year}`);
  }

  mkdirSync(cacheDir, { recursive: true });
  const dest = `${cacheDir}/${year}.jsonl.gz`;
  if (existsSync(dest) && statSync(dest).size > 0) {
    return dest;
  }

  const url = bulkYearUrl(year);
  // fetchWithTimeout limpia su timer apenas `fetch()` resuelve (fase de
  // headers) -- no corta la descarga del body, que puede tardar varios
  // minutos para un año de ~150 MB comprimidos.
  const res = await fetchWithTimeout(url);
  if (!res.ok || !res.body) {
    throw new Error(`Descarga del bulk OCDS ${year} falló: HTTP ${res.status} en ${url}`);
  }

  const tmp = `${dest}.part`;
  const webStream = res.body as unknown as import("node:stream/web").ReadableStream<Uint8Array>;
  await pipeline(Readable.fromWeb(webStream), createWriteStream(tmp));
  renameSync(tmp, dest);
  return dest;
}

/** Itera línea por línea sin cargar el archivo completo en memoria -- un año
 * descomprime a varios cientos de MB de texto, no es razonable materializarlo
 * entero como string ni como array. */
export async function* iterateBulkReleases(gzPath: string): AsyncGenerator<OcdsBulkRelease> {
  const gunzip = createGunzip();
  const fileStream = createReadStream(gzPath);
  // `.pipe()` no reenvía el evento "error" de la fuente al destino -- si
  // `fileStream` falla (I/O, el archivo se borra a mitad de una corrida
  // larga), ese error nunca llegaría a `gunzip`/`readline` y terminaría como
  // excepción no capturada. Se reenvía explícitamente destruyendo `gunzip`
  // con el mismo error, que sí es el evento que `readline` escucha en su
  // stream `input` y convierte en un throw del iterador async.
  fileStream.on("error", (error) => gunzip.destroy(error));
  const lines = createInterface({ input: fileStream.pipe(gunzip) });

  for await (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      yield JSON.parse(trimmed) as OcdsBulkRelease;
    } catch {
      // Línea corrupta o truncada (poco probable en un archivo bien descargado,
      // pero un .part renombrado a medio truncar sí podría dejar la última
      // línea incompleta) -- se omite esa línea, no todo el archivo.
      continue;
    }
  }
}

/** El award ya viene embebido en el release del bulk -- a diferencia del
 * camino paginado, no hace falta un segundo fetch a `/records?ocid=`.
 * Reutiliza `firstAwardOf` (misma regla: primer award con proveedor
 * completo) envolviendo el release como el `OcdsRecord` que esa función
 * espera, sin reimplementar la lógica de selección. */
export function awardFromBulkRelease(release: OcdsBulkRelease): ReactivoAward | null {
  const fauxRecord: OcdsRecord = { ocid: release.ocid, compiledRelease: { awards: release.awards ?? [] } };
  return firstAwardOf(fauxRecord);
}

export interface BulkReactivosYearSummary {
  year: number;
  releasesScanned: number;
  matches: number;
  matchesConAward: number;
  filasUpsertadas: number;
}

export interface BulkReactivosScanSummary {
  years: number[];
  perYear: BulkReactivosYearSummary[];
  totalReleasesScanned: number;
  totalMatches: number;
  totalMatchesConAward: number;
  totalFilasUpsertadas: number;
}

/**
 * Corre el scan para los años pedidos, en orden ascendente. Un mismo `ocid`
 * puede aparecer en más de un archivo anual (el bulk se bucketiza por fecha
 * de *compilación/actualización* de OECE, no por fecha real del proceso --
 * confirmado en vivo: el archivo "2026" trae procesos con fecha real de
 * 2015-2017 recompilados este año). Procesar en orden ascendente resuelve la
 * duplicación *dentro de una misma corrida* sin lógica extra, dejando que el
 * `ON CONFLICT (ocid, item_desc)` del upsert compartido sobrescriba en cada
 * re-detección con el archivo más reciente de esa corrida.
 *
 * Importante -- esto NO protege entre corridas separadas: el upsert
 * sobrescribe sin comparar contra lo ya guardado, así que una corrida
 * posterior más angosta (ej. `--years 2023` sola, para reprocesar solo ese
 * año) puede pisar con datos de 2023 una fila que una corrida previa
 * `--years 2022-2026` ya había dejado con el estado/adjudicatario más
 * reciente de 2026 para ese mismo `ocid`. Correr siempre con el rango
 * completo que se quiere mantener vigente, no años sueltos como parche.
 */
export async function scanBulkReactivos(options: {
  years: number[];
  cacheDir: string;
}): Promise<BulkReactivosScanSummary> {
  const years = [...options.years].sort((a, b) => a - b);
  const perYear: BulkReactivosYearSummary[] = [];

  const client = await pool.connect();
  try {
    for (const year of years) {
      const gzPath = await downloadBulkYear(year, options.cacheDir);

      let releasesScanned = 0;
      let matches = 0;
      let matchesConAward = 0;
      let filasUpsertadas = 0;

      for await (const release of iterateBulkReleases(gzPath)) {
        releasesScanned++;
        const releaseMatches: ReactivoMatch[] = findReactivoMatches([release]);
        if (releaseMatches.length === 0) continue;

        const award = awardFromBulkRelease(release);
        for (const match of releaseMatches) {
          matches++;
          if (award) matchesConAward++;
          await upsertReactivoHallazgo(client, match, award);
          filasUpsertadas++;
        }
      }

      perYear.push({ year, releasesScanned, matches, matchesConAward, filasUpsertadas });
    }
  } finally {
    client.release();
  }

  return {
    years,
    perYear,
    totalReleasesScanned: perYear.reduce((sum, y) => sum + y.releasesScanned, 0),
    totalMatches: perYear.reduce((sum, y) => sum + y.matches, 0),
    totalMatchesConAward: perYear.reduce((sum, y) => sum + y.matchesConAward, 0),
    totalFilasUpsertadas: perYear.reduce((sum, y) => sum + y.filasUpsertadas, 0),
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = process.argv.slice(2);
  const value = (flag: string) => {
    const index = args.indexOf(flag);
    return index >= 0 ? args[index + 1] : undefined;
  };
  const yearsArg = value("--years") ?? "2022-2026";
  // `URL.pathname` en Windows deja el drive letter con "/" adelante
  // ("/C:/Users/...") -- pasado a `mkdirSync` eso produce "C:\C:\Users\..."
  // (el proceso antepone su propio drive), fallando con ENOENT. Mismo
  // patrón que ya usa `src/db/migrate.ts` para evitar esto.
  const cacheDir = value("--cache-dir") ?? fileURLToPath(new URL("../../.cache/ocds-bulk", import.meta.url));

  const years = resolveBulkYears(yearsArg);
  scanBulkReactivos({ years, cacheDir })
    .then((summary) => {
      console.log(JSON.stringify(summary, null, 2));
      return pool.end();
    })
    .catch((error) => {
      console.error("Scan bulk de reactivos médicos falló:", error);
      process.exitCode = 1;
    });
}
