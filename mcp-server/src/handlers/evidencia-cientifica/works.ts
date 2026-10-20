import type { NeonRow } from "../../db/neon-pool.js";
import type { ToolHandlerContext, HandlerResult } from "../registry.js";

interface WorkRow extends NeonRow {
  doi: string;
  title: string;
  publisher: string | null;
  subjects: string[];
  published_year: number | null;
  url: string | null;
  score: number | string | null;
  query_term: string;
}

function num(v: number | string | null): number | null {
  return v === null ? null : Number(v);
}

/**
 * Handler para `evidencia_cientifica_works` — GET /api/works.
 * SQL idéntico a `apps/evidencia-cientifica/api/src/routes/works.ts`.
 */
export async function works(ctx: ToolHandlerContext): Promise<HandlerResult> {
  const { db, args } = ctx;
  const term = args.term as string | undefined;
  const anio = args.anio as string | undefined;
  const limitArg = args.limit as string | undefined;

  const conditions: string[] = [];
  const values: unknown[] = [];

  if (term) {
    values.push(term);
    conditions.push(`query_term = $${values.length}`);
  }
  if (anio) {
    values.push(Number(anio));
    conditions.push(`published_year = $${values.length}`);
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
  const limit = limitArg ? Math.min(Number(limitArg), 200) : 50;

  const { rows } = await db.query<WorkRow>(
    `SELECT doi, title, publisher, subjects, published_year, url, score, query_term
     FROM crossref_works
     ${where}
     ORDER BY published_year DESC NULLS LAST, score DESC NULLS LAST
     LIMIT ${limit}`,
    values
  );

  return {
    status: 200,
    body: {
      resultados: rows.map((r) => ({ ...r, score: num(r.score) })),
      fuente: "crossref",
      isPartial: false,
    },
  };
}
