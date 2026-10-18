/**
 * Handlers para GeoDist: países (`geo_cepii`) y díadas (`dist_cepii`).
 *
 * Uso interno. La ficha vigente de CEPII es Etalab 2.0; `distances.htm`
 * todavía dice CC BY-NC-ND 3.0. No se republica el archivo. No reemplaza
 * el extracto `geodist_peru.csv` del estudio.
 *
 * @fidelity: precomputado — este módulo NO es el port de ningún route Express:
 * la fuente es nueva y se sirve solo por MCP. Cada consulta está marcada
 * `@nuevo:`.
 */
import type { NeonRow } from "../../db/neon-pool.js";
import type { ToolHandlerContext, HandlerResult } from "../registry.js";

const FUENTE =
  "CEPII GeoDist. Uso interno bajo la ficha vigente (Etalab 2.0). " +
  "distances.htm todavía dice CC BY-NC-ND 3.0. No se republica el archivo ni se reemplaza geodist_peru.csv.";

function num(v: number | string | null): number | null {
  return v === null ? null : Number(v);
}

interface Pais extends NeonRow {
  iso2: string;
  iso3: string;
  cnum: number | null;
  country: string | null;
  pays: string | null;
  area: number | string | null;
  dis_int: number | string | null;
  landlocked: number | null;
  continent: string | null;
  city_en: string | null;
  lat: number | string | null;
  lon: number | string | null;
  cap: number | null;
  maincity: number | null;
  colonizer1: string | null;
  lang9_1: string | null;
}

interface Diada extends NeonRow {
  iso_o: string;
  iso_d: string;
  contig: number | null;
  comlang_off: number | null;
  comlang_ethno: number | null;
  colony: number | null;
  comcol: number | null;
  curcol: number | null;
  col45: number | null;
  smctry: number | null;
  dist: number | string | null;
  distcap: number | string | null;
  distw: number | string | null;
  distwces: number | string | null;
}

export async function listPaises(ctx: ToolHandlerContext): Promise<HandlerResult> {
  const { db, args } = ctx;
  const limit = Math.min(args.limit ? Number(args.limit) : 500, 2000);
  const offset = args.offset ? Number(args.offset) : 0;
  const conditions: string[] = [];
  const values: unknown[] = [];
  const push = (cond: string, value: unknown) => {
    values.push(value);
    conditions.push(cond.replaceAll("$$", `$${values.length}`));
  };
  if (args.iso3) push("iso3 = $$", String(args.iso3).toUpperCase());
  const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
  const { rows } = await db.query<Pais>(
    // @nuevo: lectura de geodist_paises, sin route Express.
    `SELECT iso2, iso3, cnum, country, pays, area, dis_int, landlocked, continent,
            city_en, lat, lon, cap, maincity, colonizer1, lang9_1
     FROM geodist_paises
     ${where}
     ORDER BY iso3, cap, maincity
     LIMIT $${values.length + 1} OFFSET $${values.length + 2}`,
    [...values, limit, offset],
  );
  return {
    status: 200,
    body: {
      resultados: rows.map((r) => ({
        iso2: r.iso2,
        iso3: r.iso3,
        cnum: r.cnum,
        country: r.country,
        pays: r.pays,
        area: num(r.area),
        disInt: num(r.dis_int),
        landlocked: r.landlocked,
        continent: r.continent,
        cityEn: r.city_en,
        lat: num(r.lat),
        lon: num(r.lon),
        cap: r.cap,
        maincity: r.maincity,
        colonizer1: r.colonizer1,
        lang91: r.lang9_1,
      })),
      total: rows.length,
      fuente: FUENTE,
      ingesta: "manual, sin scheduler — geo_cepii.xls, una corrida",
    },
  };
}

export async function listDiadas(ctx: ToolHandlerContext): Promise<HandlerResult> {
  const { db, args } = ctx;
  const limit = Math.min(args.limit ? Number(args.limit) : 500, 2000);
  const offset = args.offset ? Number(args.offset) : 0;
  const conditions: string[] = [];
  const values: unknown[] = [];
  const push = (cond: string, value: unknown) => {
    values.push(value);
    conditions.push(cond.replaceAll("$$", `$${values.length}`));
  };
  if (args.origen) push("iso_o = $$", String(args.origen).toUpperCase());
  if (args.destino) push("iso_d = $$", String(args.destino).toUpperCase());
  const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
  const { rows } = await db.query<Diada>(
    // @nuevo: lectura de geodist_diadas, sin route Express.
    `SELECT iso_o, iso_d, contig, comlang_off, comlang_ethno, colony, comcol, curcol, col45, smctry,
            dist, distcap, distw, distwces
     FROM geodist_diadas
     ${where}
     ORDER BY iso_o, iso_d
     LIMIT $${values.length + 1} OFFSET $${values.length + 2}`,
    [...values, limit, offset],
  );
  return {
    status: 200,
    body: {
      resultados: rows.map((r) => ({
        isoO: r.iso_o,
        isoD: r.iso_d,
        contig: r.contig,
        comlangOff: r.comlang_off,
        comlangEthno: r.comlang_ethno,
        colony: r.colony,
        comcol: r.comcol,
        curcol: r.curcol,
        col45: r.col45,
        smctry: r.smctry,
        dist: num(r.dist),
        distcap: num(r.distcap),
        distw: num(r.distw),
        distwces: num(r.distwces),
      })),
      total: rows.length,
      unidad: "kilómetros",
      fuente: FUENTE,
      ingesta: "manual, sin scheduler — dist_cepii.xls, una corrida",
    },
  };
}
