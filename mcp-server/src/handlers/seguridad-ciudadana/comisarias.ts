import type { NeonRow } from "../../db/neon-pool.js";
import type { ToolHandlerContext, HandlerResult } from "../registry.js";

interface ComisariaRow extends NeonRow {
  id: number;
  nombre: string;
  departamento: string;
  provincia: string;
  distrito: string;
  ubicacion_aprox: string | null;
  anio_auditoria: number | null;
  fuente_informe_id: string | null;
  fuente_informe_url: string | null;
  hallazgos: unknown;
  ultima_actualizacion: string;
}

/**
 * Handler para `seguridad_ciudadana_comisarias` — GET /api/comisarias.
 *
 * SQL idéntico a `apps/seguridad-ciudadana/api/src/routes/comisarias.ts`. `total`
 * replica el comportamiento de la ruta Express original: es `result.rows.length`
 * (el tamaño de la página, no un COUNT(*) real) — no se "corrige" acá porque el
 * SQL debe ser idéntico byte a byte.
 */
export async function list(ctx: ToolHandlerContext): Promise<HandlerResult> {
  const { db, args } = ctx;
  const departamento = (args.departamento as string | undefined) ?? "LIMA";
  const distrito = args.distrito as string | undefined;
  const severidad = args.severidad as string | undefined;
  const limit = args.limit !== undefined ? Number(args.limit) : 100;
  const offset = args.offset !== undefined ? Number(args.offset) : 0;

  let query = `
    SELECT
      id,
      nombre,
      departamento,
      provincia,
      distrito,
      ubicacion_aprox,
      anio_auditoria,
      fuente_informe_id,
      fuente_informe_url,
      hallazgos,
      ultima_actualizacion
    FROM comisarias_auditadas
    WHERE departamento = $1
  `;

  const params: unknown[] = [departamento];

  if (distrito) {
    query += ` AND distrito = $${params.length + 1}`;
    params.push(distrito);
  }

  if (severidad) {
    query += ` AND hallazgos @> $${params.length + 1}::jsonb`;
    params.push(JSON.stringify([{ severity: severidad }]));
  }

  query += ` ORDER BY ultima_actualizacion DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
  params.push(limit, offset);

  const { rows } = await db.query<ComisariaRow>(query, params);

  return {
    status: 200,
    body: {
      total: rows.length,
      limit,
      offset,
      comisarias: rows,
    },
  };
}

/**
 * Handler para `seguridad_ciudadana_comisaria_detalle` — GET /api/comisarias/{id}.
 */
export async function detalle(ctx: ToolHandlerContext): Promise<HandlerResult> {
  const { db, args } = ctx;
  const id = args.id as string;

  const { rows } = await db.query<ComisariaRow>(
    "SELECT * FROM comisarias_auditadas WHERE id = $1",
    [id],
  );

  if (rows.length === 0) {
    return { status: 404, body: { error: "Comisaría no encontrada" } };
  }

  return { status: 200, body: rows[0] };
}
