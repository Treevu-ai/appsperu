import { Router } from "express";
import { z } from "zod";
import { pool } from "../db/pool.js";
import { asyncHandler } from "../lib/async-handler.js";
import { parseQuery } from "../lib/validate-query.js";

export const empresasRouter = Router();

const EmpresasQuerySchema = z.object({
  ubigeo: z.string().min(1).optional(),
  anio: z.string().regex(/^\d{4}$/).optional(),
  mes: z.coerce.number().int().min(1).max(12).optional(),
});

empresasRouter.get("/", asyncHandler(async (req, res) => {
  const parsed = parseQuery(EmpresasQuerySchema, req.query, res);
  if (!parsed) return;
  const { ubigeo, anio, mes } = parsed;

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

  const { rows } = await pool.query(
    `SELECT ubigeo, distrito, anio, mes, numero_empresas, updated_at
     FROM empresas_privadas_distrito
     ${where}
     ORDER BY ubigeo, anio, mes
     LIMIT 5000`,
    params
  );

  res.json({
    cobertura: "MTPE (www2.trabajo.gob.pe, portal propio) es un registro nacional; no está acotado a La Libertad. La ingesta resuelve el año más reciente publicado en cada corrida (2014-2025 confirmado en vivo) — no asumir un año fijo, filtrar por `anio` si se necesita un corte específico.",
    resultados: rows.map((r) => ({
      ubigeo: r.ubigeo,
      distrito: r.distrito,
      anio: r.anio,
      mes: r.mes,
      numeroEmpresas: r.numero_empresas === null ? null : Number(r.numero_empresas),
      actualizadoEl: r.updated_at,
    })),
  });
}));
