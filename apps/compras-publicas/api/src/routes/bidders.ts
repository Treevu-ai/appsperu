import { Router, type Request, type Response } from "express";
import { pool } from "../db/pool.js";

const router = Router();

/**
 * GET /api/bidders/:ocid
 *
 * Devuelve lista de participantes en una licitación
 */
router.get("/:ocid", async (req: Request, res: Response) => {
  const { ocid } = req.params;

  try {
    // Validar formato OCDS
    if (!ocid.startsWith("ocds-")) {
      return res.status(400).json({ error: "OCID inválido. Debe comenzar con 'ocds-'" });
    }

    // Query: obtener todos los bidders
    const result = await pool.query(
      `SELECT b.ocid,b.bidder_id,b.bidder_name,b.estado,b.ranking,b.monto_ofertado,b.created_at,
              b.source_batch_id,rb.fetched_at AS source_timestamp
       FROM bidders b
       JOIN raw_ocds_batches rb ON rb.id=b.source_batch_id
       WHERE b.ocid = $1
       ORDER BY b.ranking ASC NULLS LAST, b.created_at ASC`,
      [ocid]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        error: "No se encontraron participantes para este proceso",
        ocid,
      });
    }

    // Procesar respuesta
    const ganador = result.rows.find((r) => r.estado === "ganador");
    const participantes = result.rows;

    res.json({
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
    });
  } catch (error) {
    console.error("Error en GET /api/bidders/:ocid", error);
    res.status(500).json({ error: "Error interno del servidor" });
  }
});

/**
 * GET /api/bidders/provider/:provider_id
 *
 * Devuelve licitaciones en las que participó un proveedor
 */
router.get("/provider/:provider_id", async (req: Request, res: Response) => {
  const { provider_id } = req.params;

  try {
    // Query: obtener todos los procesos del proveedor
    const result = await pool.query(
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
      [provider_id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        error: "Proveedor no encontrado",
        provider_id,
      });
    }

    const row = result.rows[0];

    // Query adicional: procesos específicos
    const procesos = await pool.query(
      `SELECT b.ocid,b.estado,b.ranking,b.source_batch_id,rb.fetched_at AS source_timestamp
       FROM bidders b
       JOIN raw_ocds_batches rb ON rb.id=b.source_batch_id
       WHERE b.bidder_id = $1
       ORDER BY b.created_at DESC
       LIMIT 100`,
      [provider_id]
    );

    res.json({
      provider_id,
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
    });
  } catch (error) {
    console.error("Error en GET /api/bidders/provider/:provider_id", error);
    res.status(500).json({ error: "Error interno del servidor" });
  }
});

/**
 * GET /api/bidders/analytics/competition
 *
 * Resume participaciones y adjudicaciones observadas, sin inferir calidad de
 * competencia ni conducta de los proveedores.
 */
router.get("/analytics/competition", async (req: Request, res: Response) => {
  try {
    const result = await pool.query(
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

    res.json({
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
    });
  } catch (error) {
    console.error("Error en GET /api/bidders/analytics/competition", error);
    res.status(500).json({ error: "Error interno del servidor" });
  }
});

/**
 * GET /api/bidders/analytics/co-participation
 *
 * Cuenta co-participaciones en los procesos observados. Es una descripción de
 * la muestra, no una prueba ni un indicador de colusión.
 */
router.get("/analytics/co-participation", async (req: Request, res: Response) => {
  try {
    // Query: pares que coinciden en procesos dentro de la muestra disponible.
    const result = await pool.query(
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

    res.json({
      message:
        "Pares de proveedores con co-participación repetida en la muestra disponible",
      pares: result.rows.map((r) => ({
        proveedor_1: { id: r.provider_1, nombre: r.name_1 },
        proveedor_2: { id: r.provider_2, nombre: r.name_2 },
        co_participaciones: parseInt(r.co_participation_count),
      })),
      threshold: "Mínimo 3 co-participaciones observadas",
      limitation: "La co-participación puede responder a rubros, zonas, periodos o cobertura de la fuente. No determina coordinación ni colusión.",
    });
  } catch (error) {
    console.error("Error en GET /api/bidders/analytics/cartels", error);
    res.status(500).json({ error: "Error interno del servidor" });
  }
});

export default router;
