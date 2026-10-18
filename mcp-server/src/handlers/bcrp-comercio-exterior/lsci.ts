/**
 * Handlers para `bcrp_comercio_exterior_lsci`.
 *
 * UNCTAD LSCI, solo la serie trimestral US.LSCI. Sin ruta Express.
 *
 * @fidelity: precomputado — fuente nueva, servida solo por MCP.
 */
import type { NeonRow } from "../../db/neon-pool.js";
import type { ToolHandlerContext, HandlerResult } from "../registry.js";

interface Fila extends NeonRow {
  economia_codigo: string;
  economia_nombre: string;
  periodo: string;
  periodo_etiqueta: string;
  indicador: string;
  valor: number | string;
  publicado_el: string;
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
  if (args.economia) push("economia_codigo = $$", String(args.economia));
  if (args.periodo) push("periodo = $$", String(args.periodo));
  if (args.indicador) push("indicador = $$", String(args.indicador));
  const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
  const { rows } = await db.query<Fila>(
    // @nuevo: lectura de lsci, sin route Express.
    `SELECT economia_codigo, economia_nombre, periodo, periodo_etiqueta,
            indicador, valor, publicado_el
     FROM lsci
     ${where}
     ORDER BY periodo, economia_codigo, indicador
     LIMIT $${values.length + 1} OFFSET $${values.length + 2}`,
    [...values, limit, offset],
  );
  return {
    status: 200,
    body: {
      resultados: rows.map((r) => ({
        economiaCodigo: r.economia_codigo,
        economiaNombre: r.economia_nombre,
        periodo: r.periodo,
        periodoEtiqueta: r.periodo_etiqueta,
        indicador: r.indicador,
        valor: Number(r.valor),
        publicadoEl: r.publicado_el,
      })),
      total: rows.length,
      fuente: "UNCTAD, UNCTADstat, US.LSCI, CC BY 3.0 IGO. No incluye US.LSCI_M ni US.PLSCI.",
      ingesta: "manual, sin scheduler",
    },
  };
}
