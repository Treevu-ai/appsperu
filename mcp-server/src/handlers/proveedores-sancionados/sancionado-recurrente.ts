import type { NeonRow } from "../../db/neon-pool.js";
import type { ToolHandlerContext, HandlerResult } from "../registry.js";

interface RecurrenteRow extends NeonRow {
  ruc: string;
  razon_social: string;
  num_resoluciones: string;
  primera_resolucion: string;
  ultima_resolucion: string;
  ventana_dias: string;
  resoluciones: { resolucion: string; estado: string | null; desde: string | null; hasta: string | null }[];
}

/**
 * Handler para `proveedores_sancionados_recurrente` —
 * GET /api/crossref/sancionado-recurrente.
 *
 * Agrupa inhabilitaciones por RUC y marca los que tienen `minResoluciones` o
 * más resoluciones DISTINTAS cuyo rango completo (primera a última fecha
 * `desde`) cae dentro de `ventanaDias`. Es una preselección exploratoria, no
 * una conclusión de patrón de conducta: agrupa por cercanía temporal del rango
 * completo, no por proximidad par-a-par.
 */
export async function list(ctx: ToolHandlerContext): Promise<HandlerResult> {
  const { db, args } = ctx;
  const minResoluciones = args.minResoluciones !== undefined ? Number(args.minResoluciones) : 2;
  const ventanaDias = args.ventanaDias !== undefined ? Number(args.ventanaDias) : 180;

  const { rows } = await db.query<RecurrenteRow>(
    `SELECT ruc, MAX(razon_social) AS razon_social,
            COUNT(DISTINCT resolucion)::text AS num_resoluciones,
            MIN(desde)::text AS primera_resolucion,
            MAX(desde)::text AS ultima_resolucion,
            (MAX(desde) - MIN(desde))::text AS ventana_dias,
            jsonb_agg(jsonb_build_object('resolucion', resolucion, 'estado', estado, 'desde', desde, 'hasta', hasta) ORDER BY desde) AS resoluciones
       FROM inhabilitaciones
      WHERE desde IS NOT NULL
      GROUP BY ruc
     HAVING COUNT(DISTINCT resolucion) >= $1 AND (MAX(desde) - MIN(desde)) <= $2
      ORDER BY COUNT(DISTINCT resolucion) DESC, (MAX(desde) - MIN(desde)) ASC`,
    [minResoluciones, ventanaDias]
  );

  return {
    status: 200,
    body: {
      minResoluciones,
      ventanaDias,
      resultados: rows.map((r) => ({
        ruc: r.ruc,
        razonSocial: r.razon_social,
        numResoluciones: Number(r.num_resoluciones),
        primeraResolucion: r.primera_resolucion,
        ultimaResolucion: r.ultima_resolucion,
        ventanaDiasObservada: Number(r.ventana_dias),
        resoluciones: r.resoluciones,
        explicacion:
          `${r.num_resoluciones} resoluciones de inhabilitación distintas en ${r.ventana_dias} días. ` +
          "No determina un patrón de conducta ni una conclusión — requiere revisión humana.",
      })),
    },
  };
}
