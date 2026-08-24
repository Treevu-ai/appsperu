import { Router } from "express";
import { z } from "zod";
import { pool } from "../db/pool.js";
import { asyncHandler } from "../lib/async-handler.js";
import { parseQuery } from "../lib/validate-query.js";

export const identitiesRouter = Router();

const Query = z.object({ identifier: z.string().min(1), soloVerificadas: z.enum(["true", "false"]).optional() });

identitiesRouter.get("/", asyncHandler(async (req, res) => {
  const parsed = parseQuery(Query, req.query, res); if (!parsed) return;
  const verified = parsed.soloVerificadas === "true";
  const { rows } = await pool.query(
    `SELECT * FROM entity_identity_links
      WHERE ($1 IN (subject_id, source_identifier_value, target_identifier_value))
        ${verified ? "AND strength IN ('EXACTA','VERIFICADA')" : ""}
      ORDER BY strength, created_at DESC`, [parsed.identifier]);
  res.json({ resultados: rows, limitation: "Una relación candidata no equivale a identidad confirmada. Solo las relaciones verificadas pueden alimentar cruces automáticos." });
}));
