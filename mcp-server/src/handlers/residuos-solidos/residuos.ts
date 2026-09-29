import type { NeonRow } from "../../db/neon-pool.js";
import type { ToolHandlerContext, HandlerResult } from "../registry.js";

interface ResiduoRow extends NeonRow {
  ubigeo: string;
  anio: number;
  departamento: string;
  provincia: string;
  distrito: string;
  tipo_municipalidad: string | null;
  poblacion_total: number | null;
  generacion_percapita_dom: number | string | null;
  generacion_dom_urbana_tanio: number | string | null;
  generacion_mun_tanio: number | string | null;
  generacion_mun_tdia: number | string | null;
  fecha_corte: string | null;
  fetched_at: string;
}

/**
 * Handler para `residuos_solidos_residuos` — GET /api/residuos.
 * Origen: apps/residuos-solidos/api/src/routes/residuos.ts. SQL idéntico
 * (incluye el default DQ-04: sin `anio`/`historico`, filtra al año más
 * reciente ingerido).
 */
export async function list(ctx: ToolHandlerContext): Promise<HandlerResult> {
  const { db, args } = ctx;
  const departamento = args.departamento as string | undefined;
  const provincia = args.provincia as string | undefined;
  const distrito = args.distrito as string | undefined;
  const ubigeo = args.ubigeo as string | undefined;
  const anio = args.anio !== undefined ? Number(args.anio) : undefined;
  const historico = args.historico as string | undefined;
  const limit = args.limit ? Number(args.limit) : 200;
  const offset = args.offset ? Number(args.offset) : 0;

  const conditions: string[] = [];
  const params: unknown[] = [];
  const addIlike = (column: string, value: string) => {
    params.push(`%${value}%`);
    conditions.push(`${column} ILIKE $${params.length}`);
  };

  if (departamento) addIlike("r.departamento", departamento);
  if (provincia) addIlike("r.provincia", provincia);
  if (distrito) addIlike("r.distrito", distrito);
  if (ubigeo) {
    params.push(ubigeo);
    conditions.push(`r.ubigeo = $${params.length}`);
  }
  if (anio) {
    params.push(anio);
    conditions.push(`r.anio = $${params.length}`);
  } else if (historico !== "true") {
    conditions.push(`r.anio = (SELECT MAX(anio) FROM residuos_solidos_municipales)`);
  }
  const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

  const { rows: countRows } = await db.query<{ total: string }>(
    `SELECT COUNT(*) AS total FROM residuos_solidos_municipales r ${where}`,
    params
  );
  const total = Number(countRows[0].total);

  const { rows } = await db.query<ResiduoRow>(
    `SELECT r.ubigeo, r.anio, r.departamento, r.provincia, r.distrito, r.tipo_municipalidad,
            r.poblacion_total, r.generacion_percapita_dom, r.generacion_dom_urbana_tanio,
            r.generacion_mun_tanio, r.generacion_mun_tdia, r.fecha_corte, rb.fetched_at
     FROM residuos_solidos_municipales r
     JOIN raw_residuos_solidos_batches rb ON rb.id = r.source_batch_id
     ${where}
     ORDER BY r.anio DESC, r.departamento, r.provincia, r.distrito
     LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
    [...params, limit, offset]
  );

  return {
    status: 200,
    body: {
      total,
      limit,
      offset,
      hasMore: offset + rows.length < total,
      resultados: rows.map((r) => ({
        ubigeo: r.ubigeo,
        anio: r.anio,
        departamento: r.departamento,
        provincia: r.provincia,
        distrito: r.distrito,
        tipoMunicipalidad: r.tipo_municipalidad,
        poblacionTotal: r.poblacion_total,
        generacionPerCapitaDomKgDia: r.generacion_percapita_dom === null ? null : Number(r.generacion_percapita_dom),
        generacionDomUrbanaToneladasAnio: r.generacion_dom_urbana_tanio === null ? null : Number(r.generacion_dom_urbana_tanio),
        generacionMunicipalToneladasAnio: r.generacion_mun_tanio === null ? null : Number(r.generacion_mun_tanio),
        generacionMunicipalToneladasDia: r.generacion_mun_tdia === null ? null : Number(r.generacion_mun_tdia),
        fechaCorte: r.fecha_corte,
        fuente: { dataset: "MINAM - Generación anual de residuos sólidos domiciliarios y municipales (SIGERSOL)", extraidoEl: r.fetched_at },
      })),
    },
  };
}
