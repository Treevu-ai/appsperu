import type { NeonRow } from "../../db/neon-pool.js";
import type { ToolHandlerContext, HandlerResult } from "../registry.js";

interface CountRow extends NeonRow {
  total: string;
}

interface PadronRow extends NeonRow {
  ruc: string;
  registrado: boolean;
  nombre_ppa: string;
  fecha_consulta: string;
}

const DEFAULT_LIMIT = 200;
const MAX_LIMIT = 1000;

/**
 * Handler para `identidad_fiscal_padron_ppa` — GET /api/padron-ppa
 *
 * SQL idéntico a `apps/identidad-fiscal/api/src/routes/padron-ppa.ts`.
 * Ver docs/adr/0024-neon-en-lugar-de-d1.md.
 */
export async function list(ctx: ToolHandlerContext): Promise<HandlerResult> {
  const { db, args } = ctx;

  const limit = Math.min(args.limit ? Number(args.limit) : DEFAULT_LIMIT, MAX_LIMIT);
  const offset = args.offset ? Number(args.offset) : 0;

  const conditions: string[] = [];
  const params: unknown[] = [];

  const registrado = args.registrado as string | undefined;
  if (registrado !== undefined) {
    params.push(registrado === "true");
    conditions.push(`registrado = $${params.length}`);
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

  const countResult = await db.query<CountRow>(
    `SELECT COUNT(*) AS total FROM ruc_padron_ppa ${where}`,
    params
  );
  const total = Number(countResult.rows[0]?.total ?? 0);

  const dataResult = await db.query<PadronRow>(
    `SELECT ruc, registrado, nombre_ppa, fecha_consulta FROM ruc_padron_ppa ${where}
     ORDER BY ruc
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
      resultados: rows.map((r) => ({
        ruc: r.ruc,
        registrado: r.registrado,
        nombrePpa: r.nombre_ppa,
        fechaConsulta: r.fecha_consulta,
      })),
    },
  };
}

/**
 * Handler para `identidad_fiscal_padron_ppa_by_ruc` — GET /api/padron-ppa/{ruc}
 */
export async function byRuc(ctx: ToolHandlerContext): Promise<HandlerResult> {
  const { db, args } = ctx;
  const ruc = args.ruc as string;

  const { rows } = await db.query<PadronRow>(
    `SELECT ruc, registrado, nombre_ppa, fecha_consulta FROM ruc_padron_ppa WHERE ruc = $1`,
    [ruc]
  );
  if (rows.length === 0) {
    return {
      status: 404,
      body: { error: "RUC no consultado todavía contra el Padrón de Productores Agrarios." },
    };
  }
  const r = rows[0];
  return {
    status: 200,
    body: { ruc: r.ruc, registrado: r.registrado, nombrePpa: r.nombre_ppa, fechaConsulta: r.fecha_consulta },
  };
}