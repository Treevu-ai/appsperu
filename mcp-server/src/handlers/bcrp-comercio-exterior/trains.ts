/**
 * Handler para el arancel reportado de UNCTAD TRAINS (WITS).
 *
 * Una llamada: Perú 604, socio Mundo 000, año 2021, product=All,
 * datatype=reported. No incluye medidas no arancelarias. No se redistribuye
 * ni se vende.
 *
 * @fidelity: precomputado — este módulo NO es el port de ningún route Express:
 * la fuente es nueva y se sirve solo por MCP. Cada consulta está marcada
 * `@nuevo:`.
 */
import type { NeonRow } from "../../db/neon-pool.js";
import type { ToolHandlerContext, HandlerResult } from "../registry.js";

const FUENTE =
  "UNCTAD TRAINS por la API WITS, datatype reported, product=All, una llamada. " +
  "Perú 604, socio Mundo 000, año 2021, nomenclatura H5. " +
  "No incluye medidas no arancelarias ni otros partners. No se redistribuye ni se vende.";

function num(v: number | string | null): number | null {
  return v === null ? null : Number(v);
}

interface Fila extends NeonRow {
  anio: number;
  reporter: string;
  partner: string;
  producto: string;
  producto_nombre: string | null;
  nomenclatura: string | null;
  tipo_arancel: string | null;
  promedio_simple: number | string | null;
  suma_tasas: number | string | null;
  tasa_min: number | string | null;
  tasa_max: number | string | null;
  lineas_total: number | null;
  lineas_mfn: number | null;
  medida: string | null;
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
  if (args.reporter) push("reporter = $$", String(args.reporter));
  if (args.partner) push("partner = $$", String(args.partner));
  if (args.producto) push("producto = $$", String(args.producto));
  const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
  const { rows } = await db.query<Fila>(
    // @nuevo: lectura de trains_aranceles, sin route Express.
    `SELECT anio, reporter, partner, producto, producto_nombre, nomenclatura, tipo_arancel,
            promedio_simple, suma_tasas, tasa_min, tasa_max, lineas_total, lineas_mfn, medida
     FROM trains_aranceles
     ${where}
     ORDER BY producto
     LIMIT $${values.length + 1} OFFSET $${values.length + 2}`,
    [...values, limit, offset],
  );
  return {
    status: 200,
    body: {
      resultados: rows.map((r) => ({
        anio: r.anio,
        reporter: r.reporter,
        partner: r.partner,
        producto: r.producto,
        productoNombre: r.producto_nombre,
        nomenclatura: r.nomenclatura,
        tipoArancel: r.tipo_arancel,
        promedioSimple: num(r.promedio_simple),
        sumaTasas: num(r.suma_tasas),
        tasaMin: num(r.tasa_min),
        tasaMax: num(r.tasa_max),
        lineasTotal: r.lineas_total,
        lineasMfn: r.lineas_mfn,
        medida: r.medida,
      })),
      total: rows.length,
      fuente: FUENTE,
      ingesta: "manual, sin scheduler — un reporter, un partner y un año",
    },
  };
}
