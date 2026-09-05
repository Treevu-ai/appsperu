import { createHash } from "node:crypto";
import { pathToFileURL } from "node:url";
import { pool } from "../db/pool.js";
import {
  buildHeaderIndex,
  findColumnValueAny,
  parseFechaCorte,
  parseInfomidisCsv,
  parseInfomidisNumber,
  pickLatestInfomidisResource,
  type CkanResource,
} from "./infomidis-parse.js";

/**
 * Mismo WAF, mismo requisito de User-Agent que RENIPRESS (ver
 * renipress-connector.ts en servicios-salud) — confirmado en vivo durante
 * el spike de ADR-0018.
 */
const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36";

const CKAN_BASE = "https://www.datosabiertos.gob.pe";
const DATASET_SLUG = "cobertura-de-los-programas-sociales-adscritos-al-midis-ministerio-de-desarrollo-e-inclusión";

interface CkanPackageShowResult {
  resources?: CkanResource[];
}

interface CkanPackageShowResponse {
  success: boolean;
  result: CkanPackageShowResult | CkanPackageShowResult[];
}

async function fetchLatestResource(): Promise<CkanResource> {
  const url = `${CKAN_BASE}/api/3/action/package_show?id=${encodeURIComponent(DATASET_SLUG)}`;
  const res = await fetch(url, { headers: { "User-Agent": USER_AGENT, Accept: "application/json" } });
  if (!res.ok) {
    throw new Error(`CKAN package_show devolvió ${res.status} para el dataset INFOMIDIS.`);
  }

  const data = (await res.json()) as CkanPackageShowResponse;
  if (!data.success) {
    throw new Error("CKAN package_show no tuvo éxito para el dataset INFOMIDIS.");
  }

  const result = Array.isArray(data.result) ? data.result[0] : data.result;
  if (!result) {
    throw new Error("CKAN package_show devolvió un resultado vacío para el dataset INFOMIDIS.");
  }

  return pickLatestInfomidisResource(result.resources ?? []);
}

function checksumOf(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}

/** Columnas esperadas, como conjuntos alternativos de tokens normalizados
 * (ver `findColumnValueAny`). Si ninguna alternativa calza en un corte
 * futuro, el conector no falla — la fila inserta NULL para esa columna y se
 * registra en `columnasFaltantes`.
 *
 * `qaliwarma*` acepta también "WASI MIKUNA" — confirmado en vivo (corte de
 * 2026-04) que MIDIS renombró el programa entre 2024-08 y 2026-04. Es el
 * mismo programa; el nombre de campo se mantiene por continuidad histórica
 * en vez de perseguir el nombre vigente cada vez que el programa cambie. */
const COLUMN_TOKENS: Record<string, string[][]> = {
  cunamasCuidadoDiurno: [["CUNAMAS", "CUIDADO", "DIURNO"]],
  cunamasAcompanamiento: [["CUNAMAS", "ACOMPA"]],
  juntosAfiliados: [["JUNTOS", "AFILIADOS"]],
  juntosAbonados: [["JUNTOS", "ABONADOS"]],
  foncodesUsuarios: [["FONCODES", "USUARIOS", "ESTIMADOS"]],
  // El corte 2026-04 confirma un tercer problema real, además del rename:
  // el archivo de MIDIS trae "Ni?s y ni?s" en el encabezado — un `?` (0x3F)
  // literal en los bytes crudos, no un problema de encoding de este
  // conector. "ATENDIDOS" es la única palabra que sobrevive intacta y
  // distingue esta columna de la de IIEE del mismo programa.
  qaliwarmaNinos: [
    ["QALI", "WARMA", "NINOS", "ATENDIDOS"],
    ["WASI", "MIKUNA", "NINOS", "ATENDIDOS"],
    ["QALI", "WARMA", "ATENDIDOS"],
    ["WASI", "MIKUNA", "ATENDIDOS"],
  ],
  qaliwarmaIiee: [
    ["QALI", "WARMA", "IIEE"],
    ["WASI", "MIKUNA", "IIEE"],
  ],
  pension65Usuarios: [["PENSION", "65", "USUARIOS"]],
  contigoUsuarios: [["CONTIGO", "USUARIOS"]],
  paisTambos: [["PAIS", "TAMBOS", "PRESTANDO"]],
  paisAtenciones: [["PAIS", "ATENCIONES"]],
  paisBeneficiarios: [["PAIS", "BENEFICIARIOS"]],
};

export interface InfomidisIngestSummary {
  resourceUrl: string;
  batchId: number;
  filasOrigen: number;
  filasInsertadas: number;
  filasSinUbigeo: number;
  filasSinFechaCorte: number;
  columnasFaltantes: string[];
}

export async function ingestInfomidis(): Promise<InfomidisIngestSummary> {
  const resource = await fetchLatestResource();

  const res = await fetch(resource.url, { headers: { "User-Agent": USER_AGENT } });
  if (!res.ok) {
    throw new Error(`INFOMIDIS devolvió ${res.status} al descargar ${resource.url}`);
  }
  const buffer = Buffer.from(await res.arrayBuffer());
  // Confirmado en vivo: Latin-1 (a diferencia de RENIPRESS, que es UTF-8 con BOM).
  const csvText = buffer.toString("latin1");
  const rows = parseInfomidisCsv(csvText);

  const headerIndex = rows.length > 0 ? buildHeaderIndex(rows[0]) : new Map<string, string>();
  const columnasFaltantes = Object.entries(COLUMN_TOKENS)
    .filter(([, alternatives]) => rows.length > 0 && findColumnValueAny(rows[0], headerIndex, alternatives) === undefined)
    .map(([field]) => field);

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const checksum = checksumOf(csvText);
    const batchResult = await client.query<{ id: number }>(
      `INSERT INTO raw_infomidis_batches (resource_url, checksum, record_count)
       VALUES ($1, $2, $3)
       ON CONFLICT (resource_url, checksum) DO UPDATE SET fetched_at = now()
       RETURNING id`,
      [resource.url, checksum, rows.length]
    );
    const batchId = batchResult.rows[0].id;

    let inserted = 0;
    let sinUbigeo = 0;
    let sinFechaCorte = 0;

    for (const row of rows) {
      const ubigeo = (row.UBIGEO ?? "").trim();
      if (!ubigeo) {
        sinUbigeo += 1;
        continue;
      }

      const fechaCorte = parseFechaCorte(row.FECHA_CORTE);
      if (!fechaCorte) {
        sinFechaCorte += 1;
        continue;
      }

      await client.query(
        `INSERT INTO cobertura_social (
           ubigeo, fecha_corte, cunamas_cuidado_diurno, cunamas_acompanamiento_familias,
           juntos_hogares_afiliados, juntos_hogares_abonados, foncodes_usuarios_estimados,
           qaliwarma_ninos_atendidos, qaliwarma_iiee, pension65_usuarios, contigo_usuarios,
           pais_tambos, pais_atenciones, pais_beneficiarios, source_batch_id, updated_at
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15, now())
         ON CONFLICT (ubigeo, fecha_corte) DO UPDATE SET
           cunamas_cuidado_diurno = EXCLUDED.cunamas_cuidado_diurno,
           cunamas_acompanamiento_familias = EXCLUDED.cunamas_acompanamiento_familias,
           juntos_hogares_afiliados = EXCLUDED.juntos_hogares_afiliados,
           juntos_hogares_abonados = EXCLUDED.juntos_hogares_abonados,
           foncodes_usuarios_estimados = EXCLUDED.foncodes_usuarios_estimados,
           qaliwarma_ninos_atendidos = EXCLUDED.qaliwarma_ninos_atendidos,
           qaliwarma_iiee = EXCLUDED.qaliwarma_iiee,
           pension65_usuarios = EXCLUDED.pension65_usuarios,
           contigo_usuarios = EXCLUDED.contigo_usuarios,
           pais_tambos = EXCLUDED.pais_tambos,
           pais_atenciones = EXCLUDED.pais_atenciones,
           pais_beneficiarios = EXCLUDED.pais_beneficiarios,
           source_batch_id = EXCLUDED.source_batch_id,
           updated_at = now()`,
        [
          ubigeo,
          fechaCorte,
          parseInfomidisNumber(findColumnValueAny(row, headerIndex, COLUMN_TOKENS.cunamasCuidadoDiurno)),
          parseInfomidisNumber(findColumnValueAny(row, headerIndex, COLUMN_TOKENS.cunamasAcompanamiento)),
          parseInfomidisNumber(findColumnValueAny(row, headerIndex, COLUMN_TOKENS.juntosAfiliados)),
          parseInfomidisNumber(findColumnValueAny(row, headerIndex, COLUMN_TOKENS.juntosAbonados)),
          parseInfomidisNumber(findColumnValueAny(row, headerIndex, COLUMN_TOKENS.foncodesUsuarios)),
          parseInfomidisNumber(findColumnValueAny(row, headerIndex, COLUMN_TOKENS.qaliwarmaNinos)),
          parseInfomidisNumber(findColumnValueAny(row, headerIndex, COLUMN_TOKENS.qaliwarmaIiee)),
          parseInfomidisNumber(findColumnValueAny(row, headerIndex, COLUMN_TOKENS.pension65Usuarios)),
          parseInfomidisNumber(findColumnValueAny(row, headerIndex, COLUMN_TOKENS.contigoUsuarios)),
          parseInfomidisNumber(findColumnValueAny(row, headerIndex, COLUMN_TOKENS.paisTambos)),
          parseInfomidisNumber(findColumnValueAny(row, headerIndex, COLUMN_TOKENS.paisAtenciones)),
          parseInfomidisNumber(findColumnValueAny(row, headerIndex, COLUMN_TOKENS.paisBeneficiarios)),
          batchId,
        ]
      );
      inserted += 1;
    }

    await client.query("COMMIT");

    if (columnasFaltantes.length > 0) {
      console.warn(`INFOMIDIS: columnas esperadas no encontradas en este corte: ${columnasFaltantes.join(", ")}`);
    }

    return {
      resourceUrl: resource.url,
      batchId,
      filasOrigen: rows.length,
      filasInsertadas: inserted,
      filasSinUbigeo: sinUbigeo,
      filasSinFechaCorte: sinFechaCorte,
      columnasFaltantes,
    };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  ingestInfomidis()
    .then((summary) => {
      console.log(JSON.stringify(summary, null, 2));
      return pool.end();
    })
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}
