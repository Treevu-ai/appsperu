import { Router } from "express";
import { z } from "zod";
import { pool } from "../db/pool.js";
import { asyncHandler } from "../lib/async-handler.js";
import { parseQuery } from "../lib/validate-query.js";

export const oeceFichaRouter = Router();

const DEFAULT_LIMIT = 200;
const MAX_LIMIT = 1000;

const SearchQuerySchema = z.object({
  razonSocial: z.string().min(1).optional(),
  departamento: z.string().min(1).optional(),
  inscritoRnp: z.enum(["true", "false"]).optional().describe("true = codigo_registro no nulo (inscrito realmente en el RNP)."),
  limit: z.coerce.number().int().min(1).max(MAX_LIMIT).default(DEFAULT_LIMIT),
  offset: z.coerce.number().int().min(0).default(0),
});

oeceFichaRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const parsed = parseQuery(SearchQuerySchema, req.query, res);
    if (!parsed) return;
    const { razonSocial, departamento, inscritoRnp, limit, offset } = parsed;

    const conditions: string[] = [];
    const params: unknown[] = [];

    if (razonSocial) {
      params.push(`%${razonSocial.toUpperCase()}%`);
      conditions.push(`razon_social ILIKE $${params.length}`);
    }
    if (departamento) {
      params.push(departamento.toUpperCase());
      conditions.push(`departamento = $${params.length}`);
    }
    if (inscritoRnp === "true") {
      conditions.push(`codigo_registro IS NOT NULL`);
    } else if (inscritoRnp === "false") {
      conditions.push(`codigo_registro IS NULL`);
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

    const { rows: countRows } = await pool.query<{ total: string }>(
      `SELECT COUNT(*) AS total FROM ruc_oece_ficha ${where}`,
      params
    );
    const total = Number(countRows[0].total);

    const { rows } = await pool.query(
      `SELECT ruc, razon_social, tipo_empresa, estado_sunat, condicion_sunat, departamento, provincia,
              distrito, telefono, email, codigo_registro, fecha_consulta
       FROM ruc_oece_ficha ${where}
       ORDER BY razon_social
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
        tipoEmpresa: r.tipo_empresa,
        estadoSunat: r.estado_sunat,
        condicionSunat: r.condicion_sunat,
        departamento: r.departamento,
        provincia: r.provincia,
        distrito: r.distrito,
        telefono: r.telefono,
        email: r.email,
        codigoRegistro: r.codigo_registro,
        inscritoRnp: r.codigo_registro !== null,
        fechaConsulta: r.fecha_consulta,
      })),
    });
  })
);

oeceFichaRouter.get(
  "/:ruc",
  asyncHandler(async (req, res) => {
    const { ruc } = req.params;

    const { rows } = await pool.query(
      `SELECT ruc, razon_social, tipo_empresa, estado_sunat, condicion_sunat, departamento, provincia,
              distrito, telefono, email, codigo_registro, fecha_consulta
       FROM ruc_oece_ficha WHERE ruc = $1`,
      [ruc]
    );
    if (rows.length === 0) {
      res.status(404).json({ error: "RUC no consultado todavía contra la Ficha de Proveedor de OECE." });
      return;
    }

    const { rows: personas } = await pool.query(
      `SELECT rol, source_id, dni, nombre, tipo_organo, cargo, fecha_ingreso
       FROM ruc_oece_personas WHERE ruc = $1
       ORDER BY rol, source_id`,
      [ruc]
    );

    const r = rows[0];
    res.json({
      ruc: r.ruc,
      razonSocial: r.razon_social,
      tipoEmpresa: r.tipo_empresa,
      estadoSunat: r.estado_sunat,
      condicionSunat: r.condicion_sunat,
      departamento: r.departamento,
      provincia: r.provincia,
      distrito: r.distrito,
      telefono: r.telefono,
      email: r.email,
      codigoRegistro: r.codigo_registro,
      inscritoRnp: r.codigo_registro !== null,
      fechaConsulta: r.fecha_consulta,
      personas: personas.map((p) => ({
        rol: p.rol,
        sourceId: Number(p.source_id),
        dni: p.dni,
        nombre: p.nombre,
        tipoOrgano: p.tipo_organo,
        cargo: p.cargo,
        fechaIngreso: p.fecha_ingreso,
      })),
    });
  })
);
