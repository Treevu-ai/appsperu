import { Router } from "express";
import { z } from "zod";
import { pool } from "../db/pool.js";
import { ambientalPool } from "../db/ambiental-pool.js";
import { sancionadosPool } from "../db/sancionados-pool.js";
import { asyncHandler } from "../lib/async-handler.js";
import { parseQuery } from "../lib/validate-query.js";

export const eudrLegalidadRouter = Router();

const QuerySchema = z.object({
  ruc: z.string().regex(/^\d{11}$/, "El RUC debe tener 11 dígitos"),
});

interface InfraccionAmbientalRow {
  nro_expediente: string;
  fecha_rd: string | Date | null;
  detalle_infraccion: string | null;
  tipo_sancion: string | null;
  cantidad_multa: string | number | null;
}

interface InhabilitacionRow {
  resolucion: string;
  desde: string | Date | null;
  hasta: string | Date | null;
  infraccion: string | null;
  estado: string;
}

interface MultaRow {
  resolucion: string;
  fecha_resolucion: string | Date | null;
  monto_multa: string | number | null;
  infraccion: string | null;
  estado: string;
}

/**
 * Riesgo de legalidad EUDR (art. 10 del Reglamento UE 2023/1115) para el
 * titular (RUC) de una parcela/organización: cruza contra sanciones
 * ambientales OEFA (infracciones-ambientales) e inhabilitaciones/multas
 * OSCE-RNP (proveedores-sancionados). Es una señal de riesgo, no una
 * certificación de legalidad — ausencia de sanción no prueba que la
 * organización cumpla, solo que no hay un hallazgo público en estas fuentes.
 */
eudrLegalidadRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const parsed = parseQuery(QuerySchema, req.query, res);
    if (!parsed) return;
    const { ruc } = parsed;

    const [parcelasResult, infraccionesResult, inhabilitacionesResult, multasResult] = await Promise.all([
      pool.query<{ codigo_parcela: string }>(
        `SELECT codigo_parcela FROM eudr_parcela WHERE ruc = $1`,
        [ruc]
      ),
      ambientalPool.query<InfraccionAmbientalRow>(
        `SELECT nro_expediente, fecha_rd, detalle_infraccion, tipo_sancion, cantidad_multa
         FROM infracciones_ambientales
         WHERE tipo_doc = 'R.U.C.' AND id_doc_administrado = $1
         ORDER BY fecha_rd DESC NULLS LAST`,
        [ruc]
      ),
      sancionadosPool.query<InhabilitacionRow>(
        `SELECT resolucion, desde, hasta, infraccion, estado
         FROM inhabilitaciones WHERE ruc = $1 ORDER BY desde DESC NULLS LAST`,
        [ruc]
      ),
      sancionadosPool.query<MultaRow>(
        `SELECT resolucion, fecha_resolucion, monto_multa, infraccion, estado
         FROM multas WHERE ruc = $1 ORDER BY fecha_resolucion DESC NULLS LAST`,
        [ruc]
      ),
    ]);

    const infracciones = infraccionesResult.rows.map((r) => ({
      expediente: r.nro_expediente,
      fecha: r.fecha_rd,
      detalle: r.detalle_infraccion,
      tipoSancion: r.tipo_sancion,
      multaUit: r.cantidad_multa === null ? null : Number(r.cantidad_multa),
    }));

    const inhabilitaciones = inhabilitacionesResult.rows.map((r) => ({
      resolucion: r.resolucion,
      desde: r.desde,
      hasta: r.hasta,
      infraccion: r.infraccion,
      estado: r.estado,
      vigente: r.estado === "VIGENTE",
    }));

    const multas = multasResult.rows.map((r) => ({
      resolucion: r.resolucion,
      fecha: r.fecha_resolucion,
      montoMulta: r.monto_multa === null ? null : Number(r.monto_multa),
      infraccion: r.infraccion,
      estado: r.estado,
      vigente: r.estado === "VIGENTE",
    }));

    const tieneInhabilitacionVigente = inhabilitaciones.some((i) => i.vigente);
    const tieneSancionAmbiental = infracciones.length > 0;

    res.json({
      ruc,
      parcelasRegistradas: parcelasResult.rows.map((r) => r.codigo_parcela),
      sancionesAmbientalesOefa: infracciones,
      inhabilitacionesOsce: inhabilitaciones,
      multasOsce: multas,
      riesgo: {
        inhabilitacionVigente: tieneInhabilitacionVigente,
        algunaSancionAmbiental: tieneSancionAmbiental,
        nivel: tieneInhabilitacionVigente || tieneSancionAmbiental ? "REVISAR" : "SIN_HALLAZGOS",
      },
      fuentes: {
        ambiental: "OEFA / RUIAS (infracciones-ambientales)",
        contratacionPublica: "OSCE / RNP (proveedores-sancionados)",
      },
      aclaracion:
        "Esto es una señal de riesgo contra fuentes públicas, no una certificación de legalidad. " +
        "La ausencia de hallazgos no prueba cumplimiento, solo que no hay sanción registrada en estas fuentes.",
    });
  })
);
