import type { NeonRow } from "../../db/neon-pool.js";
import type { ToolHandlerContext, HandlerResult } from "../registry.js";

interface ContribuyenteRow extends NeonRow {
  ruc: string;
  razon_social: string;
  estado_contribuyente: string;
  condicion_domicilio: string;
  ubigeo: string;
  tipo_via: string;
  nombre_via: string;
  numero: string;
}

interface CountRow extends NeonRow {
  total: string;
}

const DEFAULT_LIMIT = 200;
const MAX_LIMIT = 1000;

function buildConditions(args: Record<string, unknown>): { where: string; params: unknown[] } {
  const conditions: string[] = [];
  const params: unknown[] = [];

  const razonSocial = args.razonSocial as string | undefined;
  const estado = args.estado as string | undefined;
  const ubigeo = args.ubigeo as string | undefined;

  if (razonSocial) {
    params.push(`%${razonSocial.toUpperCase()}%`);
    conditions.push(`razon_social ILIKE $${params.length}`);
  }
  if (estado) {
    params.push(estado.toUpperCase());
    conditions.push(`estado_contribuyente = $${params.length}`);
  }
  if (ubigeo) {
    params.push(ubigeo);
    conditions.push(`ubigeo = $${params.length}`);
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
  return { where, params };
}

function mapRow(r: ContribuyenteRow) {
  return {
    ruc: r.ruc,
    razonSocial: r.razon_social,
    estadoContribuyente: r.estado_contribuyente,
    condicionDomicilio: r.condicion_domicilio,
    ubigeo: r.ubigeo,
    direccion: [r.tipo_via, r.nombre_via, r.numero].filter(Boolean).join(" ") || null,
  };
}

/**
 * Handler para `identidad_fiscal_contribuyentes` — GET /api/contribuyentes
 *
 * SQL idéntico a `apps/identidad-fiscal/api/src/routes/contribuyentes.ts`,
 * con placeholders `$n` de Postgres. Ver docs/adr/0024-neon-en-lugar-de-d1.md.
 */
export async function list(ctx: ToolHandlerContext): Promise<HandlerResult> {
  const { db, args } = ctx;

  const limit = Math.min(args.limit ? Number(args.limit) : DEFAULT_LIMIT, MAX_LIMIT);
  const offset = args.offset ? Number(args.offset) : 0;

  const { where, params } = buildConditions(args);

  const countResult = await db.query<CountRow>(
    `SELECT COUNT(*) AS total FROM contribuyentes ${where}`,
    params
  );
  const total = Number(countResult.rows[0]?.total ?? 0);

  const dataResult = await db.query<ContribuyenteRow>(
    `SELECT ruc, razon_social, estado_contribuyente, condicion_domicilio, ubigeo,
            tipo_via, nombre_via, numero
     FROM contribuyentes
     ${where}
     ORDER BY razon_social
     LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
    [...params, limit, offset]
  );
  const rows = dataResult.rows;

  return {
    status: 200,
    body: {
      total,
      limit,
      offset,
      hasMore: offset + rows.length < total,
      resultados: rows.map(mapRow),
    },
  };
}

/**
 * Handler para `identidad_fiscal_contribuyente_by_ruc` — GET /api/contribuyentes/{ruc}
 */
export async function byRuc(ctx: ToolHandlerContext): Promise<HandlerResult> {
  const { db, args } = ctx;
  const ruc = args.ruc as string;

  const { rows } = await db.query<ContribuyenteRow>(
    `SELECT ruc, razon_social, estado_contribuyente, condicion_domicilio, ubigeo,
            tipo_via, nombre_via, numero
     FROM contribuyentes WHERE ruc = $1`,
    [ruc]
  );

  if (rows.length === 0) {
    return { status: 404, body: { error: "RUC no encontrado en el padrón ingerido." } };
  }

  const r = rows[0];
  return {
    status: 200,
    body: mapRow(r),
  };
}