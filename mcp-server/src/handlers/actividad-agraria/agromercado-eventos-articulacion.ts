import type { NeonRow } from "../../db/neon-pool.js";
import type { ToolHandlerContext, HandlerResult } from "../registry.js";

/**
 * Handler para `actividad_agraria_agromercado_eventos_articulacion` — GET
 * /api/agromercado-eventos-articulacion.
 *
 * @fidelity: precomputado — sin route Express, servido solo por MCP (ver
 * MCP_ONLY_PATHS en routes-vs-catalog.test.ts).
 */

interface EventoRow extends NeonRow {
  num_evento: number | null;
  nombre: string | null;
  productos: string | null;
  tipo: string | null;
  departamento: string | null;
  fecha: string | null;
  alcance_mercado: string | null;
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
  if (args.tipo) push("UPPER(tipo) = UPPER($$)", String(args.tipo));
  if (args.alcanceMercado) push("UPPER(alcance_mercado) = UPPER($$)", String(args.alcanceMercado));

  const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
  const limit = Math.min(args.limit ? Number(args.limit) : 200, 500);
  const offset = args.offset ? Number(args.offset) : 0;

  const { rows } = await db.query<EventoRow>(
    // @nuevo: lectura de la tabla nueva de Agromercado (fuente sin route Express).
    `SELECT num_evento, nombre, productos, tipo, departamento, fecha, alcance_mercado, num_organizaciones
     FROM agromercado_eventos_articulacion
     ${where}
     ORDER BY fecha DESC NULLS LAST
     LIMIT $${values.length + 1} OFFSET $${values.length + 2}`,
    [...values, limit, offset]
  );

  return {
    status: 200,
    body: {
      resultados: rows.map((r) => ({
        numEvento: r.num_evento,
        nombre: r.nombre,
        productos: r.productos,
        tipo: r.tipo,
        departamento: r.departamento,
        fecha: r.fecha,
        alcanceMercado: r.alcance_mercado,
        numOrganizaciones: r.num_organizaciones,
      })),
      total: rows.length,
      fuente: "MIDAGRI/Agromercado — Eventos de Articulación Comercial realizados en el 2025 (datosabiertos.gob.pe)",
      advertencia: "`numOrganizaciones` es un conteo de participantes, sin nombres de organización individuales.",
      ingesta: "manual, sin scheduler — snapshot completo, refleja la última corrida del conector",
    },
  };
}
