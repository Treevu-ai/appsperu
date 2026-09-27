import { Router } from "express";
import { asyncHandler } from "../lib/async-handler.js";
import { parseQuery } from "../lib/validate-query.js";
import { TitularesRiesgoQuerySchema } from "../schema/titulares-riesgo.js";
import { getTitularesConRiesgo } from "../services/titulares-riesgo.service.js";

export const titularesRiesgoRouter = Router();

titularesRiesgoRouter.get("/", asyncHandler(async (req, res) => {
  const query = parseQuery(TitularesRiesgoQuerySchema, req.query, res);
  if (!query) return;
  const results = await getTitularesConRiesgo(query);
  res.json(results);
}));
