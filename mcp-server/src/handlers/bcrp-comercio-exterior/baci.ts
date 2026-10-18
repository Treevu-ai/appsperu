/**
 * Handlers para `bcrp_comercio_exterior_baci`.
 *
 * Flujos CEPII BACI HS92, vintage 202601. Sin ruta Express. La carga por
 * defecto es Perú exportador (604). Un año mundial 2024 tiene 10580049 filas
 * y no está en esta tabla.
 *
 * @fidelity: precomputado — este módulo NO es el port de ningún route Express:
 * la fuente es nueva y se sirve solo por MCP. Cada consulta está marcada
 * `@nuevo:`.
 */
import type { NeonRow } from "../../db/neon-pool.js";
import type { ToolHandlerContext, HandlerResult } from "../registry.js";

interface Fila extends NeonRow {
  anio: number;
  exportador: number;
  importador: number;
  hs6: string;
  valor_miles_usd: number | string | null;
  cantidad: number | string | null;
  vintage: string;
}

function num(v: number | string | null): number | null {
  return v === null ? null : Number(v);
}

export async function list(ctx: ToolHandlerContext): Promise<HandlerResult> {
  const { db, args } = ctx;
  const limit = Math.min(args.limit ? Number(args.limit) : 500, 2000);
  const offset = args.offset ? Number(args.offset) : 0;
  const conditions: string[] = [];
  const values: unknown[] = [];
  const push = (cond: string, value: unknown) => {
    values.push(value);
    conditions.push(cond.replaceAll("$$", `$${values.length}`));
  };
  if (args.anio) push("anio = $$", Number(args.anio));
  if (args.desde) push("anio >= $$", Number(args.desde));
  if (args.hasta) push("anio <= $$", Number(args.hasta));
  if (args.exportador) push("exportador = $$", Number(args.exportador));
  if (args.importador) push("importador = $$", Number(args.importador));
  if (args.hs6) push("hs6 = $$", String(args.hs6));
  const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
  const { rows } = await db.query<Fila>(
    // @nuevo: lectura de baci_flujos, sin route Express.
    `SELECT anio, exportador, importador, hs6, valor_miles_usd, cantidad, vintage
     FROM baci_flujos
     ${where}
     ORDER BY anio, importador, hs6
     LIMIT $${values.length + 1} OFFSET $${values.length + 2}`,
    [...values, limit, offset],
  );
  return {
    status: 200,
    body: {
      resultados: rows.map((r) => ({
        anio: r.anio,
        exportador: r.exportador,
        importador: r.importador,
        hs6: r.hs6,
        valorMilesUsd: num(r.valor_miles_usd),
        cantidad: num(r.cantidad),
        vintage: r.vintage,
      })),
      total: rows.length,
      unidad: "miles de USD",
      fuente:
        "CEPII BACI HS92, vintage 202601. v en miles de USD y q en toneladas. " +
        "La carga por defecto es Perú exportador (código 604), todos los socios, HS6, 2015–2024. " +
        "Un año mundial (2024) tiene 10580049 filas y no se carga.",
      ingesta: "manual, sin scheduler — un exportador por corrida, sin panel mundial",
    },
  };
}
