import type { NeonRow } from "../../db/neon-pool.js";
import type { ToolHandlerContext, HandlerResult } from "../registry.js";

interface InhabilitacionRow extends NeonRow {
  razon_social: string;
  resolucion: string;
  periodo_inhabilitacion: string | null;
  desde: string | Date | null;
  hasta: string | Date | null;
  infraccion: string | null;
  otra_infraccion: string | null;
  norma: string | null;
  estado: string | null;
}

interface MultaRow extends NeonRow {
  razon_social: string;
  resolucion: string;
  fecha_resolucion: string | Date | null;
  monto_multa: string | number | null;
  infraccion: string | null;
  periodo_suspension: string | null;
  desde: string | Date | null;
  hasta: string | Date | null;
  norma: string | null;
  estado: string | null;
}

/**
 * Handler para `proveedores_sancionados_sanciones` — GET /api/sanciones.
 *
 * Todo lo que se sabe de un RUC: inhabilitaciones + multas del Tribunal de
 * Contrataciones, sin cruzar nada — solo esta fuente. `tieneInhabilitacionVigente`
 * lee la etiqueta `estado` tal como llegó en la extracción, que es contemporánea
 * al scrape y no equivale a "vigente hoy" (para eso está
 * `vigenteEnFecha`): revisar `desde`/`hasta` de cada registro antes de concluir
 * algo sobre un contrato pasado.
 */
export async function list(ctx: ToolHandlerContext): Promise<HandlerResult> {
  const { db, args } = ctx;
  const ruc = args.ruc as string;

  const [inhabResult, multaResult] = await Promise.all([
    db.query<InhabilitacionRow>(
      `SELECT razon_social, resolucion, periodo_inhabilitacion, desde, hasta, infraccion, otra_infraccion, norma, estado
       FROM inhabilitaciones WHERE ruc = $1 ORDER BY desde DESC NULLS LAST`,
      [ruc]
    ),
    db.query<MultaRow>(
      `SELECT razon_social, resolucion, fecha_resolucion, monto_multa, infraccion, periodo_suspension, desde, hasta, norma, estado
       FROM multas WHERE ruc = $1 ORDER BY fecha_resolucion DESC NULLS LAST`,
      [ruc]
    ),
  ]);

  return {
    status: 200,
    body: {
      ruc,
      tieneInhabilitacionVigente: inhabResult.rows.some((r) => (r.estado ?? "").toUpperCase() === "VIGENTE"),
      inhabilitaciones: inhabResult.rows,
      multas: multaResult.rows,
    },
  };
}
