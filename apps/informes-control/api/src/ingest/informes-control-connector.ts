import { createHash } from "node:crypto";
import { pathToFileURL } from "node:url";
import { pool } from "../db/pool.js";
import { extractTotalRows, normalizeInforme, type RawInforme } from "./informes-control-parse.js";

/**
 * Mismo tipo de WAF que el resto de dominios `gob.pe` — no confirmado 418
 * explícito acá (el endpoint respondió sin problema con un UA de
 * navegador desde el inicio), pero se mantiene el mismo header por
 * consistencia y precaución.
 */
const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36";

const API_URL = "https://buscadorinformes.contraloria.gob.pe/BuscadorCGR/Informes/BusquedaInformesCGR.ashx";
const PAGE_SIZE = 500;

/** Cortesía entre requests — mismo criterio que `sanciones-connector.ts`/
 * `perfilprov-conformacion-connector.ts` contra OECE: es un endpoint no
 * documentado públicamente, no una API con límites declarados. */
const REQUEST_DELAY_MS = 300;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchPage(periodo: number, pageNumber: number, departamento?: string): Promise<RawInforme[]> {
  const url = new URL(API_URL);
  url.searchParams.set("ActionPage", "TransportType");
  url.searchParams.set("Action", "loadInformesElastic");
  url.searchParams.set("PageSize", String(PAGE_SIZE));
  url.searchParams.set("PageNumber", String(pageNumber));
  url.searchParams.set("pGeneral", "");
  url.searchParams.set("pAnio", String(periodo));
  // Confirmado en vivo (2026-09-05): el mismo filtro que usa el buscador
  // web para su selector de región. Opcional — sin esto, la ingesta es
  // nacional (363,971 informes históricos en total, confirmado en vivo).
  if (departamento) url.searchParams.set("pDepartamento", departamento);

  const res = await fetch(url, {
    headers: { "User-Agent": USER_AGENT, "X-Requested-With": "XMLHttpRequest" },
  });
  if (!res.ok) {
    throw new Error(`Contraloría devolvió ${res.status} al pedir la página ${pageNumber} del período ${periodo}`);
  }

  const body: unknown = await res.json();
  // Endpoint no documentado — no se garantiza que siempre devuelva un
  // array (ej. podría devolver un objeto de error con la misma forma que
  // un 200 OK). Falla explícito acá en vez de un TypeError confuso más
  // abajo al leer `rows.length`.
  if (!Array.isArray(body)) {
    throw new Error(
      `Contraloría devolvió una respuesta con forma inesperada (no es un array) para la página ${pageNumber} del período ${periodo}.`
    );
  }
  return body as RawInforme[];
}

function checksumOf(rows: RawInforme[]): string {
  return createHash("sha256").update(JSON.stringify(rows)).digest("hex");
}

/**
 * `codigo_informe` es la clave de conflicto — no aparece en `UPSERT_COLUMNS`
 * porque nunca se reasigna en el UPDATE. El resto de columnas, en el orden
 * exacto en que se pasan como parámetros más abajo, define tanto la lista de
 * columnas del INSERT como el SET del ON CONFLICT, para no mantener las tres
 * listas sincronizadas a mano.
 */
const UPSERT_COLUMNS = [
  "numero_informe",
  "ciac_codigo",
  "entidad",
  "codigo_entidad",
  "sector",
  "codigo_sector",
  "nivel_gobierno",
  "departamento",
  "provincia",
  "distrito",
  "descripcion",
  "modalidad_servicio",
  "servicio_control",
  "tipo_informe",
  "periodo",
  "fecha_emision",
  "fecha_publicacion",
  "fecha_fin_ejecucion",
  "es_con_responsabilidad",
  "total_recomendaciones",
  "es_covid",
  "es_reconstruccion",
  "url_resumen_ejecutivo",
  "url_resumen_informe",
  "url_informe_completo",
  "source_batch_id",
] as const;

const INSERT_COLUMNS = ["codigo_informe", ...UPSERT_COLUMNS];
const UPSERT_QUERY = `INSERT INTO informes_control (${INSERT_COLUMNS.join(", ")}, updated_at)
   VALUES (${INSERT_COLUMNS.map((_, i) => `$${i + 1}`).join(",")}, now())
   ON CONFLICT (codigo_informe) DO UPDATE SET
     ${UPSERT_COLUMNS.map((c) => `${c} = EXCLUDED.${c}`).join(",\n     ")},
     updated_at = now()`;

export interface InformesControlIngestSummary {
  periodo: number;
  totalRowsFuente: number | null;
  paginasProcesadas: number;
  filasInsertadas: number;
  filasSinCodigo: number;
}

export async function ingestInformesControl(periodo: number, departamento?: string): Promise<InformesControlIngestSummary> {
  let pageNumber = 1;
  let totalRowsFuente: number | null = null;
  let filasInsertadas = 0;
  let filasSinCodigo = 0;
  let paginasProcesadas = 0;

  for (;;) {
    const rows = await fetchPage(periodo, pageNumber, departamento);
    if (rows.length === 0) break;

    if (totalRowsFuente === null) totalRowsFuente = extractTotalRows(rows);

    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      const batchResult = await client.query<{ id: number }>(
        `INSERT INTO raw_contraloria_batches (periodo, page_number, checksum, record_count)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (periodo, page_number, checksum) DO UPDATE SET fetched_at = now()
         RETURNING id`,
        [periodo, pageNumber, checksumOf(rows), rows.length]
      );
      const batchId = batchResult.rows[0].id;

      for (const raw of rows) {
        const informe = normalizeInforme(raw);
        if (!informe) {
          filasSinCodigo += 1;
          continue;
        }

        await client.query(
          UPSERT_QUERY,
          // Orden alineado a mano con INSERT_COLUMNS ($1=codigo_informe, luego UPSERT_COLUMNS en orden).
          [
            informe.codigoInforme, informe.numeroInforme, informe.ciacCodigo, informe.entidad, informe.codigoEntidad,
            informe.sector, informe.codigoSector, informe.nivelGobierno, informe.departamento, informe.provincia,
            informe.distrito, informe.descripcion, informe.modalidadServicio, informe.servicioControl,
            informe.tipoInforme, informe.periodo, informe.fechaEmision, informe.fechaPublicacion,
            informe.fechaFinEjecucion, informe.esConResponsabilidad, informe.totalRecomendaciones, informe.esCovid,
            informe.esReconstruccion, informe.urlResumenEjecutivo, informe.urlResumenInforme,
            informe.urlInformeCompleto, batchId,
          ]
        );
        filasInsertadas += 1;
      }

      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }

    paginasProcesadas += 1;
    if (rows.length < PAGE_SIZE) break; // última página
    await sleep(REQUEST_DELAY_MS);
    pageNumber += 1;
  }

  return { periodo, totalRowsFuente, paginasProcesadas, filasInsertadas, filasSinCodigo };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const periodo = Number(process.argv[2] ?? new Date().getFullYear());
  const departamento = process.argv[3];
  ingestInformesControl(periodo, departamento)
    .then((summary) => {
      console.log(JSON.stringify(summary, null, 2));
      return pool.end();
    })
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}
