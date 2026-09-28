import type { NeonRow, NeonPool } from "../../db/neon-pool.js";
import type { ToolHandlerContext, HandlerResult } from "../registry.js";
import { crossAppPool } from "../proveedores-sancionados/_helpers.js";

interface ServiceRow extends NeonRow {
  service_id: string;
  service_type: "INFRAESTRUCTURA" | "ALIMENTACION";
  service_name: string;
  responsible_entity: string;
  period_label: string;
  department: string;
  cui: string | null;
  cui_status: string;
  work_code: string | null;
  work_status: string;
  beneficiary_students: string | number | null;
  beneficiary_schools: string | number | null;
  purchase_committees: string | number | null;
  published_lots: string | number | null;
  awarded_lots: string | number | null;
  delivery_evidence_status: string;
  verification_status: string;
  observed_at: string | Date;
  limitation: string;
  sources: Array<{ label: string; url: string; detail: string }>;
  territories: Array<{ departamento: string; provincia: string | null; distrito: string | null; estado: string }>;
  proveedores_oficiales: string | number;
  entregas_evidenciadas: string | number;
}

function numeric(value: unknown): number | null {
  return value === null || value === undefined ? null : Number(value);
}

function sourceDate(value: string | Date): string {
  return value instanceof Date ? value.toISOString().slice(0, 10) : value;
}

interface WorksEntry {
  estado: string;
  resultados: unknown[];
}

async function worksByCui(cuis: string[], infobrasDb: NeonPool | null): Promise<Map<string, WorksEntry>> {
  if (cuis.length === 0) return new Map<string, WorksEntry>();
  if (!infobrasDb) return new Map(cuis.map((cui) => [cui, { estado: "INFOBRAS_NO_CONFIGURADO", resultados: [] }]));
  const { rows } = await infobrasDb.query<NeonRow>(
    `SELECT codigo_infobras,cui,nombre_obra,estado_ejecucion,departamento,provincia,distrito,
            avance_fisico_real_pct,ejecucion_financiera_pct,existe_paralizacion
       FROM public_works WHERE cui=ANY($1) ORDER BY codigo_infobras`,
    [cuis]
  );
  const result = new Map<string, WorksEntry>(
    cuis.map((cui) => [cui, { estado: "SIN_OBRA_INFOBRAS_PARA_CUI", resultados: [] as unknown[] }])
  );
  for (const row of rows) {
    const cui = row.cui as string;
    const current = result.get(cui) ?? { estado: "CUI_EXACTO", resultados: [] as unknown[] };
    current.estado = "CUI_EXACTO";
    current.resultados.push({
      codigoInfobras: row.codigo_infobras, cui, nombre: row.nombre_obra, estadoEjecucion: row.estado_ejecucion,
      departamento: row.departamento, provincia: row.provincia, distrito: row.distrito,
      avanceFisicoRealPct: numeric(row.avance_fisico_real_pct), ejecucionFinancieraPct: numeric(row.ejecucion_financiera_pct),
      existeParalizacion: row.existe_paralizacion,
    });
    result.set(cui, current);
  }
  return result;
}

async function supplierCompliance(ruc: string, fiscalDb: NeonPool | null, sancionesDb: NeonPool | null) {
  const fiscal = fiscalDb
    ? await fiscalDb
        .query<NeonRow>(
          "SELECT ruc,razon_social,estado_contribuyente,condicion_domicilio,ubigeo FROM contribuyentes WHERE ruc=$1",
          [ruc]
        )
        .then(({ rows }) => ({ estado: "CONSULTADO_POR_RUC_EXACTO", resultado: rows[0] ?? null }))
    : { estado: "IDENTIDAD_FISCAL_NO_CONFIGURADA", resultado: null };

  const sanciones = sancionesDb
    ? await sancionesDb
        .query<NeonRow>(
          `SELECT 'INHABILITACION' AS tipo,resolucion,desde,hasta,estado,razon_social,NULL::numeric AS monto_multa
             FROM inhabilitaciones WHERE ruc=$1
           UNION ALL
           SELECT 'MULTA' AS tipo,resolucion,desde,hasta,estado,razon_social,monto_multa
             FROM multas WHERE ruc=$1
           ORDER BY desde DESC NULLS LAST`,
          [ruc]
        )
        .then(({ rows }) => ({ estado: "CONSULTADO_POR_RUC_EXACTO", resultados: rows.map((row) => ({ ...row, monto_multa: numeric(row.monto_multa) })) }))
    : { estado: "SANCIONES_NO_CONFIGURADAS", resultados: [] as unknown[] };

  return { fiscal, sanciones };
}

async function services(
  db: NeonPool,
  departamento: string,
  tipo?: string,
  serviceId?: string
): Promise<ServiceRow[]> {
  const params: unknown[] = [departamento.toUpperCase()];
  const filters = ["r.department=$1"];
  if (tipo) {
    params.push(tipo);
    filters.push(`r.service_type=$${params.length}`);
  }
  if (serviceId) {
    params.push(serviceId);
    filters.push(`r.service_id=$${params.length}`);
  }
  const { rows } = await db.query<ServiceRow>(
    `SELECT r.*,
            COALESCE((SELECT jsonb_agg(jsonb_build_object('label',s.label,'url',s.url,'detail',s.detail) ORDER BY s.source_id)
                        FROM care_service_sources s WHERE s.service_id=r.service_id), '[]'::jsonb) AS sources,
            COALESCE((SELECT jsonb_agg(jsonb_build_object('departamento',t.department,'provincia',t.province,'distrito',t.district,'estado',t.territory_status) ORDER BY t.province,t.district)
                        FROM care_service_territories t WHERE t.service_id=r.service_id), '[]'::jsonb) AS territories,
            (SELECT COUNT(*) FROM care_service_supplier_links sl WHERE sl.service_id=r.service_id AND sl.link_status='VINCULO_OFICIAL') AS proveedores_oficiales,
            (SELECT COUNT(*) FROM care_service_delivery_evidence de WHERE de.service_id=r.service_id) AS entregas_evidenciadas
       FROM care_service_records r
      WHERE ${filters.join(" AND ")}
      ORDER BY r.service_type,r.observed_at DESC,r.service_id`,
    params
  );
  return rows;
}

function mapService(row: ServiceRow, works: Map<string, WorksEntry>) {
  const work = row.cui
    ? works.get(row.cui) ?? { estado: "SIN_OBRA_INFOBRAS_PARA_CUI", resultados: [] }
    : { estado: row.work_status, resultados: [] };
  return {
    id: row.service_id,
    tipo: row.service_type,
    servicio: row.service_name,
    entidadResponsable: row.responsible_entity,
    periodo: row.period_label,
    departamento: row.department,
    infraestructura: {
      cui: row.cui,
      estadoCui: row.cui_status,
      codigoInfobras: row.work_code,
      estadoObra: work.estado,
      obras: work.resultados,
    },
    atencion: {
      estudiantesPublicados: numeric(row.beneficiary_students),
      institucionesPublicadas: numeric(row.beneficiary_schools),
      comitesCompraPublicados: numeric(row.purchase_committees),
      lotesPublicados: numeric(row.published_lots),
      lotesAdjudicadosPublicados: numeric(row.awarded_lots),
      estadoEvidenciaEntrega: row.delivery_evidence_status,
      entregasEvidenciadas: Number(row.entregas_evidenciadas),
    },
    proveedores: {
      proveedoresConRucVinculadoOficialmente: Number(row.proveedores_oficiales),
      estado: Number(row.proveedores_oficiales) > 0 ? "RUC_OFICIALES_DISPONIBLES" : "SIN_RUC_OFICIALMENTE_VINCULADO",
    },
    territorios: row.territories,
    fuentes: row.sources,
    verificacion: { estado: row.verification_status, fechaObservacion: sourceDate(row.observed_at) },
    limitacion: row.limitation,
  };
}

/**
 * Handler para `radar_ejecucion_care_services` — GET /api/servicios-que-cuidan.
 */
export async function list(ctx: ToolHandlerContext): Promise<HandlerResult> {
  const { db, args, env } = ctx;
  const tipo = args.tipo as string | undefined;
  const departamento = (args.departamento as string | undefined) ?? "LA LIBERTAD";

  const infobrasDb = crossAppPool("infobras", env);
  const rows = await services(db, departamento, tipo);
  const works = await worksByCui(
    rows.flatMap((row) => (row.cui ? [row.cui] : [])),
    infobrasDb
  );

  return {
    status: 200,
    body: {
      tablero: "servicios_que_cuidan",
      filtros: { tipo: tipo ?? null, departamento: departamento.toUpperCase() },
      resultados: rows.map((row) => mapService(row, works)),
      limitation: "El registro solo muestra CUI, obra, RUC, lote y entrega cuando hay una fuente oficial que los vincula. La ausencia de una fila no prueba ausencia del servicio ni incumplimiento.",
    },
  };
}

/**
 * Handler para `radar_ejecucion_care_service_by_id` — GET /api/servicios-que-cuidan/:serviceId.
 */
export async function byId(ctx: ToolHandlerContext): Promise<HandlerResult> {
  const { db, args, env } = ctx;
  const serviceId = args.serviceId as string;
  const departamento = (args.departamento as string | undefined) ?? "LA LIBERTAD";

  const infobrasDb = crossAppPool("infobras", env);
  const fiscalDb = crossAppPool("identidad-fiscal", env);
  const sancionesDb = crossAppPool("proveedores-sancionados", env);

  const rows = await services(db, departamento, undefined, serviceId);
  if (rows.length === 0) {
    return { status: 404, body: { error: "Servicio no encontrado en el registro de evidencia." } };
  }
  const row = rows[0];
  const works = await worksByCui(row.cui ? [row.cui] : [], infobrasDb);

  const { rows: supplierRows } = await db.query<NeonRow>(
    `SELECT ruc,supplier_name,lot_id,product_or_service,contract_reference,evidence_url,evidence_detail,observed_at
       FROM care_service_supplier_links
      WHERE service_id=$1 AND link_status='VINCULO_OFICIAL'
      ORDER BY lot_id NULLS LAST,supplier_name`,
    [row.service_id]
  );
  const { rows: deliveryRows } = await db.query<NeonRow>(
    `SELECT school_code,school_name,department,province,district,delivery_date,delivery_status,evidence_url,evidence_detail,observed_at
       FROM care_service_delivery_evidence WHERE service_id=$1 ORDER BY delivery_date DESC NULLS LAST,delivery_id`,
    [row.service_id]
  );

  const mapped = mapService(row, works);
  const providers = [];
  for (const supplier of supplierRows) {
    providers.push({
      ruc: supplier.ruc,
      proveedor: supplier.supplier_name,
      lote: supplier.lot_id,
      productoOServicio: supplier.product_or_service,
      referenciaContrato: supplier.contract_reference,
      evidencia: { url: supplier.evidence_url, detalle: supplier.evidence_detail, fechaObservacion: sourceDate(supplier.observed_at as string | Date) },
      cumplimiento: await supplierCompliance(supplier.ruc as string, fiscalDb, sancionesDb),
    });
  }

  return {
    status: 200,
    body: {
      ...mapped,
      proveedores: { ...mapped.proveedores, resultados: providers },
      entregas: deliveryRows.map((delivery) => ({
        codigoColegio: delivery.school_code,
        colegio: delivery.school_name,
        departamento: delivery.department,
        provincia: delivery.province,
        distrito: delivery.district,
        fechaEntrega: delivery.delivery_date,
        estado: delivery.delivery_status,
        evidencia: { url: delivery.evidence_url, detalle: delivery.evidence_detail, fechaObservacion: sourceDate(delivery.observed_at as string | Date) },
      })),
      limitation: "Cumplimiento tributario y sanciones se consultan por RUC exacto, si las bases opcionales están configuradas. Una sanción vigente debe contrastarse con sus fechas y no se retroproyecta automáticamente a una adjudicación pasada.",
    },
  };
}
