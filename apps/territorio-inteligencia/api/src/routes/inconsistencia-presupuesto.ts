import { Router } from "express";
import { asyncHandler } from "../lib/async-handler.js";
import { parseQuery } from "../lib/validate-query.js";
import { InconsistenciaPresupuestoQuerySchema } from "../schema/inconsistencia-presupuesto.js";
import { getInconsistenciasPresupuestales } from "../services/inconsistencia-presupuesto.service.js";

export const inconsistenciaPresupuestoRouter = Router();

inconsistenciaPresupuestoRouter.get("/", asyncHandler(async (req, res) => {
  const query = parseQuery(InconsistenciaPresupuestoQuerySchema, req.query, res);
  if (!query) return;
  const results = await getInconsistenciasPresupuestales(query);
  res.json(results);
}));
