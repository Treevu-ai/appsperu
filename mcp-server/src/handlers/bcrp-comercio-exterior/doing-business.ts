/**
 * Handler para el Doing Business histórico congelado.
 *
 * Un archivo, hoja All Data, DB Year 2004–2020. No se concuerda con B-READY.
 * Sin ruta Express.
 *
 * @fidelity: precomputado — fuente nueva, servida solo por MCP.
 */
import type { NeonRow } from "../../db/neon-pool.js";
import type { ToolHandlerContext, HandlerResult } from "../registry.js";

const FUENTE =
  "World Bank Doing Business, archivo corregido Historical-data---COMPLETE-dataset-with-scores.xlsx, " +
  "hoja All Data. El informe se discontinuó el 16 de septiembre de 2021. " +
  "DB Year es el año del informe en el archivo (2004–2020). CC BY 4.0. " +
  "No se concuerda con B-READY. No Practice, No VAT, .. y N/A quedan en nota.";

interface Fila extends NeonRow {
  country_code: string;
  economy: string;
  region: string;
  income_group: string;
  db_year: number;
  tema: string;
  indicador: string;
  valor: number | string | null;
  nota: string | null;
}

function num(v: number | string | null): number | null {
  return v === null ? null : Number(v);
}

/** ISO de 2 o 3 letras se consulta en mayúsculas. Un código subnacional se deja como está en la hoja. */
export function codigoConsulta(raw: string): string {
  return /^[A-Za-z]{2,3}$/.test(raw) ? raw.toUpperCase() : raw;
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
  if (args.codigo) push("country_code = $$", codigoConsulta(String(args.codigo)));
  if (args.anio) push("db_year = $$", Number(args.anio));
  if (args.tema) push("tema = $$", String(args.tema));
  if (args.indicador) push("indicador = $$", String(args.indicador));
  const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
  const { rows } = await db.query<Fila>(
    // @nuevo: lectura de doingbusiness_historico, sin route Express.
    `SELECT country_code, economy, region, income_group, db_year, tema, indicador, valor, nota
     FROM doingbusiness_historico
     ${where}
     ORDER BY indicador
     LIMIT $${values.length + 1} OFFSET $${values.length + 2}`,
    [...values, limit, offset],
  );
  return {
    status: 200,
    body: {
      resultados: rows.map((r) => ({
        countryCode: r.country_code,
        economy: r.economy,
        region: r.region,
        incomeGroup: r.income_group,
        dbYear: r.db_year,
        tema: r.tema,
        indicador: r.indicador,
        valor: num(r.valor),
        nota: r.nota,
      })),
      total: rows.length,
      fuente: FUENTE,
      ingesta: "manual, sin scheduler — un archivo congelado",
    },
  };
}
