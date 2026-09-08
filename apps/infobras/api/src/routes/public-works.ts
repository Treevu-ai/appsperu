import { Router } from "express";
import { z } from "zod";
import { pool } from "../db/pool.js";
import { asyncHandler } from "../lib/async-handler.js";
import { parseQuery } from "../lib/validate-query.js";
import { costDriftPct, gapFisicoFinanciero } from "../signals/signals.js";

export const publicWorksRouter = Router();

const GROUP_BY_COLUMNS = {
  sectorEntidad: "sector_entidad",
  nivelGobierno: "nivel_gobierno",
  naturalezaObra: "naturaleza_obra",
  modalidadEjecucion: "modalidad_ejecucion",
  causalParalizacion: "causal_paralizacion",
} as const;

const PublicWorksResumenQuerySchema = z.object({
  departamento: z.string().min(1).optional(),
  groupBy: z.enum(Object.keys(GROUP_BY_COLUMNS) as [string, ...string[]]).optional()
    .describe("DQ-06: desglosa el resumen por categoría — sectorEntidad, nivelGobierno, naturalezaObra, modalidadEjecucion o causalParalizacion. Un valor no soportado responde 400, nunca se ignora en silencio."),
});

const PublicWorksQuerySchema = z.object({
  departamento: z.string().min(1).optional(),
  estado: z.string().min(1).optional(),
  conParalizacion: z.enum(["true", "false"]).optional(),
  distritoSospechoso: z.enum(["true", "false"]).optional(),
});

function toNumberOrNull(value: unknown): number | null {
  return value === null || value === undefined ? null : Number(value);
}

function withSignals(row: Record<string, unknown>) {
  const montoViable = toNumberOrNull(row.monto_viable);
  const costoActualizado = toNumberOrNull(row.costo_actualizado);
  const avanceFisicoRealPct = toNumberOrNull(row.avance_fisico_real_pct);
  const ejecucionFinancieraPct = toNumberOrNull(row.ejecucion_financiera_pct);

  return {
    codigoInfobras: row.codigo_infobras,
    codigoEntidad: row.codigo_entidad,
    entidadNombre: row.entidad_nombre,
    nombreObra: row.nombre_obra,
    modalidadEjecucion: row.modalidad_ejecucion,
    naturalezaObra: row.naturaleza_obra,
    estadoEjecucion: row.estado_ejecucion,
    nivelGobierno: row.nivel_gobierno,
    sectorEntidad: row.sector_entidad,
    cui: row.cui,
    departamento: row.departamento,
    provincia: row.provincia,
    distrito: row.distrito,
    distritoSospechoso: row.distrito_sospechoso,
    montoViable,
    costoActualizado,
    avanceFisicoProgPct: toNumberOrNull(row.avance_fisico_prog_pct),
    avanceFisicoRealPct,
    ejecucionFinancieraPct,
    existeParalizacion: row.existe_paralizacion,
    causalParalizacion: row.causal_paralizacion,
    fechaParalizacion: row.fecha_paralizacion,
    diasParalizado: row.dias_paralizado,
    costDriftPct: costDriftPct(montoViable, costoActualizado),
    gapFisicoFinanciero: gapFisicoFinanciero(avanceFisicoRealPct, ejecucionFinancieraPct),
    fuente: { dataset: "INFOBRAS - Datos Abiertos (Contraloría)", extraidoEl: row.fetched_at },
  };
}

function pct(part: number, total: number): number {
  return total === 0 ? 0 : Math.round((part / total) * 10000) / 100;
}

publicWorksRouter.get(
  "/resumen",
  asyncHandler(async (req, res) => {
    const parsed = parseQuery(PublicWorksResumenQuerySchema, req.query, res);
    if (!parsed) return;
    const { departamento, groupBy } = parsed;
    const params: unknown[] = [];
    let where = "";
    if (departamento) {
      params.push(departamento.toUpperCase());
      where = "WHERE departamento = $1";
    }

    const { rows } = await pool.query(
      `SELECT
         COUNT(*) AS total,
         COUNT(*) FILTER (WHERE existe_paralizacion) AS con_paralizacion,
         COUNT(*) FILTER (WHERE avance_fisico_real_pct IS NOT NULL) AS con_avance_reportado,
         COUNT(*) FILTER (WHERE distrito_sospechoso) AS con_distrito_sospechoso
       FROM public_works
       ${where}`,
      params
    );

    const total = Number(rows[0].total);
    const body: Record<string, unknown> = {
      totalObras: total,
      conParalizacionPct: pct(Number(rows[0].con_paralizacion), total),
      conAvanceReportadoPct: pct(Number(rows[0].con_avance_reportado), total),
      conDistritoSospechoso: Number(rows[0].con_distrito_sospechoso),
    };

    if (groupBy) {
      // DQ-06: `groupBy` viene validado por el enum del schema — la columna real
      // sale de GROUP_BY_COLUMNS, nunca del texto crudo del query param, para no
      // abrir una inyección SQL por nombre de columna.
      const column = GROUP_BY_COLUMNS[groupBy as keyof typeof GROUP_BY_COLUMNS];
      const { rows: groupRows } = await pool.query(
        `SELECT ${column} AS grupo,
                COUNT(*) AS total,
                COUNT(*) FILTER (WHERE existe_paralizacion) AS con_paralizacion,
                COUNT(*) FILTER (WHERE avance_fisico_real_pct IS NOT NULL) AS con_avance_reportado
         FROM public_works
         ${where}
         GROUP BY ${column}
         ORDER BY total DESC`,
        params
      );
      body.groupBy = groupBy;
      body.porGrupo = groupRows.map((r) => {
        const grupoTotal = Number(r.total);
        return {
          grupo: r.grupo,
          total: grupoTotal,
          conParalizacionPct: pct(Number(r.con_paralizacion), grupoTotal),
          conAvanceReportadoPct: pct(Number(r.con_avance_reportado), grupoTotal),
        };
      });
    }

    res.json(body);
  })
);

publicWorksRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const parsed = parseQuery(PublicWorksQuerySchema, req.query, res);
    if (!parsed) return;
    const { departamento, estado, conParalizacion, distritoSospechoso } = parsed;

    const conditions: string[] = [];
    const params: unknown[] = [];
    if (departamento) {
      params.push(departamento.toUpperCase());
      conditions.push(`pw.departamento = $${params.length}`);
    }
    if (estado) {
      params.push(estado);
      conditions.push(`pw.estado_ejecucion = $${params.length}`);
    }
    if (conParalizacion === "true") {
      conditions.push("pw.existe_paralizacion = true");
    }
    if (distritoSospechoso === "true") {
      conditions.push("pw.distrito_sospechoso = true");
    } else if (distritoSospechoso === "false") {
      conditions.push("pw.distrito_sospechoso = false");
    }
    const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

    const { rows } = await pool.query(
      `SELECT pw.*, rb.fetched_at
       FROM public_works pw
       JOIN raw_infobras_batches rb ON rb.id = pw.source_batch_id
       ${where}
       ORDER BY pw.nombre_obra ASC`,
      params
    );

    res.json({ resultados: rows.map(withSignals) });
  })
);

publicWorksRouter.get(
  "/:codigoInfobras",
  asyncHandler(async (req, res) => {
    const { rows } = await pool.query(
      `SELECT pw.*, rb.fetched_at
       FROM public_works pw
       JOIN raw_infobras_batches rb ON rb.id = pw.source_batch_id
       WHERE pw.codigo_infobras = $1`,
      [req.params.codigoInfobras]
    );

    if (rows.length === 0) {
      res.status(404).json({ error: "Obra no encontrada en los datos ingeridos." });
      return;
    }

    res.json(withSignals(rows[0]));
  })
);
