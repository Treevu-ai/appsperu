import type { NeonRow } from "../../db/neon-pool.js";
import type { ToolHandlerContext, HandlerResult } from "../registry.js";

interface BidderRow extends NeonRow {
  ocid: string;
  bidder_id: string;
  bidder_name: string;
  estado: string | null;
  ranking: number | null;
  monto_ofertado: string | number | null;
  source_batch_id: string | number;
  source_timestamp: string | null;
}

interface ProviderStatsRow extends NeonRow {
  bidder_id: string;
  bidder_name: string;
  source_timestamp: string | null;
  total_procesos: string;
  total_victorias: string;
  win_rate_pct: string | null;
}

interface ProviderProcessRow extends NeonRow {
  ocid: string;
  estado: string | null;
  ranking: number | null;
  source_batch_id: string | number;
  source_timestamp: string | null;
}

interface CompetitionRow extends NeonRow {
  bidder_name: string;
  bidder_id: string;
  total_participaciones: string;
  total_victorias: string;
  win_rate_pct: string | null;
  licitaciones_perdidas: string;
  descalificaciones: string;
}

interface CoparticipationRow extends NeonRow {
  provider_1: string;
  name_1: string;
  provider_2: string;
  name_2: string;
  co_participation_count: string;
}

export async function byOcid(ctx: ToolHandlerContext): Promise<HandlerResult> {
  const { db, args } = ctx;
  const ocid = args.ocid as string;

  const result = await db.query<BidderRow>(
    `SELECT b.ocid,b.bidder_id,b.bidder_name,b.estado,b.ranking,b.monto_ofertado,b.created_at,
            b.source_batch_id,rb.fetched_at AS source_timestamp
     FROM bidders b
     JOIN raw_ocds_batches rb ON rb.id=b.source_batch_id
     WHERE b.ocid = $1
     ORDER BY b.ranking ASC NULLS LAST, b.created_at ASC`,
    [ocid]
  );

  if (result.rows.length === 0) {
    return {
      status: 404,
      body: {
        error: "No se encontraron participantes para este proceso",
        ocid,
      },
    };
  }

  const ganador = result.rows.find((r) => r.estado === "ganador");
  const participantes = result.rows;

  return {
    status: 200,
    body: {
      ocid,
      total_bidders: result.rows.length,
      ganador: ganador
        ? {
            id: ganador.bidder_id,
            nombre: ganador.bidder_name,
          }
        : null,
      participantes: participantes.map((b) => ({
        bidder_id: b.bidder_id,
        nombre: b.bidder_name,
        estado: b.estado,
        ranking: b.ranking,
        monto_ofertado: b.monto_ofertado,
        source: { batch_id: b.source_batch_id, extracted_at: b.source_timestamp },
      })),
      limitation: "Participante significa que figura en el registro OCDS. No equivale por sí solo a una cotización, oferta válida o comportamiento competitivo.",
    },
  };
}

export async function byProviderId(ctx: ToolHandlerContext): Promise<HandlerResult> {
  const { db, args } = ctx;
  const providerId = args.providerId as string;

  const result = await db.query<ProviderStatsRow>(
    `SELECT b.bidder_id,MAX(b.bidder_name) AS bidder_name,MAX(rb.fetched_at) AS source_timestamp,
       COUNT(DISTINCT b.ocid) as total_procesos,
       COUNT(DISTINCT CASE WHEN b.estado = 'ganador' THEN b.ocid END) as total_victorias,
       ROUND(
         100.0 * COUNT(DISTINCT CASE WHEN b.estado = 'ganador' THEN b.ocid END) /
         COUNT(DISTINCT b.ocid),
         2
       ) as win_rate_pct
     FROM bidders b
     JOIN raw_ocds_batches rb ON rb.id=b.source_batch_id
     WHERE b.bidder_id = $1
     GROUP BY b.bidder_id`,
    [providerId]
  );

  if (result.rows.length === 0) {
    return {
      status: 404,
      body: {
        error: "Proveedor no encontrado",
        provider_id: providerId,
      },
    };
  }

  const row = result.rows[0];

  const procesos = await db.query<ProviderProcessRow>(
    `SELECT b.ocid,b.estado,b.ranking,b.source_batch_id,rb.fetched_at AS source_timestamp
     FROM bidders b
     JOIN raw_ocds_batches rb ON rb.id=b.source_batch_id
     WHERE b.bidder_id = $1
     ORDER BY b.created_at DESC
     LIMIT 100`,
    [providerId]
  );

  return {
    status: 200,
    body: {
      provider_id: providerId,
      provider_name: row.bidder_name,
      total_participaciones: parseInt(row.total_procesos),
      total_victorias: parseInt(row.total_victorias),
      win_rate: `${row.win_rate_pct}%`,
      source: { last_extracted_at: row.source_timestamp },
      procesos: procesos.rows.map((p) => ({
        ocid: p.ocid,
        estado: p.estado,
        ranking: p.ranking,
        source: { batch_id: p.source_batch_id, extracted_at: p.source_timestamp },
      })),
      limitation: "Cobertura parcial de registros OCDS disponibles en las corridas locales; las tasas son descriptivas.",
    },
  };
}

export async function competition(ctx: ToolHandlerContext): Promise<HandlerResult> {
  const { db } = ctx;

  const result = await db.query<CompetitionRow>(
    `SELECT
       bidder_name,
       bidder_id,
       COUNT(DISTINCT ocid) AS total_participaciones,
       COUNT(DISTINCT CASE WHEN estado = 'ganador' THEN ocid END) AS total_victorias,
       ROUND(100.0 * COUNT(DISTINCT CASE WHEN estado = 'ganador' THEN ocid END) /
         COUNT(DISTINCT ocid), 2) AS win_rate_pct,
       COUNT(DISTINCT CASE WHEN estado = 'participante' THEN ocid END) AS licitaciones_perdidas,
       COUNT(DISTINCT CASE WHEN estado = 'descalificado' THEN ocid END) AS descalificaciones
     FROM bidders
     WHERE source_batch_id IS NOT NULL
     GROUP BY bidder_name, bidder_id
     ORDER BY total_victorias DESC
     LIMIT 10`
  );

  return {
    status: 200,
    body: {
      message: "Resumen descriptivo de participaciones y adjudicaciones observadas",
      analisis: result.rows.map((r) => ({
        nombre: r.bidder_name,
        id: r.bidder_id,
        participaciones: parseInt(r.total_participaciones),
        victorias: parseInt(r.total_victorias),
        win_rate: `${r.win_rate_pct}%`,
        perdidas: parseInt(r.licitaciones_perdidas),
        descalificaciones: parseInt(r.descalificaciones),
      })),
      limitation: "Los datos provienen de una ingesta parcial de registros OCDS. La tasa no mide competencia, desempeño ni irregularidad.",
    },
  };
}

export async function coparticipation(ctx: ToolHandlerContext): Promise<HandlerResult> {
  const { db } = ctx;

  const result = await db.query<CoparticipationRow>(
    `WITH bidder_pairs AS (
      SELECT
        b1.bidder_id AS provider_1,
        b1.bidder_name AS name_1,
        b2.bidder_id AS provider_2,
        b2.bidder_name AS name_2,
        COUNT(DISTINCT b1.ocid) AS co_participation_count
      FROM bidders b1
      JOIN bidders b2 ON b1.ocid = b2.ocid
        AND b1.bidder_id < b2.bidder_id
        AND b2.source_batch_id IS NOT NULL
      WHERE b1.source_batch_id IS NOT NULL
      GROUP BY b1.bidder_id, b1.bidder_name, b2.bidder_id, b2.bidder_name
      HAVING COUNT(DISTINCT b1.ocid) >= 3
    )
    SELECT *
    FROM bidder_pairs
    ORDER BY co_participation_count DESC
    LIMIT 50`
  );

  return {
    status: 200,
    body: {
      message:
        "Pares de proveedores con co-participación repetida en la muestra disponible",
      pares: result.rows.map((r) => ({
        proveedor_1: { id: r.provider_1, nombre: r.name_1 },
        proveedor_2: { id: r.provider_2, nombre: r.name_2 },
        co_participaciones: parseInt(r.co_participation_count),
      })),
      threshold: "Mínimo 3 co-participaciones observadas",
      limitation: "La co-participación puede responder a rubros, zonas, periodos o cobertura de la fuente. No determina coordinación ni colusión.",
    },
  };
}
