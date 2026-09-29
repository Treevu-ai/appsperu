import type { NeonRow } from "../../db/neon-pool.js";
import type { ToolHandlerContext, HandlerResult } from "../registry.js";

const DEFAULT_LIMIT = 200;
const MAX_LIMIT = 1000;

interface TrayectoriaRow extends NeonRow {
  cod_mod: string;
  anexo: string;
  anio: number;
  nombre: string | null;
  ubigeo: string | null;
  departamento: string | null;
  provincia: string | null;
  distrito: string | null;
  total_estudiantes: number;
  matriculado: number;
  aprobado: number;
  desaprobado: number | null;
  promocion_guiada: number | null;
  retirado: number;
  fallecido: number;
  tot_atraso: number;
}

/**
 * Handler para `instituciones_educativas_trayectoria` — GET /api/trayectoria.
 * SQL idéntico a `apps/instituciones-educativas/api/src/routes/trayectoria.ts`.
 */
export async function trayectoria(ctx: ToolHandlerContext): Promise<HandlerResult> {
  const { db, args } = ctx;
  const codMod = args.codMod as string | undefined;
  const anio = args.anio !== undefined ? Number(args.anio) : undefined;
  const departamento = args.departamento as string | undefined;
  const provincia = args.provincia as string | undefined;
  const distrito = args.distrito as string | undefined;
  const ubigeo = args.ubigeo as string | undefined;
  const limit = Math.min(args.limit !== undefined ? Number(args.limit) : DEFAULT_LIMIT, MAX_LIMIT);
  const offset = args.offset !== undefined ? Number(args.offset) : 0;

  const conditions: string[] = [];
  const params: unknown[] = [];
  const addParam = (value: unknown) => {
    params.push(value);
    return `$${params.length}`;
  };

  conditions.push(`t.anio = COALESCE(${anio !== undefined ? addParam(anio) : "NULL"}, (SELECT MAX(anio) FROM siagie_trayectoria))`);
  if (codMod) conditions.push(`t.cod_mod = ${addParam(codMod)}`);
  if (ubigeo) conditions.push(`i.ubigeo = ${addParam(ubigeo)}`);
  if (departamento) conditions.push(`i.departamento ILIKE ${addParam(`%${departamento}%`)}`);
  if (provincia) conditions.push(`i.provincia ILIKE ${addParam(`%${provincia}%`)}`);
  if (distrito) conditions.push(`i.distrito ILIKE ${addParam(`%${distrito}%`)}`);

  const whereSql = conditions.join(" AND ");
  const joinSql = "FROM siagie_trayectoria t LEFT JOIN instituciones_educativas i ON i.cod_mod = t.cod_mod AND i.anexo = t.anexo";
  const listParams = [...params];
  const limitPlaceholder = `$${listParams.push(limit)}`;
  const offsetPlaceholder = `$${listParams.push(offset)}`;

  const [{ rows: countRows }, { rows }] = await Promise.all([
    db.query<{ total: string }>(
      `SELECT COUNT(*) AS total FROM (SELECT 1 ${joinSql} WHERE ${whereSql} GROUP BY t.cod_mod, t.anexo) sub`,
      params
    ),
    db.query<TrayectoriaRow>(
      `SELECT t.cod_mod, t.anexo, t.anio,
              COALESCE(i.nombre, MAX(t.nombre)) AS nombre,
              i.ubigeo, i.departamento, i.provincia, i.distrito,
              SUM(t.total_estudiantes)::int AS total_estudiantes,
              SUM(t.matriculado)::int AS matriculado,
              SUM(t.aprobado)::int AS aprobado,
              SUM(t.desaprobado)::int AS desaprobado,
              SUM(t.promocion_guiada)::int AS promocion_guiada,
              SUM(t.retirado)::int AS retirado,
              SUM(t.fallecido)::int AS fallecido,
              SUM(t.tot_atraso)::int AS tot_atraso
       ${joinSql}
       WHERE ${whereSql}
       GROUP BY t.cod_mod, t.anexo, t.anio, i.nombre, i.ubigeo, i.departamento, i.provincia, i.distrito
       ORDER BY t.cod_mod, t.anexo
       LIMIT ${limitPlaceholder} OFFSET ${offsetPlaceholder}`,
      listParams
    ),
  ]);

  const totalGrupos = Number(countRows[0].total);

  return {
    status: 200,
    body: {
      total: totalGrupos,
      limit,
      offset,
      hasMore: offset + rows.length < totalGrupos,
      resultados: rows.map((r) => {
        const total = Number(r.total_estudiantes);
        return {
          codMod: r.cod_mod,
          anexo: r.anexo,
          anio: r.anio,
          nombre: r.nombre,
          ubigeo: r.ubigeo,
          departamento: r.departamento,
          provincia: r.provincia,
          distrito: r.distrito,
          totalEstudiantes: total,
          matriculado: Number(r.matriculado),
          aprobado: Number(r.aprobado),
          desaprobado: r.desaprobado === null ? null : Number(r.desaprobado),
          promocionGuiada: r.promocion_guiada === null ? null : Number(r.promocion_guiada),
          retirado: Number(r.retirado),
          fallecido: Number(r.fallecido),
          totAtraso: Number(r.tot_atraso),
          tasaAtraso: total > 0 ? Number(r.tot_atraso) / total : null,
          tasaRetiro: total > 0 ? Number(r.retirado) / total : null,
        };
      }),
      fuente: {
        dataset: "SIAGIE/MINEDU - Matriculación y Trayectoria Estudiantil",
        nota: "Agregado por servicio educativo (código modular) y año. Sin dato de alumno individual.",
      },
    },
  };
}
