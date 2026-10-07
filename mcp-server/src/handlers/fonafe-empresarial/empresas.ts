import type { NeonRow } from "../../db/neon-pool.js";
import type { ToolHandlerContext, HandlerResult } from "../registry.js";

interface EmpresaRow extends NeonRow {
  id: number;
  slug: string;
  codigo_interno: string;
  razon_social: string | null;
  sector: string | null;
}

/**
 * Handler para `fonafe_empresarial_empresas` — GET /api/empresas.
 * Origen: apps/fonafe-empresarial/api/src/routes/empresas.ts.
 */
export async function list(ctx: ToolHandlerContext): Promise<HandlerResult> {
  const { db, args } = ctx;
  const sector = args.sector as string | undefined;
  const slug = args.slug as string | undefined;
  const limit = args.limit ? Number(args.limit) : 50;
  const offset = args.offset ? Number(args.offset) : 0;

  const conditions: string[] = [];
  const params: unknown[] = [];
  if (sector) {
    params.push(`%${sector}%`);
    conditions.push(`sector ILIKE $${params.length}`);
  }
  if (slug) {
    params.push(slug);
    conditions.push(`slug = $${params.length}`);
  }
  const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

  const { rows: countRows } = await db.query<{ total: string }>(
    `SELECT COUNT(*) AS total FROM empresas_fonafe ${where}`,
    params
  );
  const total = Number(countRows[0].total);

  const { rows } = await db.query<EmpresaRow>(
    `SELECT id, slug, codigo_interno, razon_social, sector
     FROM empresas_fonafe
     ${where}
     ORDER BY sector, razon_social
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
        id: r.id,
        slug: r.slug,
        codigoInterno: r.codigo_interno,
        razonSocial: r.razon_social,
        sector: r.sector,
      })),
      fuente: { dataset: "FONAFE - Empresas de la Corporación" },
    },
  };
}
