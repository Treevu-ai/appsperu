import { Router } from "express";
import { asyncHandler } from "../lib/async-handler.js";
import { parseQuery } from "../lib/validate-query.js";
import { RiesgoEUDRQuerySchema } from "../schema/riesgo-eudr.js";
import { getRiesgoEUDR } from "../services/riesgo-eudr.service.js";

export const riesgoEUDRRouter = Router();

riesgoEUDRRouter.get("/", asyncHandler(async (req, res) => {
  const query = parseQuery(RiesgoEUDRQuerySchema, req.query, res);
  if (!query) return;
  const results = await getRiesgoEUDR(query);
  res.json(results);
}));
