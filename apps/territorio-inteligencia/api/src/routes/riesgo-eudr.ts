import { Router } from "express";
import { asyncHandler } from "../lib/async-handler.js";
import { parseQuery } from "../lib/validate-query.js";
import { RiesgoEUDRQuerySchema } from "../schema/riesgo-eudr.js";
import { getRiesgoEUDR, RiesgoEUDRNoDisponibleError } from "../services/riesgo-eudr.service.js";

export const riesgoEUDRRouter = Router();

riesgoEUDRRouter.get("/", asyncHandler(async (req, res) => {
  const query = parseQuery(RiesgoEUDRQuerySchema, req.query, res);
  if (!query) return;

  try {
    const results = await getRiesgoEUDR(query);
    res.json(results);
  } catch (e) {
    // 503 y no 200 con `[]`: un 200 vacío es indistinguible de "no hay riesgo
    // en ese título", que es justo la conclusión que este cruce no puede
    // soportar todavía. Ver la nota en riesgo-eudr.service.ts.
    if (e instanceof RiesgoEUDRNoDisponibleError) {
      res.status(503).json({ error: e.code, detalle: e.message });
      return;
    }
    throw e;
  }
}));
