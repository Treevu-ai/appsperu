import { Router } from "express";
import { z } from "zod";
import { pool } from "../db/pool.js";
import { asyncHandler } from "../lib/async-handler.js";
import { parseQuery } from "../lib/validate-query.js";

export const candidatosRouter = Router();

const DEFAULT_LIMIT = 200;
const MAX_LIMIT = 1000;

// El DNI se enmascara siempre en la respuesta pública — mismo criterio ya
// usado en `proveedores-sancionados/personas-sancionadas.ts` y
// `compras-publicas/conformacion.ts`. La decisión de no enmascarar a nivel
// de almacenamiento (ver migración 001_init.sql) es solo interna.
function maskDni(dni: string): string {
  return `${"*".repeat(dni.length - 3)}${dni.slice(-3)}`;
}

const CandidatosQuerySchema = z.object({
  dni: z.string().regex(/^\d{8}$/, "dni debe tener 8 dígitos").optional(),
  departamento: z.string().min(1).optional(),
  provincia: z.string().min(1).optional(),
  distrito: z.string().min(1).optional(),
  ubigeo: z
    .string()
    .regex(/^\d{6}$/, "ubigeo debe tener 6 dígitos")
    .optional(),
  cargo: z.string().min(1).optional(),
  organizacionPolitica: z.string().min(1).optional(),
  tipoEleccion: z.enum(["REGIONAL", "MUNICIPAL PROVINCIAL", "MUNICIPAL DISTRITAL"]).optional(),
  estado: z.string().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(MAX_LIMIT).default(DEFAULT_LIMIT),
  offset: z.coerce.number().int().min(0).default(0),
});

candidatosRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const parsed = parseQuery(CandidatosQuerySchema, req.query, res);
    if (!parsed) return;
    const { dni, departamento, provincia, distrito, ubigeo, cargo, organizacionPolitica, tipoEleccion, estado, limit, offset } = parsed;

    const conditions: string[] = [];
    const params: unknown[] = [];

    if (dni) {
      params.push(dni);
      conditions.push(`c.dni = $${params.length}`);
    }
    if (departamento) {
      params.push(departamento.toUpperCase());
      conditions.push(`c.departamento = $${params.length}`);
    }
    if (provincia) {
      params.push(provincia.toUpperCase());
      conditions.push(`c.provincia = $${params.length}`);
    }
    if (distrito) {
      params.push(distrito.toUpperCase());
      conditions.push(`c.distrito = $${params.length}`);
    }
    if (ubigeo) {
      params.push(ubigeo);
      conditions.push(`c.ubigeo = $${params.length}`);
    }
    if (cargo) {
      params.push(`%${cargo}%`);
      conditions.push(`c.cargo ILIKE $${params.length}`);
    }
    if (organizacionPolitica) {
      params.push(`%${organizacionPolitica}%`);
      conditions.push(`c.organizacion_politica ILIKE $${params.length}`);
    }
    if (tipoEleccion) {
      params.push(tipoEleccion);
      conditions.push(`c.tipo_eleccion = $${params.length}`);
    }
    if (estado) {
      params.push(estado.toUpperCase());
      conditions.push(`c.estado = $${params.length}`);
    }
    const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

    const { rows: countRows } = await pool.query<{ total: string }>(
      `SELECT COUNT(*) AS total FROM candidatos_erm c ${where}`,
      params
    );
    const total = Number(countRows[0].total);

    const { rows } = await pool.query(
      `SELECT c.dni, c.nombre_completo, c.cargo, c.tipo_eleccion, c.organizacion_politica,
              c.organizacion_estado, c.estado, c.ubigeo, c.departamento, c.provincia, c.distrito,
              c.posicion, c.sexo, c.edad, c.provincia_consejero, c.sentencias_declaradas, rb.fetched_at
       FROM candidatos_erm c
       JOIN raw_candidatos_erm_batches rb ON rb.id = c.source_batch_id
       ${where}
       ORDER BY c.departamento, c.provincia, c.distrito, c.cargo, c.posicion
       LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, limit, offset]
    );

    res.json({
      total,
      limit,
      offset,
      hasMore: offset + rows.length < total,
      resultados: rows.map((r) => ({
        dniEnmascarado: maskDni(r.dni),
        nombreCompleto: r.nombre_completo,
        cargo: r.cargo,
        tipoEleccion: r.tipo_eleccion,
        organizacionPolitica: r.organizacion_politica,
        organizacionEstado: r.organizacion_estado,
        estado: r.estado,
        ubigeo: r.ubigeo,
        departamento: r.departamento,
        provincia: r.provincia,
        distrito: r.distrito,
        posicion: r.posicion,
        sexo: r.sexo,
        edad: r.edad,
        provinciaConsejero: r.provincia_consejero,
        sentenciasDeclaradas: r.sentencias_declaradas,
        fuente: { dataset: "Candidatos ERM 2026 (derivado de hojas de vida JNE, vía Datapol)", extraidoEl: r.fetched_at },
      })),
    });
  })
);
