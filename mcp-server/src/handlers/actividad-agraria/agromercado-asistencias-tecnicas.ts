import type { NeonRow } from "../../db/neon-pool.js";
import type { ToolHandlerContext, HandlerResult } from "../registry.js";

/**
 * Handler para `actividad_agraria_agromercado_asistencias_tecnicas` — GET
 * /api/agromercado-asistencias-tecnicas.
 *
 * @fidelity: precomputado — sin route Express: la fuente (MIDAGRI/Agromercado,
 * datosabiertos.gob.pe) se ingiere con `src/ingest/agromercado-asistencias-tecnicas.ts`
 * y se sirve solo por MCP (ver MCP_ONLY_PATHS en routes-vs-catalog.test.ts).
 *
 * Sin RUC/organización: esta fuente es un log de asistencias técnicas individuales
 * (tema, actividad, ubicación, beneficiarios), no un padrón de organizaciones.
 */

interface AsistenciaRow extends NeonRow {
  num_at: number | null;
  codigo_at: string | null;
  anio: number;
  mes: string | null;
  fecha: string | null;
  ubigeo: string | null;
  departamento: string | null;
  provincia: string | null;
  distrito: string | null;
  region_natural: string | null;
  actividad: string | null;
  tematica: string | null;
  descripcion: string | null;
  beneficiarios: number | null;
}

export async function list(ctx: ToolHandlerContext): Promise<HandlerResult> {
  const { db, args } = ctx;

  const conditions: string[] = [];
  const values: unknown[] = [];
  const push = (cond: string, value: unknown) => {
    values.push(value);
    conditions.push(cond.replace("$$", `$${values.length}`));
  };

  if (args.departamento) push("departamento = $$", String(args.departamento).toUpperCase());
  if (args.tematica) push("UPPER(tematica) = UPPER($$)", String(args.tematica));
  if (args.regionNatural) push("UPPER(region_natural) = UPPER($$)", String(args.regionNatural));

  const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
  const limit = Math.min(args.limit ? Number(args.limit) : 200, 500);
  const offset = args.offset ? Number(args.offset) : 0;

  const { rows } = await db.query<AsistenciaRow>(
    // @nuevo: lectura de la tabla nueva de Agromercado (fuente sin route Express).
    `SELECT num_at, codigo_at, anio, mes, fecha, ubigeo, departamento, provincia, distrito,
            region_natural, actividad, tematica, descripcion, beneficiarios
     FROM agromercado_asistencias_tecnicas
     ${where}
     ORDER BY fecha DESC NULLS LAST, departamento
     LIMIT $${values.length + 1} OFFSET $${values.length + 2}`,
    [...values, limit, offset]
  );

  return {
    status: 200,
    body: {
      resultados: rows.map((r) => ({
        numAt: r.num_at,
        codigoAt: r.codigo_at,
        anio: r.anio,
        mes: r.mes,
        fecha: r.fecha,
        ubigeo: r.ubigeo,
        departamento: r.departamento,
        provincia: r.provincia,
        distrito: r.distrito,
        regionNatural: r.region_natural,
        actividad: r.actividad,
        tematica: r.tematica,
        descripcion: r.descripcion,
        beneficiarios: r.beneficiarios,
      })),
      total: rows.length,
      fuente: "MIDAGRI/Agromercado — Reporte de Asistencias Técnicas IV Trimestre 2025 (datosabiertos.gob.pe)",
      advertencia:
        "Cada fila es una asistencia técnica individual (tema/actividad), no una organización. " +
        "`codigoAt` no es una clave única -- varias líneas temáticas pueden compartir el mismo código de ficha.",
      ingesta: "manual, sin scheduler — snapshot completo, refleja la última corrida del conector",
    },
  };
}
