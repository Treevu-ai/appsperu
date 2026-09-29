import type { NeonRow } from "../../db/neon-pool.js";
import type { ToolHandlerContext, HandlerResult } from "../registry.js";

interface ProjectRow extends NeonRow {
  vertix_id: number;
  slug: string;
  tipo_proyecto: string;
  nombre: string;
  estado: string;
  fase: string;
  titular: string;
  sector: string;
  cartera: string;
  modalidad: string;
  modalidad_contractual: string;
  monto_inversion_sigv: number | string | null;
  monto_proyecto: string | null;
  green_brownfield: string | null;
  departamentos: string[] | null;
  url_thumb: string | null;
  fetched_at: string;
}

interface ProjectDetailRow extends ProjectRow {
  nombre_corto: string | null;
  iniciativa: string | null;
  buena_pro_prevista: string | null;
  anho_concesion: string | null;
  departamentos_inei: string[] | null;
  url_geo: string | null;
}

/**
 * Handler para `inversion_privada_projects` — GET /api/projects.
 *
 * SQL idéntico a `apps/inversion-privada/api/src/routes/projects.ts`.
 */
export async function list(ctx: ToolHandlerContext): Promise<HandlerResult> {
  const { db, args } = ctx;
  const departamento = args.departamento as string | undefined;
  const sector = args.sector as string | undefined;
  const tipo = args.tipo as string | undefined;
  const titular = args.titular as string | undefined;
  const fase = args.fase as string | undefined;

  const conditions: string[] = [];
  const values: unknown[] = [];

  if (departamento) {
    values.push(departamento.trim().toUpperCase());
    conditions.push(`$${values.length} = ANY(p.departamentos)`);
  }
  if (sector) {
    values.push(sector);
    conditions.push(`p.sector ILIKE $${values.length}`);
  }
  if (tipo) {
    values.push(tipo);
    conditions.push(`p.tipo_proyecto = $${values.length}`);
  }
  if (titular) {
    values.push(`%${titular}%`);
    conditions.push(`p.titular ILIKE $${values.length}`);
  }
  if (fase) {
    values.push(fase);
    conditions.push(`p.fase ILIKE $${values.length}`);
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

  const { rows } = await db.query<ProjectRow>(
    `SELECT p.vertix_id, p.slug, p.tipo_proyecto, p.nombre, p.estado, p.fase, p.titular, p.sector,
            p.cartera, p.modalidad, p.modalidad_contractual, p.monto_inversion_sigv, p.monto_proyecto,
            p.green_brownfield, p.departamentos, p.url_thumb, rb.fetched_at
     FROM private_investment_projects p
     JOIN raw_vertix_batches rb ON rb.id = p.source_batch_id
     ${where}
     ORDER BY p.monto_inversion_sigv DESC NULLS LAST, p.nombre
     LIMIT 1000`,
    values,
  );

  const { rows: metaRows } = await db.query<{ records_total: number; fetched_at: string }>(
    `SELECT records_total, fetched_at FROM raw_vertix_batches ORDER BY fetched_at DESC LIMIT 1`,
  );
  const latest = metaRows[0];

  return {
    status: 200,
    body: {
      resultados: rows.map((r) => ({
        vertixId: r.vertix_id,
        slug: r.slug,
        tipoProyecto: r.tipo_proyecto,
        nombre: r.nombre,
        estado: r.estado,
        fase: r.fase,
        titular: r.titular,
        sector: r.sector,
        cartera: r.cartera,
        modalidad: r.modalidad,
        modalidadContractual: r.modalidad_contractual,
        montoInversionSigv: r.monto_inversion_sigv === null ? null : Number(r.monto_inversion_sigv),
        montoProyecto: r.monto_proyecto,
        greenBrownfield: r.green_brownfield,
        departamentos: r.departamentos,
        urlThumb: r.url_thumb,
        fuente: {
          dataset: "PROINVERSIÓN / VERTIX (investinperu.pe)",
          extraidoEl: r.fetched_at,
        },
      })),
      cobertura: "cartera_vertix_app_pa",
      isPartial: latest ? rows.length < latest.records_total : true,
      recordsTotalFuente: latest?.records_total ?? null,
      extraidoEl: latest?.fetched_at ?? null,
    },
  };
}

/**
 * Handler para `inversion_privada_project_by_id` — GET /api/projects/{vertixId}.
 */
export async function byId(ctx: ToolHandlerContext): Promise<HandlerResult> {
  const { db, args } = ctx;
  const vertixId = Number(args.vertixId);
  if (!Number.isInteger(vertixId) || vertixId <= 0) {
    return { status: 400, body: { error: "vertixId inválido." } };
  }

  const { rows } = await db.query<ProjectDetailRow>(
    `SELECT p.*, rb.fetched_at
     FROM private_investment_projects p
     JOIN raw_vertix_batches rb ON rb.id = p.source_batch_id
     WHERE p.vertix_id = $1`,
    [vertixId],
  );

  if (rows.length === 0) {
    return { status: 404, body: { error: "Proyecto no encontrado." } };
  }

  const r = rows[0];
  return {
    status: 200,
    body: {
      vertixId: r.vertix_id,
      slug: r.slug,
      tipoProyecto: r.tipo_proyecto,
      nombre: r.nombre,
      nombreCorto: r.nombre_corto,
      estado: r.estado,
      fase: r.fase,
      titular: r.titular,
      sector: r.sector,
      cartera: r.cartera,
      modalidad: r.modalidad,
      modalidadContractual: r.modalidad_contractual,
      iniciativa: r.iniciativa,
      montoInversionSigv: r.monto_inversion_sigv === null ? null : Number(r.monto_inversion_sigv),
      montoProyecto: r.monto_proyecto,
      greenBrownfield: r.green_brownfield,
      buenaProPrevista: r.buena_pro_prevista,
      anhoConcesion: r.anho_concesion,
      departamentos: r.departamentos,
      departamentosInei: r.departamentos_inei,
      urlThumb: r.url_thumb,
      urlGeo: r.url_geo,
      fuente: { dataset: "PROINVERSIÓN / VERTIX", extraidoEl: r.fetched_at },
    },
  };
}
