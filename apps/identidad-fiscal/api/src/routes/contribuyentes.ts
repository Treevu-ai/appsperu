import { Router } from "express";
import { z } from "zod";
import { pool } from "../db/pool.js";
import { asyncHandler } from "../lib/async-handler.js";
import { parseQuery } from "../lib/validate-query.js";

export const contribuyentesRouter = Router();

const SearchQuerySchema = z.object({
  razonSocial: z.string().min(1).optional(),
  estado: z.string().min(1).optional(),
  ubigeo: z.string().min(1).optional(),
});

contribuyentesRouter.get("/", asyncHandler(async (req, res) => {
  const parsed = parseQuery(SearchQuerySchema, req.query, res);
  if (!parsed) return;
  const { razonSocial, estado, ubigeo } = parsed;

  const conditions: string[] = [];
  const params: unknown[] = [];

  if (razonSocial) {
    params.push(`%${razonSocial.toUpperCase()}%`);
    conditions.push(`razon_social ILIKE $${params.length}`);
  }
  if (estado) {
    params.push(estado.toUpperCase());
    conditions.push(`estado_contribuyente = $${params.length}`);
  }
  if (ubigeo) {
    params.push(ubigeo);
    conditions.push(`ubigeo = $${params.length}`);
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

  const { rows } = await pool.query(
    `SELECT ruc, razon_social, estado_contribuyente, condicion_domicilio, ubigeo,
            tipo_via, nombre_via, numero
     FROM contribuyentes
     ${where}
     ORDER BY razon_social
     LIMIT 200`,
    params
  );

  res.json({
    resultados: rows.map((r) => ({
      ruc: r.ruc,
      razonSocial: r.razon_social,
      estadoContribuyente: r.estado_contribuyente,
      condicionDomicilio: r.condicion_domicilio,
      ubigeo: r.ubigeo,
      direccion: [r.tipo_via, r.nombre_via, r.numero].filter(Boolean).join(" ") || null,
    })),
  });
}));

contribuyentesRouter.get("/:ruc", asyncHandler(async (req, res) => {
  const { rows } = await pool.query(
    `SELECT ruc, razon_social, estado_contribuyente, condicion_domicilio, ubigeo,
            tipo_via, nombre_via, numero
     FROM contribuyentes WHERE ruc = $1`,
    [req.params.ruc]
  );

  if (rows.length === 0) {
    res.status(404).json({ error: "RUC no encontrado en el padrón ingerido." });
    return;
  }

  const r = rows[0];
  res.json({
    ruc: r.ruc,
    razonSocial: r.razon_social,
    estadoContribuyente: r.estado_contribuyente,
    condicionDomicilio: r.condicion_domicilio,
    ubigeo: r.ubigeo,
    direccion: [r.tipo_via, r.nombre_via, r.numero].filter(Boolean).join(" ") || null,
  });
}));
