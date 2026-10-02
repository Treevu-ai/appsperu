import type { NeonRow } from "../../db/neon-pool.js";
import type { ToolHandlerContext, HandlerResult } from "../registry.js";

interface DenunciaRow extends NeonRow {
  departamento: string;
  provincia: string;
  distrito: string;
  ubigeo: string;
  anio: number;
  mes: number;
  modalidad: string;
  cantidad: number | string;
}

/**
 * Handler para `seguridad_ciudadana_denuncias` — GET /api/denuncias.
 *
 * SQL idéntico a `apps/seguridad-ciudadana/api/src/routes/denuncias.ts`.
 */
export async function list(ctx: ToolHandlerContext): Promise<HandlerResult> {
  const { db, args } = ctx;
  const departamento = args.departamento as string | undefined;
  const provincia = args.provincia as string | undefined;
  const ubigeo = args.ubigeo as string | undefined;
  const anio = args.anio as string | undefined;
  const modalidad = args.modalidad as string | undefined;

  const conditions: string[] = [];
  const values: unknown[] = [];

  if (departamento) {
    values.push(departamento.toUpperCase());
    conditions.push(`departamento = $${values.length}`);
  }
  if (provincia) {
    values.push(provincia.toUpperCase());
    conditions.push(`provincia = $${values.length}`);
  }
  if (ubigeo) {
    values.push(ubigeo);
    conditions.push(`ubigeo = $${values.length}`);
  }
  if (anio) {
    values.push(Number(anio));
    conditions.push(`anio = $${values.length}`);
  }
  if (modalidad) {
    values.push(modalidad);
    conditions.push(`modalidad = $${values.length}`);
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

  const { rows } = await db.query<DenunciaRow>(
    `SELECT departamento, provincia, distrito, ubigeo, anio, mes, modalidad, cantidad
     FROM police_reports
     ${where}
     ORDER BY departamento, provincia, distrito, anio, mes, modalidad`,
    values,
  );

  return { status: 200, body: { resultados: rows } };
}
