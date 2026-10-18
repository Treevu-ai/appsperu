/**
 * Handlers para Gravity V202211: acuerdos proyectados y etiquetas RTA.
 *
 * No es rta_20260111. No devuelve el CSV ancho (87 columnas, 1.25 GB).
 *
 * @fidelity: precomputado — este módulo NO es el port de ningún route Express:
 * la fuente es nueva y se sirve solo por MCP. Cada consulta está marcada
 * `@nuevo:`.
 */
import type { NeonRow } from "../../db/neon-pool.js";
import type { ToolHandlerContext, HandlerResult } from "../registry.js";

const FUENTE =
  "CEPII Gravity V202211, Etalab 2.0. Solo la proyección de acuerdos " +
  "(fta_wto, fta_wto_raw, rta_coverage, rta_type). No es el zip rta_20260111 " +
  "ni el CSV ancho de 87 columnas.";

interface Acuerdo extends NeonRow {
  anio: number;
  country_id_o: string;
  country_id_d: string;
  iso3_o: string;
  iso3_d: string;
  country_exists_o: number | null;
  country_exists_d: number | null;
  fta_wto: string | null;
  fta_wto_raw: string | null;
  rta_coverage: string | null;
  rta_type: string | null;
  vintage: string;
}

interface Etiqueta extends NeonRow {
  variable: string;
  codigo: string;
  etiqueta: string;
  vintage: string;
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
  if (args.origen) push("iso3_o = $$", String(args.origen).toUpperCase());
  if (args.destino) push("iso3_d = $$", String(args.destino).toUpperCase());
  if (args.conAcuerdo === "1" || args.conAcuerdo === "true") {
    conditions.push("(fta_wto IS NOT NULL OR fta_wto_raw IS NOT NULL OR rta_coverage IS NOT NULL OR rta_type IS NOT NULL)");
  }
  const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
  const { rows } = await db.query<Acuerdo>(
    // @nuevo: lectura de gravity_acuerdos, sin route Express.
    `SELECT anio, country_id_o, country_id_d, iso3_o, iso3_d,
            country_exists_o, country_exists_d, fta_wto, fta_wto_raw, rta_coverage, rta_type, vintage
     FROM gravity_acuerdos
     ${where}
     ORDER BY anio, iso3_o, iso3_d
     LIMIT $${values.length + 1} OFFSET $${values.length + 2}`,
    [...values, limit, offset],
  );
  return {
    status: 200,
    body: {
      resultados: rows.map((r) => ({
        anio: r.anio,
        countryIdO: r.country_id_o,
        countryIdD: r.country_id_d,
        iso3O: r.iso3_o,
        iso3D: r.iso3_d,
        countryExistsO: r.country_exists_o,
        countryExistsD: r.country_exists_d,
        ftaWto: r.fta_wto,
        ftaWtoRaw: r.fta_wto_raw,
        rtaCoverage: r.rta_coverage,
        rtaType: r.rta_type,
        vintage: r.vintage,
      })),
      total: rows.length,
      fuente: FUENTE,
      ingesta: "manual, sin scheduler — proyección del zip V202211, una corrida",
    },
  };
}

export async function etiquetas(ctx: ToolHandlerContext): Promise<HandlerResult> {
  const { db, args } = ctx;
  const conditions: string[] = [];
  const values: unknown[] = [];
  const push = (cond: string, value: unknown) => {
    values.push(value);
    conditions.push(cond.replaceAll("$$", `$${values.length}`));
  };
  if (args.variable) push("variable = $$", String(args.variable));
  const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
  const { rows } = await db.query<Etiqueta>(
    // @nuevo: lectura de gravity_rta_etiquetas, sin route Express.
    `SELECT variable, codigo, etiqueta, vintage
     FROM gravity_rta_etiquetas
     ${where}
     ORDER BY variable, codigo`,
    values,
  );
  return {
    status: 200,
    body: {
      resultados: rows.map((r) => ({
        variable: r.variable,
        codigo: r.codigo,
        etiqueta: r.etiqueta,
        vintage: r.vintage,
      })),
      total: rows.length,
      fuente: FUENTE,
      ingesta: "manual, sin scheduler — Label_rta_type y Label_rta_coverage de V202211",
    },
  };
}
