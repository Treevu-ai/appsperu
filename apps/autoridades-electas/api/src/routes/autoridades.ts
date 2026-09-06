import { Router } from "express";
import { z } from "zod";
import { pool } from "../db/pool.js";
import { asyncHandler } from "../lib/async-handler.js";
import { parseQuery } from "../lib/validate-query.js";

export const autoridadesRouter = Router();

const AutoridadesQuerySchema = z.object({
  nombre: z.string().min(1).optional().describe("Búsqueda parcial (ILIKE) sobre nombres + apellidos."),
  cargo: z.string().min(1).optional(),
  organizacionPolitica: z.string().min(1).optional(),
  ubigeo: z
    .string()
    .regex(/^\d{6}$/, "ubigeo debe tener 6 dígitos")
    .optional(),
  anioEleccion: z.coerce.number().int().min(2000).max(2100).optional(),
});

autoridadesRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const parsed = parseQuery(AutoridadesQuerySchema, req.query, res);
    if (!parsed) return;
    const { nombre, cargo, organizacionPolitica, ubigeo, anioEleccion } = parsed;

    const conditions: string[] = [];
    const params: unknown[] = [];
    if (nombre) {
      params.push(`%${nombre}%`);
      conditions.push(
        `(a.nombres || ' ' || a.apellido_paterno || ' ' || COALESCE(a.apellido_materno, '')) ILIKE $${params.length}`
      );
    }
    if (cargo) {
      params.push(`%${cargo}%`);
      conditions.push(`a.cargo ILIKE $${params.length}`);
    }
    if (organizacionPolitica) {
      params.push(`%${organizacionPolitica}%`);
      conditions.push(`a.organizacion_politica ILIKE $${params.length}`);
    }
    if (ubigeo) {
      params.push(ubigeo);
      conditions.push(`a.ubigeo = $${params.length}`);
    }
    if (anioEleccion) {
      params.push(anioEleccion);
      conditions.push(`a.anio_eleccion = $${params.length}`);
    }
    const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

    const { rows } = await pool.query(
      `SELECT a.nombres, a.apellido_paterno, a.apellido_materno, a.organizacion_politica, a.cargo,
              a.region, a.provincia, a.distrito, a.ubigeo, a.fecha_inicio_vigencia, a.fecha_fin_vigencia,
              a.proceso_electoral, a.anio_eleccion, a.ambito, a.genero, a.edad, a.periodo, rb.fetched_at
       FROM autoridades_electas a
       JOIN raw_autoridades_electas_batches rb ON rb.id = a.source_batch_id
       ${where}
       ORDER BY a.anio_eleccion DESC, a.apellido_paterno
       LIMIT 200`,
      params
    );

    res.json({
      resultados: rows.map((r) => ({
        nombreCompleto: [r.nombres, r.apellido_paterno, r.apellido_materno].filter(Boolean).join(" "),
        organizacionPolitica: r.organizacion_politica,
        cargo: r.cargo,
        region: r.region,
        provincia: r.provincia,
        distrito: r.distrito,
        ubigeo: r.ubigeo,
        fechaInicioVigencia: r.fecha_inicio_vigencia,
        fechaFinVigencia: r.fecha_fin_vigencia,
        procesoElectoral: r.proceso_electoral,
        anioEleccion: r.anio_eleccion,
        ambito: r.ambito,
        genero: r.genero,
        edad: r.edad,
        periodo: r.periodo,
        fuente: { dataset: "JNE - Autoridades Electas", extraidoEl: r.fetched_at },
      })),
    });
  })
);
