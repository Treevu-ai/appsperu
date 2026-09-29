import type { NeonRow } from "../../db/neon-pool.js";
import type { ToolHandlerContext, HandlerResult } from "../registry.js";

interface CoberturaRow extends NeonRow {
  ubigeo: string;
  fecha_corte: string;
  cunamas_cuidado_diurno: number | string | null;
  cunamas_acompanamiento_familias: number | string | null;
  juntos_hogares_afiliados: number | string | null;
  juntos_hogares_abonados: number | string | null;
  foncodes_usuarios_estimados: number | string | null;
  qaliwarma_ninos_atendidos: number | string | null;
  qaliwarma_iiee: number | string | null;
  pension65_usuarios: number | string | null;
  contigo_usuarios: number | string | null;
  pais_tambos: number | string | null;
  pais_atenciones: number | string | null;
  pais_beneficiarios: number | string | null;
  updated_at: string;
}

/**
 * Handler para `programas_sociales_cobertura` — GET /api/cobertura.
 * Origen: apps/programas-sociales/api/src/routes/cobertura.ts. SQL idéntico
 * (incluye `SELECT DISTINCT ON (ubigeo) *` para quedarse con el corte más
 * reciente por distrito cuando no se filtra por `fechaCorte`).
 */
export async function list(ctx: ToolHandlerContext): Promise<HandlerResult> {
  const { db, args } = ctx;
  const ubigeo = args.ubigeo as string | undefined;
  const fechaCorte = args.fechaCorte as string | undefined;

  const conditions: string[] = [];
  const params: unknown[] = [];

  if (ubigeo) {
    params.push(ubigeo);
    conditions.push(`ubigeo = $${params.length}`);
  }
  if (fechaCorte) {
    params.push(fechaCorte);
    conditions.push(`fecha_corte = $${params.length}`);
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

  const { rows } = await db.query<CoberturaRow>(
    `SELECT DISTINCT ON (ubigeo) *
     FROM cobertura_social
     ${where}
     ORDER BY ubigeo, fecha_corte DESC
     LIMIT 2000`,
    params
  );

  return {
    status: 200,
    body: {
      cobertura: "INFOMIDIS es un registro nacional (MIDIS); no está acotado a La Libertad. Ya viene agregado por distrito — nunca a nivel de usuario individual.",
      resultados: rows.map((r) => ({
        ubigeo: r.ubigeo,
        fechaCorte: r.fecha_corte,
        cunamasCuidadoDiurno: r.cunamas_cuidado_diurno === null ? null : Number(r.cunamas_cuidado_diurno),
        cunamasAcompanamientoFamilias: r.cunamas_acompanamiento_familias === null ? null : Number(r.cunamas_acompanamiento_familias),
        juntosHogaresAfiliados: r.juntos_hogares_afiliados === null ? null : Number(r.juntos_hogares_afiliados),
        juntosHogaresAbonados: r.juntos_hogares_abonados === null ? null : Number(r.juntos_hogares_abonados),
        foncodesUsuariosEstimados: r.foncodes_usuarios_estimados === null ? null : Number(r.foncodes_usuarios_estimados),
        qaliwarmaNinosAtendidos: r.qaliwarma_ninos_atendidos === null ? null : Number(r.qaliwarma_ninos_atendidos),
        qaliwarmaIiee: r.qaliwarma_iiee === null ? null : Number(r.qaliwarma_iiee),
        pension65Usuarios: r.pension65_usuarios === null ? null : Number(r.pension65_usuarios),
        contigoUsuarios: r.contigo_usuarios === null ? null : Number(r.contigo_usuarios),
        paisTambos: r.pais_tambos === null ? null : Number(r.pais_tambos),
        paisAtenciones: r.pais_atenciones === null ? null : Number(r.pais_atenciones),
        paisBeneficiarios: r.pais_beneficiarios === null ? null : Number(r.pais_beneficiarios),
        actualizadoEl: r.updated_at,
      })),
    },
  };
}
