import type { NeonRow } from "../../db/neon-pool.js";
import type { ToolHandlerContext, HandlerResult } from "../registry.js";

interface EmpresaRow extends NeonRow {
  ubigeo: string;
  distrito: string | null;
  anio: number;
  mes: number;
  numero_empresas: number | string | null;
  updated_at: string;
}

/**
 * Handler para `actividad_empresarial_empresas` — GET /api/empresas.
 * Origen: apps/actividad-empresarial/api/src/routes/empresas.ts. SQL idéntico.
 */
export async function list(ctx: ToolHandlerContext): Promise<HandlerResult> {
  const { db, args } = ctx;
  const ubigeo = args.ubigeo as string | undefined;
  const anio = args.anio as string | undefined;
  const mes = args.mes !== undefined ? Number(args.mes) : undefined;

  const conditions: string[] = [];
  const params: unknown[] = [];

  if (ubigeo) {
    params.push(ubigeo);
    conditions.push(`ubigeo = $${params.length}`);
  }
  if (anio) {
    params.push(Number(anio));
    conditions.push(`anio = $${params.length}`);
  }
  if (mes) {
    params.push(mes);
    conditions.push(`mes = $${params.length}`);
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

  const { rows } = await db.query<EmpresaRow>(
    `SELECT ubigeo, distrito, anio, mes, numero_empresas, updated_at
     FROM empresas_privadas_distrito
     ${where}
     ORDER BY ubigeo, anio, mes
     LIMIT 5000`,
    params
  );

  return {
    status: 200,
    body: {
      cobertura:
        "MTPE (www2.trabajo.gob.pe, portal propio) es un registro nacional; no está acotado a La Libertad. La ingesta resuelve el año más reciente publicado en cada corrida (2014-2025 confirmado en vivo) — no asumir un año fijo, filtrar por `anio` si se necesita un corte específico.",
      resultados: rows.map((r) => ({
        ubigeo: r.ubigeo,
        distrito: r.distrito,
        anio: r.anio,
        mes: r.mes,
        numeroEmpresas: r.numero_empresas === null ? null : Number(r.numero_empresas),
        actualizadoEl: r.updated_at,
      })),
    },
  };
}
