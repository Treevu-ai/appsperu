import { Router } from "express";
import { z } from "zod";
import { pool } from "../db/pool.js";
import { asyncHandler } from "../lib/async-handler.js";
import { parseQuery } from "../lib/validate-query.js";

export const cooperativasRouter = Router();

const DEFAULT_LIMIT = 200;
const MAX_LIMIT = 1000;

const SearchQuerySchema = z.object({
  razonSocial: z.string().min(1).optional(),
  cultivo: z.string().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(MAX_LIMIT).default(DEFAULT_LIMIT),
  offset: z.coerce.number().int().min(0).default(0),
});

/**
 * `cultivo` filtra por texto libre sobre `razon_social` (ILIKE) — PRODUCE no
 * expone una columna de tipo de cultivo/actividad específica por
 * cooperativa, así que no se deriva ni se guarda una categoría inventada;
 * el llamador decide el término ("cafe", "cacao", "banano", "mango", etc.).
 */
cooperativasRouter.get("/", asyncHandler(async (req, res) => {
  const parsed = parseQuery(SearchQuerySchema, req.query, res);
  if (!parsed) return;
  const { razonSocial, cultivo, limit, offset } = parsed;

  const conditions: string[] = [];
  const params: unknown[] = [];

  if (razonSocial) {
    params.push(`%${razonSocial.toUpperCase()}%`);
    conditions.push(`c.razon_social ILIKE $${params.length}`);
  }
  if (cultivo) {
    params.push(`%${cultivo.toUpperCase()}%`);
    conditions.push(`c.razon_social ILIKE $${params.length}`);
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

  const { rows: countRows } = await pool.query<{ total: string }>(
    `SELECT COUNT(*) AS total FROM cooperativas c ${where}`,
    params
  );
  const total = Number(countRows[0].total);

  const { rows } = await pool.query(
    `SELECT c.ruc, c.razon_social, c.representante, c.direccion, c.ubicacion_texto,
            c.socios, c.telefono, c.correo,
            t.estado_contribuyente, t.condicion_domicilio
     FROM cooperativas c
     LEFT JOIN contribuyentes t ON t.ruc = c.ruc
     ${where}
     ORDER BY c.razon_social
     LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
    [...params, limit, offset]
  );

  res.json({
    total,
    limit,
    offset,
    hasMore: offset + rows.length < total,
    resultados: rows.map((r) => ({
      ruc: r.ruc,
      razonSocial: r.razon_social,
      representante: r.representante,
      direccion: r.direccion,
      ubicacionTexto: r.ubicacion_texto,
      socios: r.socios,
      telefono: r.telefono,
      correo: r.correo,
      identidadTributaria: r.estado_contribuyente
        ? { estadoContribuyente: r.estado_contribuyente, condicionDomicilio: r.condicion_domicilio }
        : null,
    })),
  });
}));

cooperativasRouter.get("/:ruc", asyncHandler(async (req, res) => {
  const { rows } = await pool.query(
    `SELECT c.ruc, c.razon_social, c.representante, c.direccion, c.ubicacion_texto,
            c.socios, c.telefono, c.correo,
            t.estado_contribuyente, t.condicion_domicilio
     FROM cooperativas c
     LEFT JOIN contribuyentes t ON t.ruc = c.ruc
     WHERE c.ruc = $1`,
    [req.params.ruc]
  );

  if (rows.length === 0) {
    res.status(404).json({ error: "RUC no encontrado en el directorio de cooperativas ingerido." });
    return;
  }

  const r = rows[0];
  res.json({
    ruc: r.ruc,
    razonSocial: r.razon_social,
    representante: r.representante,
    direccion: r.direccion,
    ubicacionTexto: r.ubicacion_texto,
    socios: r.socios,
    telefono: r.telefono,
    correo: r.correo,
    identidadTributaria: r.estado_contribuyente
      ? { estadoContribuyente: r.estado_contribuyente, condicionDomicilio: r.condicion_domicilio }
      : null,
  });
}));
