import { Router } from "express";
import { z } from "zod";
import { pool } from "../db/pool.js";
import { asyncHandler } from "../lib/async-handler.js";
import { parseQuery } from "../lib/validate-query.js";

export const coberturaRouter = Router();

const CoberturaQuerySchema = z.object({
  ubigeo: z.string().min(1).optional(),
  fechaCorte: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "debe tener formato YYYY-MM-DD").optional(),
});

coberturaRouter.get("/", asyncHandler(async (req, res) => {
  const parsed = parseQuery(CoberturaQuerySchema, req.query, res);
  if (!parsed) return;
  const { ubigeo, fechaCorte } = parsed;

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

  // Sin filtro de fecha, solo el corte más reciente por distrito — evita que
  // un distrito aparezca duplicado por cada mes histórico ingerido.
  const { rows } = await pool.query(
    `SELECT DISTINCT ON (ubigeo) *
     FROM cobertura_social
     ${where}
     ORDER BY ubigeo, fecha_corte DESC
     LIMIT 2000`,
    params
  );

  res.json({
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
  });
}));
