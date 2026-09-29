import type { NeonRow } from "../../db/neon-pool.js";
import type { ToolHandlerContext, HandlerResult } from "../registry.js";

interface EquipamientoRow extends NeonRow {
  id: number;
  anio: number;
  tipo_equipamiento: string;
  cantidad_comprada: number | string;
  monto_soles: number | string;
  proveedor: string;
  contrato_seace_id: string | null;
  contrato_url: string | null;
  observacion: string | null;
  ingestion_date: string;
}

interface ResumenRow extends NeonRow {
  tipo_equipamiento: string;
  total_contratos: number | string;
  monto_total: number | string;
}

interface ResumenAnualRow extends NeonRow {
  anio: number;
  total_contratos: number | string;
  monto_total: number | string;
}

/**
 * Handler para `seguridad_ciudadana_equipamiento` — GET /api/equipamiento.
 *
 * SQL idéntico a `apps/seguridad-ciudadana/api/src/routes/equipamiento.ts`. `total`
 * replica la ruta Express original: es `result.rows.length` (tamaño de página).
 */
export async function list(ctx: ToolHandlerContext): Promise<HandlerResult> {
  const { db, args } = ctx;
  const anioDesde = args.anio_desde !== undefined ? Number(args.anio_desde) : 2020;
  const anioHasta = args.anio_hasta !== undefined ? Number(args.anio_hasta) : 2026;
  const tipo = args.tipo as string | undefined;
  const limit = args.limit !== undefined ? Number(args.limit) : 100;
  const offset = args.offset !== undefined ? Number(args.offset) : 0;

  let query = `
    SELECT
      id,
      anio,
      tipo_equipamiento,
      cantidad_comprada,
      monto_soles,
      proveedor,
      contrato_seace_id,
      contrato_url,
      observacion,
      ingestion_date
    FROM pnp_equipamiento_seace
    WHERE anio BETWEEN $1 AND $2
  `;

  const params: unknown[] = [anioDesde, anioHasta];

  if (tipo) {
    query += ` AND tipo_equipamiento = $${params.length + 1}`;
    params.push(tipo);
  }

  query += ` ORDER BY anio DESC, monto_soles DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
  params.push(limit, offset);

  const { rows } = await db.query<EquipamientoRow>(query, params);

  let resumen: ResumenRow[] | null = null;
  if (!tipo) {
    const { rows: resumenRows } = await db.query<ResumenRow>(
      `
      SELECT
        tipo_equipamiento,
        SUM(cantidad_comprada) as total_contratos,
        SUM(monto_soles) as monto_total
      FROM pnp_equipamiento_seace
      WHERE anio BETWEEN $1 AND $2
      GROUP BY tipo_equipamiento
      ORDER BY monto_total DESC;
      `,
      [anioDesde, anioHasta],
    );
    resumen = resumenRows;
  }

  return {
    status: 200,
    body: {
      total: rows.length,
      limit,
      offset,
      resumen,
      equipamiento: rows,
    },
  };
}

/**
 * Handler para `seguridad_ciudadana_equipamiento_resumen` — GET /api/equipamiento/resumen.
 */
export async function resumen(ctx: ToolHandlerContext): Promise<HandlerResult> {
  const { db, args } = ctx;
  const anioDesde = args.anio_desde !== undefined ? Number(args.anio_desde) : 2020;
  const anioHasta = args.anio_hasta !== undefined ? Number(args.anio_hasta) : 2026;

  const { rows } = await db.query<ResumenAnualRow>(
    `
    SELECT
      anio,
      SUM(cantidad_comprada) as total_contratos,
      SUM(monto_soles) as monto_total
    FROM pnp_equipamiento_seace
    WHERE anio BETWEEN $1 AND $2
    GROUP BY anio
    ORDER BY anio DESC;
    `,
    [anioDesde, anioHasta],
  );

  return {
    status: 200,
    body: {
      periodo: { desde: anioDesde, hasta: anioHasta },
      resumen_anual: rows,
    },
  };
}
