import type { NeonRow } from "../../db/neon-pool.js";
import type { ToolHandlerContext, HandlerResult } from "../registry.js";

const DEFAULT_LIMIT = 200;
const MAX_LIMIT = 1000;

interface DefuncionRow extends NeonRow {
  provincia_domicilio: string | null;
  distrito_domicilio: string | null;
  sexo: string | null;
  edad: number | string | null;
  fecha_defuncion: string | null;
  anio_defuncion: number | string | null;
  mes_defuncion: number | string | null;
  tipo_lugar: string | null;
  muerte_violenta: string | null;
  necropsia: string | null;
  causa_a: string | null;
  cie_a: string | null;
}

/**
 * Handler para `sinadef_defunciones_defunciones` — GET /api/defunciones.
 * Origen: apps/sinadef-defunciones/api/src/routes/defunciones.ts.
 */
export async function list(ctx: ToolHandlerContext): Promise<HandlerResult> {
  const { db, args } = ctx;
  const provincia = args.provincia as string | undefined;
  const distrito = args.distrito as string | undefined;
  const muerteViolenta = args.muerteViolenta as string | undefined;
  const anio = args.anio ? Number(args.anio) : undefined;
  const limit = Math.min(args.limit ? Number(args.limit) : DEFAULT_LIMIT, MAX_LIMIT);
  const offset = args.offset ? Number(args.offset) : 0;

  const conditions: string[] = [];
  const params: unknown[] = [];
  if (provincia) { params.push(provincia.toUpperCase()); conditions.push(`provincia_domicilio = $${params.length}`); }
  if (distrito) { params.push(distrito.toUpperCase()); conditions.push(`distrito_domicilio = $${params.length}`); }
  if (muerteViolenta) { params.push(muerteViolenta.toUpperCase()); conditions.push(`muerte_violenta = $${params.length}`); }
  if (anio !== undefined) { params.push(anio); conditions.push(`anio_defuncion = $${params.length}`); }
  const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

  const { rows: countRows } = await db.query<{ total: string }>(
    `SELECT COUNT(*) AS total FROM defunciones ${where}`,
    params
  );
  const total = Number(countRows[0]?.total ?? 0);

  const { rows } = await db.query<DefuncionRow>(
    `SELECT provincia_domicilio, distrito_domicilio, sexo, edad, fecha_defuncion, anio_defuncion, mes_defuncion,
            tipo_lugar, muerte_violenta, necropsia, causa_a, cie_a
     FROM defunciones
     ${where}
     ORDER BY anio_defuncion DESC NULLS LAST, mes_defuncion DESC NULLS LAST, id
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
        provincia: r.provincia_domicilio,
        distrito: r.distrito_domicilio,
        sexo: r.sexo,
        edad: r.edad,
        fechaDefuncion: r.fecha_defuncion,
        anioDefuncion: r.anio_defuncion,
        mesDefuncion: r.mes_defuncion,
        tipoLugar: r.tipo_lugar,
        muerteViolenta: r.muerte_violenta,
        necropsia: r.necropsia,
        causaA: r.causa_a,
        cieA: r.cie_a,
      })),
      meta: {
        cobertura: "La Libertad únicamente",
        limitacion: "Archivo fuente desactualizado desde 2026-05-06 — línea base histórica, no refleja el año en curso.",
        fuente: "SINADEF / MINSA",
      },
    },
  };
}

interface ResumenRow extends NeonRow {
  muerte_violenta: string | null;
  total: string;
}

/**
 * Handler para `sinadef_defunciones_resumen` — GET /api/defunciones/resumen.
 * Origen: apps/sinadef-defunciones/api/src/routes/defunciones.ts.
 */
export async function resumen(ctx: ToolHandlerContext): Promise<HandlerResult> {
  const { db, args } = ctx;
  const provincia = args.provincia as string | undefined;
  const anio = args.anio ? Number(args.anio) : undefined;

  const conditions: string[] = [];
  const params: unknown[] = [];
  if (provincia) { params.push(provincia.toUpperCase()); conditions.push(`provincia_domicilio = $${params.length}`); }
  if (anio !== undefined) { params.push(anio); conditions.push(`anio_defuncion = $${params.length}`); }
  const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

  const { rows } = await db.query<ResumenRow>(
    `SELECT muerte_violenta, COUNT(*) AS total
     FROM defunciones
     ${where}
     GROUP BY muerte_violenta
     ORDER BY total DESC`,
    params
  );

  return {
    status: 200,
    body: {
      filtros: { provincia: provincia ?? null, anio: anio ?? null },
      porCategoria: rows.map((r) => ({ muerteViolenta: r.muerte_violenta, total: Number(r.total) })),
      meta: {
        cobertura: "La Libertad únicamente",
        nota: "`muerte_violenta` es la clasificación del certificado de defunción, no una calificación forense ni una denuncia SIDPOL.",
      },
    },
  };
}
