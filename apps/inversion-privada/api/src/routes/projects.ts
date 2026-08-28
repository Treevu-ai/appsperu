import { Router } from "express";
import { z } from "zod";
import { pool } from "../db/pool.js";
import { asyncHandler } from "../lib/async-handler.js";
import { parseQuery } from "../lib/validate-query.js";

export const projectsRouter = Router();

const ProjectsQuerySchema = z.object({
  departamento: z.string().min(1).optional(),
  sector: z.string().min(1).optional(),
  tipo: z.enum(["APP", "PA"]).optional(),
  titular: z.string().min(1).optional(),
  fase: z.string().min(1).optional(),
});

projectsRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const parsed = parseQuery(ProjectsQuerySchema, req.query, res);
    if (!parsed) return;

    const conditions: string[] = [];
    const values: unknown[] = [];

    if (parsed.departamento) {
      values.push(parsed.departamento.trim().toUpperCase());
      conditions.push(`$${values.length} = ANY(p.departamentos)`);
    }
    if (parsed.sector) {
      values.push(parsed.sector);
      conditions.push(`p.sector ILIKE $${values.length}`);
    }
    if (parsed.tipo) {
      values.push(parsed.tipo);
      conditions.push(`p.tipo_proyecto = $${values.length}`);
    }
    if (parsed.titular) {
      values.push(`%${parsed.titular}%`);
      conditions.push(`p.titular ILIKE $${values.length}`);
    }
    if (parsed.fase) {
      values.push(parsed.fase);
      conditions.push(`p.fase ILIKE $${values.length}`);
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

    const { rows } = await pool.query(
      `SELECT p.vertix_id, p.slug, p.tipo_proyecto, p.nombre, p.estado, p.fase, p.titular, p.sector,
              p.cartera, p.modalidad, p.modalidad_contractual, p.monto_inversion_sigv, p.monto_proyecto,
              p.green_brownfield, p.departamentos, p.url_thumb, rb.fetched_at
       FROM private_investment_projects p
       JOIN raw_vertix_batches rb ON rb.id = p.source_batch_id
       ${where}
       ORDER BY p.monto_inversion_sigv DESC NULLS LAST, p.nombre
       LIMIT 1000`,
      values
    );

    const { rows: metaRows } = await pool.query<{ records_total: number; fetched_at: string }>(
      `SELECT records_total, fetched_at FROM raw_vertix_batches ORDER BY fetched_at DESC LIMIT 1`
    );
    const latest = metaRows[0];

    res.json({
      resultados: rows.map((r) => ({
        vertixId: r.vertix_id,
        slug: r.slug,
        tipoProyecto: r.tipo_proyecto,
        nombre: r.nombre,
        estado: r.estado,
        fase: r.fase,
        titular: r.titular,
        sector: r.sector,
        cartera: r.cartera,
        modalidad: r.modalidad,
        modalidadContractual: r.modalidad_contractual,
        montoInversionSigv: r.monto_inversion_sigv === null ? null : Number(r.monto_inversion_sigv),
        montoProyecto: r.monto_proyecto,
        greenBrownfield: r.green_brownfield,
        departamentos: r.departamentos,
        urlThumb: r.url_thumb,
        fuente: {
          dataset: "PROINVERSIÓN / VERTIX (investinperu.pe)",
          extraidoEl: r.fetched_at,
        },
      })),
      cobertura: "cartera_vertix_app_pa",
      isPartial: latest ? rows.length < latest.records_total : true,
      recordsTotalFuente: latest?.records_total ?? null,
      extraidoEl: latest?.fetched_at ?? null,
    });
  })
);

projectsRouter.get(
  "/:vertixId",
  asyncHandler(async (req, res) => {
    const vertixId = Number(req.params.vertixId);
    if (!Number.isInteger(vertixId) || vertixId <= 0) {
      res.status(400).json({ error: "vertixId inválido." });
      return;
    }

    const { rows } = await pool.query(
      `SELECT p.*, rb.fetched_at
       FROM private_investment_projects p
       JOIN raw_vertix_batches rb ON rb.id = p.source_batch_id
       WHERE p.vertix_id = $1`,
      [vertixId]
    );

    if (rows.length === 0) {
      res.status(404).json({ error: "Proyecto no encontrado." });
      return;
    }

    const r = rows[0];
    res.json({
      vertixId: r.vertix_id,
      slug: r.slug,
      tipoProyecto: r.tipo_proyecto,
      nombre: r.nombre,
      nombreCorto: r.nombre_corto,
      estado: r.estado,
      fase: r.fase,
      titular: r.titular,
      sector: r.sector,
      cartera: r.cartera,
      modalidad: r.modalidad,
      modalidadContractual: r.modalidad_contractual,
      iniciativa: r.iniciativa,
      montoInversionSigv: r.monto_inversion_sigv === null ? null : Number(r.monto_inversion_sigv),
      montoProyecto: r.monto_proyecto,
      greenBrownfield: r.green_brownfield,
      buenaProPrevista: r.buena_pro_prevista,
      anhoConcesion: r.anho_concesion,
      departamentos: r.departamentos,
      departamentosInei: r.departamentos_inei,
      urlThumb: r.url_thumb,
      urlGeo: r.url_geo,
      fuente: { dataset: "PROINVERSIÓN / VERTIX", extraidoEl: r.fetched_at },
    });
  })
);
