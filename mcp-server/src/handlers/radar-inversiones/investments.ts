import type { NeonRow } from "../../db/neon-pool.js";
import type { ToolHandlerContext, HandlerResult } from "../registry.js";

interface InvestmentRow extends NeonRow {
  cui: string;
  codigo_snip: string | null;
  nombre: string;
  sec_ejec: string | null;
  nombre_uep: string | null;
  entidad: string | null;
  sector: string | null;
  nivel: string | null;
  estado: string | null;
  situacion: string | null;
  departamento: string | null;
  provincia: string | null;
  distrito: string | null;
  monto_viable: number | string | null;
  costo_actualizado: number | string | null;
  funcion: string | null;
  tipo_inversion: string | null;
  fecha_registro: string | null;
  fecha_viabilidad: string | null;
  num_habitantes_benef: number | string | null;
  avance_ejecucion: number | string | null;
  fecha_fin_ejecucion: string | null;
  fetched_at: string | null;
}

const MAX_LIMIT = 5000;
const DEFAULT_LIMIT = 1000;

/**
 * Handler para `radar_inversiones_investments` — GET /api/investments.
 *
 * SQL idéntico al de `apps/radar-inversiones/api/src/routes/investments.ts`.
 */
export async function list(ctx: ToolHandlerContext): Promise<HandlerResult> {
  const { db, args } = ctx;

  const departamento = args.departamento as string | undefined;
  const estado = args.estado as string | undefined;
  const situacion = args.situacion as string | undefined;
  const funcion = args.funcion as string | undefined;
  const limit = Math.min(args.limit ? Number(args.limit) : DEFAULT_LIMIT, MAX_LIMIT);
  const offset = args.offset ? Number(args.offset) : 0;

  const conditions: string[] = [];
  const params: unknown[] = [];

  if (departamento) {
    params.push(departamento.toUpperCase());
    conditions.push(`i.departamento = $${params.length}`);
  }
  if (estado) {
    params.push(estado);
    conditions.push(`i.estado = $${params.length}`);
  }
  if (situacion) {
    params.push(situacion);
    conditions.push(`i.situacion = $${params.length}`);
  }
  if (funcion) {
    params.push(funcion);
    conditions.push(`i.funcion = $${params.length}`);
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

  const countResult = await db.query<{ total: string }>(
    `SELECT COUNT(*) AS total FROM investments i ${where}`,
    params
  );
  const total = Number(countResult.rows[0].total);

  const { rows } = await db.query<InvestmentRow>(
    `SELECT i.cui, i.codigo_snip, i.nombre, i.sec_ejec, i.nombre_uep, i.entidad, i.sector,
            i.nivel, i.estado, i.situacion, i.departamento, i.provincia, i.distrito,
            i.monto_viable, i.costo_actualizado, i.funcion, i.tipo_inversion,
            i.fecha_registro, i.fecha_viabilidad, i.num_habitantes_benef, i.avance_ejecucion,
            i.fecha_fin_ejecucion, rb.fetched_at
     FROM investments i
     JOIN raw_investment_batches rb ON rb.id = i.source_batch_id
     ${where}
     ORDER BY i.costo_actualizado DESC NULLS LAST
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
        cui: r.cui,
        codigoSnip: r.codigo_snip,
        nombre: r.nombre,
        secEjec: r.sec_ejec,
        nombreUep: r.nombre_uep,
        entidad: r.entidad,
        sector: r.sector,
        nivel: r.nivel,
        estado: r.estado,
        situacion: r.situacion,
        departamento: r.departamento,
        provincia: r.provincia,
        distrito: r.distrito,
        montoViable: r.monto_viable === null ? null : Number(r.monto_viable),
        costoActualizado: r.costo_actualizado === null ? null : Number(r.costo_actualizado),
        funcion: r.funcion,
        tipoInversion: r.tipo_inversion,
        fechaRegistro: r.fecha_registro,
        fechaViabilidad: r.fecha_viabilidad,
        numHabitantesBenef: r.num_habitantes_benef === null ? null : Number(r.num_habitantes_benef),
        avanceEjecucion: r.avance_ejecucion === null ? null : Number(r.avance_ejecucion),
        fechaFinEjecucion: r.fecha_fin_ejecucion,
        fuente: { dataset: "MEF - Invierte.pe / Banco de Inversiones", extraidoEl: r.fetched_at },
      })),
    },
  };
}

/**
 * Handler para `radar_inversiones_investment_by_cui` — GET /api/investments/{cui}.
 */
export async function byCui(ctx: ToolHandlerContext): Promise<HandlerResult> {
  const { db, args } = ctx;
  const cui = args.cui as string;

  const { rows } = await db.query<InvestmentRow>(
    `SELECT i.*, rb.fetched_at
     FROM investments i
     JOIN raw_investment_batches rb ON rb.id = i.source_batch_id
     WHERE i.cui = $1`,
    [cui]
  );

  if (rows.length === 0) {
    return { status: 404, body: { error: "Inversión no encontrada en los datos ingeridos." } };
  }

  const r = rows[0];
  return {
    status: 200,
    body: {
      cui: r.cui,
      codigoSnip: r.codigo_snip,
      nombre: r.nombre,
      secEjec: r.sec_ejec,
      nombreUep: r.nombre_uep,
      entidad: r.entidad,
      sector: r.sector,
      nivel: r.nivel,
      estado: r.estado,
      situacion: r.situacion,
      departamento: r.departamento,
      provincia: r.provincia,
      distrito: r.distrito,
      montoViable: r.monto_viable === null ? null : Number(r.monto_viable),
      costoActualizado: r.costo_actualizado === null ? null : Number(r.costo_actualizado),
      funcion: r.funcion,
      tipoInversion: r.tipo_inversion,
      fechaRegistro: r.fecha_registro,
      fechaViabilidad: r.fecha_viabilidad,
      numHabitantesBenef: r.num_habitantes_benef === null ? null : Number(r.num_habitantes_benef),
      avanceEjecucion: r.avance_ejecucion === null ? null : Number(r.avance_ejecucion),
      fechaFinEjecucion: r.fecha_fin_ejecucion,
      fuente: { dataset: "MEF - Invierte.pe / Banco de Inversiones", extraidoEl: r.fetched_at },
    },
  };
}
