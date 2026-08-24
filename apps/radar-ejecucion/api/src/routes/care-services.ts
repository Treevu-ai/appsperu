import { Router } from "express";
import { z } from "zod";
import { pool } from "../db/pool.js";
import { identidadFiscalPool, infobrasPool, sancionesPool } from "../db/external-pools.js";
import { asyncHandler } from "../lib/async-handler.js";
import { parseQuery } from "../lib/validate-query.js";

export const careServicesRouter = Router();

const CatalogQuery = z.object({
  tipo: z.enum(["INFRAESTRUCTURA", "ALIMENTACION"]).optional(),
  departamento: z.string().min(1).default("LA LIBERTAD"),
});

type ServiceRow = {
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
};

function numeric(value: unknown): number | null {
  return value === null || value === undefined ? null : Number(value);
}

function sourceDate(value: string | Date): string {
  return value instanceof Date ? value.toISOString().slice(0, 10) : value;
}

async function worksByCui(cuis: string[]) {
  if (cuis.length === 0) return new Map<string, { estado: string; resultados: unknown[] }>();
  if (!infobrasPool) return new Map(cuis.map((cui) => [cui, { estado: "INFOBRAS_NO_CONFIGURADO", resultados: [] }]));
  const { rows } = await infobrasPool.query(
    `SELECT codigo_infobras,cui,nombre_obra,estado_ejecucion,departamento,provincia,distrito,
            avance_fisico_real_pct,ejecucion_financiera_pct,existe_paralizacion
       FROM public_works WHERE cui=ANY($1) ORDER BY codigo_infobras`,
    [cuis],
  );
  const result = new Map(cuis.map((cui) => [cui, { estado: "SIN_OBRA_INFOBRAS_PARA_CUI", resultados: [] as unknown[] }]));
  for (const row of rows) {
    const current = result.get(row.cui) ?? { estado: "CUI_EXACTO", resultados: [] as unknown[] };
    current.estado = "CUI_EXACTO";
    current.resultados.push({
      codigoInfobras: row.codigo_infobras, cui: row.cui, nombre: row.nombre_obra, estadoEjecucion: row.estado_ejecucion,
      departamento: row.departamento, provincia: row.provincia, distrito: row.distrito,
      avanceFisicoRealPct: numeric(row.avance_fisico_real_pct), ejecucionFinancieraPct: numeric(row.ejecucion_financiera_pct),
      existeParalizacion: row.existe_paralizacion,
    });
    result.set(row.cui, current);
  }
  return result;
}

async function supplierCompliance(ruc: string) {
  const fiscal = identidadFiscalPool
    ? await identidadFiscalPool.query(
      "SELECT ruc,razon_social,estado_contribuyente,condicion_domicilio,ubigeo FROM contribuyentes WHERE ruc=$1", [ruc],
    ).then(({ rows }) => ({ estado: "CONSULTADO_POR_RUC_EXACTO", resultado: rows[0] ?? null }))
    : { estado: "IDENTIDAD_FISCAL_NO_CONFIGURADA", resultado: null };

  const sanciones = sancionesPool
    ? await sancionesPool.query(
      `SELECT 'INHABILITACION' AS tipo,resolucion,desde,hasta,estado,razon_social,NULL::numeric AS monto_multa
         FROM inhabilitaciones WHERE ruc=$1
       UNION ALL
       SELECT 'MULTA' AS tipo,resolucion,desde,hasta,estado,razon_social,monto_multa
         FROM multas WHERE ruc=$1
       ORDER BY desde DESC NULLS LAST`, [ruc],
    ).then(({ rows }) => ({ estado: "CONSULTADO_POR_RUC_EXACTO", resultados: rows.map((row) => ({ ...row, monto_multa: numeric(row.monto_multa) })) }))
    : { estado: "SANCIONES_NO_CONFIGURADAS", resultados: [] as unknown[] };

  return { fiscal, sanciones };
}

async function services(query: z.infer<typeof CatalogQuery>, serviceId?: string): Promise<ServiceRow[]> {
  const params: unknown[] = [query.departamento.toUpperCase()];
  const filters = ["r.department=$1"];
  if (query.tipo) { params.push(query.tipo); filters.push(`r.service_type=$${params.length}`); }
  if (serviceId) { params.push(serviceId); filters.push(`r.service_id=$${params.length}`); }
  const { rows } = await pool.query<ServiceRow>(
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
    params,
  );
  return rows;
}

function mapService(row: ServiceRow, works: Map<string, { estado: string; resultados: unknown[] }>) {
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

careServicesRouter.get("/", asyncHandler(async (req, res) => {
  const query = parseQuery(CatalogQuery, req.query, res); if (!query) return;
  const rows = await services(query);
  const works = await worksByCui(rows.flatMap((row) => row.cui ? [row.cui] : []));
  res.json({
    tablero: "servicios_que_cuidan",
    filtros: { tipo: query.tipo ?? null, departamento: query.departamento.toUpperCase() },
    resultados: rows.map((row) => mapService(row, works)),
    limitation: "El registro solo muestra CUI, obra, RUC, lote y entrega cuando hay una fuente oficial que los vincula. La ausencia de una fila no prueba ausencia del servicio ni incumplimiento.",
  });
}));

careServicesRouter.get("/:serviceId", asyncHandler(async (req, res) => {
  const query = parseQuery(CatalogQuery.omit({ tipo: true }), req.query, res); if (!query) return;
  const rows = await services(query, req.params.serviceId);
  if (rows.length === 0) { res.status(404).json({ error: "Servicio no encontrado en el registro de evidencia." }); return; }
  const row = rows[0];
  const works = await worksByCui(row.cui ? [row.cui] : []);
  const { rows: supplierRows } = await pool.query<{ ruc: string; supplier_name: string; lot_id: string | null; product_or_service: string; contract_reference: string | null; evidence_url: string; evidence_detail: string; observed_at: string | Date }>(
    `SELECT ruc,supplier_name,lot_id,product_or_service,contract_reference,evidence_url,evidence_detail,observed_at
       FROM care_service_supplier_links
      WHERE service_id=$1 AND link_status='VINCULO_OFICIAL'
      ORDER BY lot_id NULLS LAST,supplier_name`, [row.service_id],
  );
  const { rows: deliveryRows } = await pool.query(
    `SELECT school_code,school_name,department,province,district,delivery_date,delivery_status,evidence_url,evidence_detail,observed_at
       FROM care_service_delivery_evidence WHERE service_id=$1 ORDER BY delivery_date DESC NULLS LAST,delivery_id`, [row.service_id],
  );
  const providers = await Promise.all(supplierRows.map(async (supplier) => ({
    ruc: supplier.ruc, proveedor: supplier.supplier_name, lote: supplier.lot_id, productoOServicio: supplier.product_or_service,
    referenciaContrato: supplier.contract_reference, evidencia: { url: supplier.evidence_url, detalle: supplier.evidence_detail, fechaObservacion: sourceDate(supplier.observed_at) },
    cumplimiento: await supplierCompliance(supplier.ruc),
  })));
  res.json({
    ...mapService(row, works),
    proveedores: { ...mapService(row, works).proveedores, resultados: providers },
    entregas: deliveryRows.map((delivery) => ({
      codigoColegio: delivery.school_code, colegio: delivery.school_name, departamento: delivery.department,
      provincia: delivery.province, distrito: delivery.district, fechaEntrega: delivery.delivery_date,
      estado: delivery.delivery_status, evidencia: { url: delivery.evidence_url, detalle: delivery.evidence_detail, fechaObservacion: sourceDate(delivery.observed_at) },
    })),
    limitation: "Cumplimiento tributario y sanciones se consultan por RUC exacto, si las bases opcionales están configuradas. Una sanción vigente debe contrastarse con sus fechas y no se retroproyecta automáticamente a una adjudicación pasada.",
  });
}));
