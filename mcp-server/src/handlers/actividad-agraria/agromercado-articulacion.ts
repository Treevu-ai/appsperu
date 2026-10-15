import type { NeonRow } from "../../db/neon-pool.js";
import type { ToolHandlerContext, HandlerResult } from "../registry.js";

/**
 * Handler para `actividad_agraria_agromercado_articulacion` — GET
 * /api/agromercado-articulacion.
 *
 * @fidelity: precomputado — este módulo NO es el port de ningún route
 * Express: la fuente (MIDAGRI/Agromercado, datosabiertos.gob.pe) se ingiere
 * directo con `src/ingest/agromercado-articulacion.ts` y se sirve solo por
 * MCP (ver MCP_ONLY_PATHS en routes-vs-catalog.test.ts).
 *
 * El enlace a RUC (`ruc_match`) es por nombre (ver docblock del conector),
 * no un ID compartido con la fuente — `match_confianza`/`match_score`
 * vienen siempre en la respuesta para que quien consuma esto sepa cuánto
 * confiar en cada fila.
 */

interface PlanRow extends NeonRow {
  num_plan: number | null;
  anio: number;
  codigo_plan: string;
  organizacion: string;
  beneficiarios: number | null;
  cadena: string | null;
  producto: string | null;
  mes_inicio: string | null;
  ubigeo: string | null;
  departamento: string | null;
  provincia: string | null;
  distrito: string | null;
  ruc_match: string | null;
  razon_social_match: string | null;
  match_confianza: string | null;
  match_score: number | string | null;
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
  if (args.producto) push("UPPER(producto) = UPPER($$)", String(args.producto));
  if (args.ruc) push("ruc_match = $$", String(args.ruc));
  if (args.soloConRuc === true || args.soloConRuc === "true") conditions.push("ruc_match IS NOT NULL");
  const minConfianza = args.confianzaMinima as string | undefined;
  if (minConfianza === "confirmada") conditions.push("match_confianza = 'confirmada'");

  const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
  const limit = Math.min(args.limit ? Number(args.limit) : 200, 500);
  const offset = args.offset ? Number(args.offset) : 0;

  const { rows } = await db.query<PlanRow>(
    // @nuevo: lectura de la tabla nueva de Agromercado (fuente sin route Express).
    `SELECT num_plan, anio, codigo_plan, organizacion, beneficiarios, cadena, producto,
            mes_inicio, ubigeo, departamento, provincia, distrito,
            ruc_match, razon_social_match, match_confianza, match_score
     FROM agromercado_planes_articulacion
     ${where}
     ORDER BY departamento, organizacion
     LIMIT $${values.length + 1} OFFSET $${values.length + 2}`,
    [...values, limit, offset]
  );

  return {
    status: 200,
    body: {
      resultados: rows.map((r) => ({
        numPlan: r.num_plan,
        anio: r.anio,
        codigoPlan: r.codigo_plan,
        organizacion: r.organizacion,
        beneficiarios: r.beneficiarios,
        cadena: r.cadena,
        producto: r.producto,
        mesInicio: r.mes_inicio,
        ubigeo: r.ubigeo,
        departamento: r.departamento,
        provincia: r.provincia,
        distrito: r.distrito,
        rucMatch: r.ruc_match,
        razonSocialMatch: r.razon_social_match,
        matchConfianza: r.match_confianza,
        matchScore: r.match_score === null ? null : Number(r.match_score),
      })),
      total: rows.length,
      fuente: "MIDAGRI/Agromercado (antes Sierra y Selva Exportadora) — datosabiertos.gob.pe",
      advertencia:
        "ruc_match se obtiene por similitud de nombre contra el padrón RUC (identidad-fiscal), no es un " +
        "identificador compartido con la fuente. 'confirmada' = coincidencia exacta tras normalizar; " +
        "'candidata' = similitud alta pero no exacta, revisar antes de usar para análisis causal; null = sin match.",
      ingesta: "manual, sin scheduler — refleja la última corrida del conector",
    },
  };
}
