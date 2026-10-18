/**
 * Handlers para `bcrp_comercio_exterior_bready`.
 *
 * Puntajes por pilar de B-READY 2025. No se cruza con Doing Business.
 * Sin ruta Express.
 *
 * @fidelity: precomputado — fuente nueva, servida solo por MCP.
 */
import type { NeonRow } from "../../db/neon-pool.js";
import type { ToolHandlerContext, HandlerResult } from "../registry.js";

interface Fila extends NeonRow {
  economia: string;
  economia_codigo: string;
  edicion: string;
  pilar: string;
  tema: string;
  indicador: string;
  valor: number | string;
}

export async function list(ctx: ToolHandlerContext): Promise<HandlerResult> {
  const { db, args } = ctx;
  const limit = Math.min(args.limit ? Number(args.limit) : 500, 2000);
  const offset = args.offset ? Number(args.offset) : 0;
  const conditions: string[] = [];
  const values: unknown[] = [];
  const push = (cond: string, value: unknown) => {
    values.push(value);
    conditions.push(cond.replace("$$", `$${values.length}`));
  };
  if (args.economia) push("economia_codigo = $$", String(args.economia).toUpperCase());
  if (args.edicion) push("edicion = $$", String(args.edicion));
  if (args.pilar) push("pilar = $$", String(args.pilar));
  const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
  const { rows } = await db.query<Fila>(
    // @nuevo: lectura de bready_puntajes, sin route Express.
    `SELECT economia, economia_codigo, edicion, pilar, tema, indicador, valor
     FROM bready_puntajes
     ${where}
     ORDER BY economia_codigo, pilar
     LIMIT $${values.length + 1} OFFSET $${values.length + 2}`,
    [...values, limit, offset],
  );
  return {
    status: 200,
    body: {
      resultados: rows.map((r) => ({
        economia: r.economia,
        economiaCodigo: r.economia_codigo,
        edicion: r.edicion,
        pilar: r.pilar,
        tema: r.tema,
        indicador: r.indicador,
        valor: Number(r.valor),
      })),
      total: rows.length,
      fuente:
        "World Bank Business Ready 2025, hoja 00_B-READY_Pillar_Score. " +
        "Licencia custom sin texto publicado en la ficha. Uso interno. No se concuerda con Doing Business.",
      ingesta: "manual, sin scheduler — una edición, no un feed",
    },
  };
}
