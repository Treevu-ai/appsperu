import { Router } from "express";
import { asyncHandler } from "../lib/async-handler.js";
import { parseQuery } from "../lib/validate-query.js";
import { CapturaTerritorioQuerySchema } from "../schema/captura-territorio.js";
import { getCapturaTerritorio } from "../services/captura-territorio.service.js";

export const capturaTerritorioRouter = Router();

capturaTerritorioRouter.get("/", asyncHandler(async (req, res) => {
  const query = parseQuery(CapturaTerritorioQuerySchema, req.query, res);
  if (!query) return;
  const results = await getCapturaTerritorio(query);
  res.json(results);
}));
