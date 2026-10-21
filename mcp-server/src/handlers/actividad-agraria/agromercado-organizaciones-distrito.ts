import type { NeonRow } from "../../db/neon-pool.js";
import type { ToolHandlerContext, HandlerResult } from "../registry.js";

/**
 * Handler para `actividad_agraria_agromercado_organizaciones_distrito` — GET
 * /api/agromercado-organizaciones-distrito.
 *
 * @fidelity: precomputado — sin route Express, servido solo por MCP (ver
 * MCP_ONLY_PATHS en routes-vs-catalog.test.ts).
 *
 * Mapa agregado por distrito del número de organizaciones asistidas por Agromercado en
 * 2025 -- NO es un padrón de organizaciones individuales (la fuente solo trae un conteo
 * por distrito, ver docblock del conector).
 */

interface OrganizacionDistritoRow extends NeonRow {
  ubigeo: string;
  departamento: string | null;
  provincia: string | null;
  distrito: string | null;
  num_organizaciones: number | null;
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
  if (args.ubigeo) push("ubigeo = $$", String(args.ubigeo));

  const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
  const limit = Math.min(args.limit ? Number(args.limit) : 200, 500);
  const offset = args.offset ? Number(args.offset) : 0;

  const { rows } = await db.query<OrganizacionDistritoRow>(
    // @nuevo: lectura de la tabla nueva de Agromercado (fuente sin route Express).
    `SELECT ubigeo, departamento, provincia, distrito, num_organizaciones
     FROM agromercado_organizaciones_distrito
     ${where}
     ORDER BY num_organizaciones DESC NULLS LAST, departamento
     LIMIT $${values.length + 1} OFFSET $${values.length + 2}`,
    [...values, limit, offset]
  );

  return {
    status: 200,
    body: {
      resultados: rows.map((r) => ({
        ubigeo: r.ubigeo,
        departamento: r.departamento,
        provincia: r.provincia,
        distrito: r.distrito,
        numOrganizaciones: r.num_organizaciones,
      })),
      total: rows.length,
      fuente: "MIDAGRI/Agromercado — Organizaciones Asistidas por Agromercado en el 2025 (datosabiertos.gob.pe)",
      advertencia: "Conteo agregado por distrito, sin nombres de organización individuales.",
      ingesta: "manual, sin scheduler — snapshot completo, refleja la última corrida del conector",
    },
  };
}
