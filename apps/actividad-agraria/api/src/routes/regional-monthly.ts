import { Router } from "express";
import { z } from "zod";
import { pool } from "../db/pool.js";
import { asyncHandler } from "../lib/async-handler.js";
import { parseQuery } from "../lib/validate-query.js";

const QuerySchema = z.object({
  departamento: z.string().min(1).optional(),
  anio: z
    .string()
    .regex(/^\d{4}$/, "anio debe ser un año de 4 dígitos")
    .optional(),
});

export function createRegionalMonthlyRouter(tableName: string) {
  const router = Router();

  router.get(
    "/",
    asyncHandler(async (req, res) => {
      const parsed = parseQuery(QuerySchema, req.query, res);
      if (!parsed) return;

      const conditions: string[] = [];
      const values: unknown[] = [];

      if (parsed.departamento) {
        values.push(parsed.departamento.toUpperCase());
        conditions.push(`departamento = $${values.length}`);
      }
      if (parsed.anio) {
        values.push(Number(parsed.anio));
        conditions.push(`anio = $${values.length}`);
      }

      const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

      const { rows } = await pool.query(
        `SELECT departamento, anio, mes, valor_soles
         FROM ${tableName}
         ${where}
         ORDER BY departamento, anio, mes`,
        values
      );

      res.json({ resultados: rows });
    })
  );

  return router;
}
