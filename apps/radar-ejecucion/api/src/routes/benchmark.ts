import { Router } from "express";
import { z } from "zod";
import { pool } from "../db/pool.js";
import { computeBenchmark, DEFAULT_COHORT_RULES } from "../cohorts/rules.js";
import { asyncHandler } from "../lib/async-handler.js";
import { parseQuery } from "../lib/validate-query.js";

export const benchmarkRouter = Router();

const BenchmarkQuerySchema = z.object({
  anio: z.string().regex(/^\d{4}$/, "debe ser un año de 4 dígitos").optional(),
});

benchmarkRouter.get("/:entityCode", asyncHandler(async (req, res) => {
  const parsed = parseQuery(BenchmarkQuerySchema, req.query, res);
  if (!parsed) return;
  const anio = parsed.anio ? Number(parsed.anio) : new Date().getFullYear();

  const { rows: entityRows } = await pool.query(
    `SELECT entity_code, nivel_gobierno FROM entities WHERE entity_code = $1`,
    [req.params.entityCode]
  );

  if (entityRows.length === 0) {
    res.status(404).json({ error: "Entidad no encontrada." });
    return;
  }

  const nivelGobierno = entityRows[0].nivel_gobierno;
  const rule = DEFAULT_COHORT_RULES.find((r) => r.nivelGobierno === nivelGobierno);

  if (!rule) {
    res.status(422).json({
      error: `No hay regla de cohorte definida para nivel_gobierno=${nivelGobierno}. No se publica benchmark sin regla explícita.`,
    });
    return;
  }

  const { rows: cohortRows } = await pool.query(
    `SELECT b.entity_code, b.pim, b.devengado
     FROM budget_execution b
     JOIN entities e ON e.entity_code = b.entity_code
     WHERE e.nivel_gobierno = $1 AND b.anio_fiscal = $2`,
    [nivelGobierno, anio]
  );

  const cohort = cohortRows.map((r) => ({
    entityCode: r.entity_code,
    pim: Number(r.pim),
    devengado: Number(r.devengado),
  }));

  const result = computeBenchmark(req.params.entityCode, cohort, rule);

  res.json({
    entityCode: req.params.entityCode,
    anioFiscal: anio,
    ...result,
    fechaCorte: new Date().toISOString().slice(0, 10),
  });
}));
