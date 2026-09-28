import type { NeonRow } from "../../db/neon-pool.js";
import type { ToolHandlerContext, HandlerResult } from "../registry.js";

interface BienMuebleBajaRow extends NeonRow {
  ruc_entidad: string;
  nom_entidad: string;
  nro_resolucion_baja: string | null;
  fecha_resolucion_baja: string | null;
  nom_acto_baja: string | null;
  codigo_patrimonial: string | null;
  denominacion_bien: string;
  ejercicio: number;
}

/**
 * Handler para `radar_ejecucion_bienes_muebles_baja` — GET /api/patrimonio/bienes-muebles-baja.
 *
 * Sin ubigeo en la fuente — filtra por texto sobre NOM_ENTIDAD.
 */
export async function list(ctx: ToolHandlerContext): Promise<HandlerResult> {
  const { db, args } = ctx;

  const entidad = args.entidad as string | undefined;
  const ejercicio = args.ejercicio as string | undefined;

  const conditions: string[] = [];
  const params: unknown[] = [];

  if (entidad) {
    params.push(`%${entidad}%`);
    conditions.push(`nom_entidad ILIKE $${params.length}`);
  }
  if (ejercicio) {
    params.push(Number(ejercicio));
    conditions.push(`ejercicio = $${params.length}`);
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

  const { rows } = await db.query<BienMuebleBajaRow>(
    `SELECT ruc_entidad, nom_entidad, nro_resolucion_baja, fecha_resolucion_baja,
            nom_acto_baja, codigo_patrimonial, denominacion_bien, ejercicio
     FROM bienes_muebles_baja
     ${where}
     ORDER BY fecha_resolucion_baja DESC NULLS LAST
     LIMIT 500`,
    params
  );

  return {
    status: 200,
    body: {
      filtros: { entidad, ejercicio: ejercicio ? Number(ejercicio) : null },
      registros: rows.map((r) => ({
        rucEntidad: r.ruc_entidad,
        nomEntidad: r.nom_entidad,
        nroResolucionBaja: r.nro_resolucion_baja,
        fechaResolucionBaja: r.fecha_resolucion_baja,
        nomActoBaja: r.nom_acto_baja,
        codigoPatrimonial: r.codigo_patrimonial,
        denominacionBien: r.denominacion_bien,
        ejercicio: r.ejercicio,
      })),
      limitacion: "Solo activos dados de baja (desincorporados) — no es el inventario completo de bienes muebles del Estado, que no tiene fuente pública estructurada conocida.",
      fuente: { dataset: "MEF — Bienes muebles patrimoniales dados de baja (Plataforma Nacional de Datos Abiertos)" },
    },
  };
}