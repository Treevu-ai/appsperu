/**
 * Handlers para `bcrp_comercio_exterior_atlas_rankings`.
 *
 * Rankings de complejidad del Growth Lab (Dataverse V12). Sin ruta Express.
 *
 * @fidelity: precomputado — este módulo NO es el port de ningún route Express:
 * la fuente es nueva y se sirve solo por MCP. Cada consulta está marcada
 * `@nuevo:`.
 */
import type { NeonRow } from "../../db/neon-pool.js";
import type { ToolHandlerContext, HandlerResult } from "../registry.js";

interface Fila extends NeonRow {
  country_id: number;
  pais_iso3: string;
  anio: number;
  growth_proj: number | string | null;
  in_rankings: boolean;
  eci_sitc: number | string | null;
  eci_rank_sitc: number | null;
  eci_hs92: number | string | null;
  eci_rank_hs92: number | null;
  eci_hs12: number | string | null;
  eci_rank_hs12: number | null;
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
    conditions.push(cond.replace("$$", `$${values.length}`));
  };
  if (args.pais) push("pais_iso3 = $$", String(args.pais).toUpperCase());
  if (args.anio) push("anio = $$", Number(args.anio));
  if (args.desde) push("anio >= $$", Number(args.desde));
  if (args.hasta) push("anio <= $$", Number(args.hasta));
  const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
  const { rows } = await db.query<Fila>(
    // @nuevo: lectura de atlas_rankings, sin route Express.
    `SELECT country_id, pais_iso3, anio, growth_proj, in_rankings,
            eci_sitc, eci_rank_sitc, eci_hs92, eci_rank_hs92, eci_hs12, eci_rank_hs12, vintage
     FROM atlas_rankings
     ${where}
     ORDER BY anio, pais_iso3
     LIMIT $${values.length + 1} OFFSET $${values.length + 2}`,
    [...values, limit, offset],
  );
  return {
    status: 200,
    body: {
      resultados: rows.map((r) => ({
        countryId: r.country_id,
        paisIso3: r.pais_iso3,
        anio: r.anio,
        growthProj: num(r.growth_proj),
        inRankings: r.in_rankings,
        eciSitc: num(r.eci_sitc),
        eciRankSitc: r.eci_rank_sitc,
        eciHs92: num(r.eci_hs92),
        eciRankHs92: r.eci_rank_hs92,
        eciHs12: num(r.eci_hs12),
        eciRankHs12: r.eci_rank_hs12,
        vintage: r.vintage,
      })),
      total: rows.length,
      fuente: "Growth Lab, Harvard Dataverse, doi:10.7910/DVN/XTAQMC versión 12, CC0",
      ingesta: "manual, sin scheduler — un solo CSV de rankings, no la matriz de comercio",
    },
  };
}
