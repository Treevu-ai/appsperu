import { Router } from "express";
import { z } from "zod";
import { pool } from "../db/pool.js";
import { asyncHandler } from "../lib/async-handler.js";
import { parseQuery } from "../lib/validate-query.js";

export const rucConsultaMasivaRouter = Router();

const DEFAULT_LIMIT = 200;
const MAX_LIMIT = 1000;

const COLUMNS = `ruc, razon_social, tipo_contribuyente, profesion_oficio, nombre_comercial,
       condicion_contribuyente, estado_contribuyente, fecha_inscripcion, fecha_inicio_actividades,
       departamento, provincia, distrito, direccion, telefono, fax, actividad_comercio_exterior,
       ciiu_principal, ciiu_secundario_1, ciiu_secundario_2, afecto_nuevo_rus, buen_contribuyente,
       agente_retencion, agente_percepcion_venta_interna, agente_percepcion_combustible, fecha_consulta`;

function toResultado(r: Record<string, unknown>) {
  return {
    ruc: r.ruc,
    razonSocial: r.razon_social,
    tipoContribuyente: r.tipo_contribuyente,
    profesionOficio: r.profesion_oficio,
    nombreComercial: r.nombre_comercial,
    condicionContribuyente: r.condicion_contribuyente,
    estadoContribuyente: r.estado_contribuyente,
    fechaInscripcion: r.fecha_inscripcion,
    fechaInicioActividades: r.fecha_inicio_actividades,
    departamento: r.departamento,
    provincia: r.provincia,
    distrito: r.distrito,
    direccion: r.direccion,
    telefono: r.telefono,
    fax: r.fax,
    actividadComercioExterior: r.actividad_comercio_exterior,
    ciiuPrincipal: r.ciiu_principal,
    ciiuSecundario1: r.ciiu_secundario_1,
    ciiuSecundario2: r.ciiu_secundario_2,
    afectoNuevoRus: r.afecto_nuevo_rus,
    buenContribuyente: r.buen_contribuyente,
    agenteRetencion: r.agente_retencion,
    agentePercepcionVentaInterna: r.agente_percepcion_venta_interna,
    agentePercepcionCombustible: r.agente_percepcion_combustible,
    fechaConsulta: r.fecha_consulta,
  };
}

const SearchQuerySchema = z.object({
  razonSocial: z.string().min(1).optional(),
  estado: z.string().min(1).optional(),
  departamento: z.string().min(1).optional(),
  provincia: z.string().min(1).optional(),
  distrito: z.string().min(1).optional(),
  buenContribuyente: z.enum(["true", "false"]).optional(),
  limit: z.coerce.number().int().min(1).max(MAX_LIMIT).default(DEFAULT_LIMIT),
  offset: z.coerce.number().int().min(0).default(0),
});

rucConsultaMasivaRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const parsed = parseQuery(SearchQuerySchema, req.query, res);
    if (!parsed) return;
    const { razonSocial, estado, departamento, provincia, distrito, buenContribuyente, limit, offset } = parsed;

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
    if (departamento) {
      params.push(departamento.toUpperCase());
      conditions.push(`departamento = $${params.length}`);
    }
    if (provincia) {
      params.push(provincia.toUpperCase());
      conditions.push(`provincia = $${params.length}`);
    }
    if (distrito) {
      params.push(distrito.toUpperCase());
      conditions.push(`distrito = $${params.length}`);
    }
    if (buenContribuyente === "true") {
      conditions.push(`buen_contribuyente = 'SI'`);
    } else if (buenContribuyente === "false") {
      conditions.push(`(buen_contribuyente IS NULL OR buen_contribuyente <> 'SI')`);
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

    const { rows: countRows } = await pool.query<{ total: string }>(
      `SELECT COUNT(*) AS total FROM ruc_consulta_masiva ${where}`,
      params
    );
    const total = Number(countRows[0].total);

    const { rows } = await pool.query(
      `SELECT ${COLUMNS} FROM ruc_consulta_masiva ${where}
       ORDER BY razon_social
       LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, limit, offset]
    );

    res.json({
      total,
      limit,
      offset,
      hasMore: offset + rows.length < total,
      resultados: rows.map(toResultado),
    });
  })
);

rucConsultaMasivaRouter.get(
  "/:ruc",
  asyncHandler(async (req, res) => {
    const { rows } = await pool.query(`SELECT ${COLUMNS} FROM ruc_consulta_masiva WHERE ruc = $1`, [req.params.ruc]);
    if (rows.length === 0) {
      res.status(404).json({ error: "RUC no encontrado en la Consulta Múltiple ingerida." });
      return;
    }
    res.json(toResultado(rows[0]));
  })
);
