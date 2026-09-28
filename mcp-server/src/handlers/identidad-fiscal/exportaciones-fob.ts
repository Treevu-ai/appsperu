import type { NeonRow } from "../../db/neon-pool.js";
import type { ToolHandlerContext, HandlerResult } from "../registry.js";

interface CountRow extends NeonRow {
  total: string;
}

interface FobRow extends NeonRow {
  ruc: string;
  anio: number;
  mes: number;
  aduana_codigo: string;
  aduana_nombre: string;
  agente_codigo: string;
  agente_nombre: string;
  pais_codigo: string;
  pais_nombre: string;
  fob_usd: number;
  fecha_consulta: string;
}

const DEFAULT_LIMIT = 200;
const MAX_LIMIT = 1000;

/**
 * Handler para `identidad_fiscal_exportaciones_fob` — GET /api/exportaciones-fob
 *
 * SQL idéntico a `apps/identidad-fiscal/api/src/routes/exportaciones-fob.ts`.
 * Ver docs/adr/0024-neon-en-lugar-de-d1.md.
 */
export async function list(ctx: ToolHandlerContext): Promise<HandlerResult> {
  const { db, args } = ctx;

  const limit = Math.min(args.limit ? Number(args.limit) : DEFAULT_LIMIT, MAX_LIMIT);
  const offset = args.offset ? Number(args.offset) : 0;

  const conditions: string[] = [];
  const params: unknown[] = [];

  const ruc = args.ruc as string | undefined;
  const anio = args.anio as number | undefined;
  const mes = args.mes as number | undefined;
  const paisCodigo = args.paisCodigo as string | undefined;

  if (ruc) {
    params.push(ruc);
    conditions.push(`ruc = $${params.length}`);
  }
  if (anio) {
    params.push(anio);
    conditions.push(`anio = $${params.length}`);
  }
  if (mes) {
    params.push(mes);
    conditions.push(`mes = $${params.length}`);
  }
  if (paisCodigo) {
    params.push(paisCodigo.toUpperCase());
    conditions.push(`pais_codigo = $${params.length}`);
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

  const countResult = await db.query<CountRow>(
    `SELECT COUNT(*) AS total FROM ruc_exportaciones_fob ${where}`,
    params
  );
  const total = Number(countResult.rows[0]?.total ?? 0);

  const dataResult = await db.query<FobRow>(
    `SELECT ruc, anio, mes, aduana_codigo, aduana_nombre, agente_codigo, agente_nombre,
            pais_codigo, pais_nombre, fob_usd, fecha_consulta
     FROM ruc_exportaciones_fob
     ${where}
     ORDER BY anio DESC, mes DESC, fob_usd DESC
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
        anio: r.anio,
        mes: r.mes,
        aduanaCodigo: r.aduana_codigo,
        aduanaNombre: r.aduana_nombre,
        agenteCodigo: r.agente_codigo,
        agenteNombre: r.agente_nombre,
        paisCodigo: r.pais_codigo,
        paisNombre: r.pais_nombre,
        fobUsd: Number(r.fob_usd),
        fechaConsulta: r.fecha_consulta,
      })),
    },
  };
}

/**
 * Handler para `identidad_fiscal_exportaciones_fob_resumen` — GET /api/exportaciones-fob/resumen/{ruc}
 */
export async function resumenPorRuc(ctx: ToolHandlerContext): Promise<HandlerResult> {
  const { db, args } = ctx;
  const ruc = args.ruc as string;
  const anio = args.anio as number | undefined;

  const conditions = ["ruc = $1"];
  const params: unknown[] = [ruc];
  if (anio) {
    params.push(anio);
    conditions.push(`anio = $${params.length}`);
  }

  const { rows } = await db.query<NeonRow>(
    `SELECT anio, SUM(fob_usd)::numeric(14,2) AS fob_total, COUNT(*) AS embarques
     FROM ruc_exportaciones_fob
     WHERE ${conditions.join(" AND ")}
     GROUP BY anio
     ORDER BY anio DESC`,
    params
  );

  if (rows.length === 0) {
    return {
      status: 404,
      body: { error: "Sin exportaciones registradas para ese RUC en el periodo pedido." },
    };
  }

  return {
    status: 200,
    body: {
      ruc,
      porAnio: rows.map((r) => ({
        anio: r.anio,
        fobTotalUsd: Number(r.fob_total),
        embarques: Number(r.embarques),
      })),
    },
  };
}