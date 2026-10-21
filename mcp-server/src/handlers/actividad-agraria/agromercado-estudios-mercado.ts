import type { NeonRow } from "../../db/neon-pool.js";
import type { ToolHandlerContext, HandlerResult } from "../registry.js";

/**
 * Handler para `actividad_agraria_agromercado_estudios_mercado` — GET
 * /api/agromercado-estudios-mercado.
 *
 * @fidelity: precomputado — sin route Express, servido solo por MCP (ver
 * MCP_ONLY_PATHS en routes-vs-catalog.test.ts).
 */

interface EstudioRow extends NeonRow {
  num_estudio: number | null;
  anio: number | null;
  mes: string | null;
  trimestre: string | null;
  titulo: string | null;
  cadena: string | null;
  region: string | null;
  uri: string | null;
}

export async function list(ctx: ToolHandlerContext): Promise<HandlerResult> {
  const { db, args } = ctx;

  const conditions: string[] = [];
  const values: unknown[] = [];
  const push = (cond: string, value: unknown) => {
    values.push(value);
    conditions.push(cond.replace("$$", `$${values.length}`));
  };

  if (args.cadena) push("UPPER(cadena) = UPPER($$)", String(args.cadena));
  if (args.region) push("UPPER(region) LIKE UPPER($$)", `%${String(args.region)}%`);

  const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
  const limit = Math.min(args.limit ? Number(args.limit) : 200, 500);
  const offset = args.offset ? Number(args.offset) : 0;

  const { rows } = await db.query<EstudioRow>(
    // @nuevo: lectura de la tabla nueva de Agromercado (fuente sin route Express).
    `SELECT num_estudio, anio, mes, trimestre, titulo, cadena, region, uri
     FROM agromercado_estudios_mercado
     ${where}
     ORDER BY num_estudio
     LIMIT $${values.length + 1} OFFSET $${values.length + 2}`,
    [...values, limit, offset]
  );

  return {
    status: 200,
    body: {
      resultados: rows.map((r) => ({
        numEstudio: r.num_estudio,
        anio: r.anio,
        mes: r.mes,
        trimestre: r.trimestre,
        titulo: r.titulo,
        cadena: r.cadena,
        region: r.region,
        uri: r.uri,
      })),
      total: rows.length,
      fuente: "MIDAGRI/Agromercado — Listado de Estudios Especializados al 2025 (datosabiertos.gob.pe)",
      ingesta: "manual, sin scheduler — snapshot completo, refleja la última corrida del conector",
    },
  };
}
