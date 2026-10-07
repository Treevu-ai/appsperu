import type { NeonRow } from "../../db/neon-pool.js";
import type { ToolHandlerContext, HandlerResult } from "../registry.js";

interface PresupuestoRow extends NeonRow {
  empresa_slug: string;
  razon_social: string | null;
  sector: string | null;
  anio_ejecucion: number | null;
  ultimo_mes_informado: string | null;
  rubro: string;
  presupuestado_anual: number | string | null;
  presupuesto_ultimo_mes: number | string | null;
  ejecucion_ultimo_mes: number | string | null;
}

function toNumber(v: number | string | null): number | null {
  return v === null ? null : Number(v);
}

/**
 * Handler para `fonafe_empresarial_presupuesto` — GET /api/presupuesto.
 * Origen: apps/fonafe-empresarial/api/src/routes/presupuesto.ts.
 */
export async function list(ctx: ToolHandlerContext): Promise<HandlerResult> {
  const { db, args } = ctx;
  const slug = args.slug as string | undefined;
  const sector = args.sector as string | undefined;
  const anio = args.anio !== undefined ? Number(args.anio) : undefined;
  const rubro = args.rubro as string | undefined;
  const limit = args.limit ? Number(args.limit) : 200;
  const offset = args.offset ? Number(args.offset) : 0;

  const conditions: string[] = [];
  const params: unknown[] = [];
  if (slug) {
    params.push(slug);
    conditions.push(`e.slug = $${params.length}`);
  }
  if (sector) {
    params.push(`%${sector}%`);
    conditions.push(`e.sector ILIKE $${params.length}`);
  }
  if (anio !== undefined) {
    params.push(anio);
    conditions.push(`p.anio_ejecucion = $${params.length}`);
  }
  if (rubro) {
    params.push(`%${rubro}%`);
    conditions.push(`p.rubro ILIKE $${params.length}`);
  }
  const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

  const { rows: countRows } = await db.query<{ total: string }>(
    `SELECT COUNT(*) AS total
     FROM presupuesto_empresarial p
     JOIN empresas_fonafe e ON e.id = p.empresa_id
     ${where}`,
    params
  );
  const total = Number(countRows[0].total);

  const { rows } = await db.query<PresupuestoRow>(
    `SELECT e.slug AS empresa_slug, e.razon_social, e.sector,
            p.anio_ejecucion, p.ultimo_mes_informado, p.rubro,
            p.presupuestado_anual, p.presupuesto_ultimo_mes, p.ejecucion_ultimo_mes
     FROM presupuesto_empresarial p
     JOIN empresas_fonafe e ON e.id = p.empresa_id
     ${where}
     ORDER BY e.sector, e.razon_social, p.rubro, p.anio_ejecucion DESC, p.id
     LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
    [...params, limit, offset]
  );

  return {
    status: 200,
    body: {
      total,
      limit,
      offset,
      hasMore: offset + rows.length < total,
      resultados: rows.map((r) => ({
        empresaSlug: r.empresa_slug,
        razonSocial: r.razon_social,
        sector: r.sector,
        anioEjecucion: r.anio_ejecucion,
        ultimoMesInformado: r.ultimo_mes_informado,
        rubro: r.rubro,
        presupuestadoAnual: toNumber(r.presupuestado_anual),
        presupuestoUltimoMes: toNumber(r.presupuesto_ultimo_mes),
        ejecucionUltimoMes: toNumber(r.ejecucion_ultimo_mes),
      })),
      fuente: { dataset: "FONAFE - Presupuesto Empresarial" },
    },
  };
}
