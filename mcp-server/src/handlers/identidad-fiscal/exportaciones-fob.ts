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

/** Dimensiones de agregación de `groupBy`: [código, nombre] en ruc_exportaciones_fob. */
const GROUP_BY_DIMS: Record<string, [string, string]> = {
  aduana: ["aduana_codigo", "aduana_nombre"],
  pais: ["pais_codigo", "pais_nombre"],
  agente: ["agente_codigo", "agente_nombre"],
};

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
  const groupBy = args.groupBy as string | undefined;

  if (groupBy && !(groupBy in GROUP_BY_DIMS)) {
    return {
      status: 400,
      body: { error: `groupBy inválido (${groupBy}): valores posibles aduana, pais, agente.` },
    };
  }

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

  // Vía de agregación: una fila por dimensión con FOB total y nº de embarques,
  // en lugar de las filas individuales de embarque. Los filtros del where
  // aplican igual; la paginación opera sobre los grupos.
  if (groupBy) {
    const [colCodigo, colNombre] = GROUP_BY_DIMS[groupBy];
    const groupCountResult = await db.query<CountRow>(
      `SELECT COUNT(*) AS total FROM (SELECT 1 FROM ruc_exportaciones_fob ${where} GROUP BY ${colCodigo}, ${colNombre}) AS grupos`,
      params
    );
    const total = Number(groupCountResult.rows[0]?.total ?? 0);

    const groupDataResult = await db.query<NeonRow>(
      `SELECT ${colCodigo} AS codigo, ${colNombre} AS nombre, SUM(fob_usd)::numeric(14,2) AS fob_usd,
              COUNT(*) AS filas
       FROM ruc_exportaciones_fob
       ${where}
       GROUP BY ${colCodigo}, ${colNombre}
       ORDER BY SUM(fob_usd) DESC
       LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, limit, offset]
    );
    const groupRows = groupDataResult.rows;

    return {
      status: 200,
      body: {
        groupBy,
        total,
        limit,
        offset,
        hasMore: offset + groupRows.length < total,
        resultados: groupRows.map((r) => ({
          codigo: r.codigo,
          nombre: r.nombre,
          fobUsd: Number(r.fob_usd),
          filas: Number(r.filas),
        })),
      },
    };
  }

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