import type { NeonRow } from "../../db/neon-pool.js";
import type { ToolHandlerContext, HandlerResult } from "../registry.js";

interface InfraccionRow extends NeonRow {
  nombre_administrado: string;
  tipo_doc: string;
  id_doc_administrado: string;
  id_doc_enmascarado: string;
  unidad_fiscalizable: string;
  subsector_economico: string;
  departamento: string;
  provincia: string;
  distrito: string;
  nro_expediente: string;
  nro_rd: string;
  fecha_rd: string | null;
  detalle_infraccion: string;
  tipo_sancion: string;
  tipo_infraccion: string;
  medida_dictada: string;
  cantidad_multa: number | string | null;
  cantidad_infracciones: number | null;
  fecha_corte: string | null;
  fetched_at: string;
}

/**
 * Handler para `infracciones_ambientales_infracciones` — GET /api/infracciones.
 *
 * Origen: apps/infracciones-ambientales/api/src/routes/infracciones.ts. SQL
 * idéntico (mismos alias `i`/`rb`, mismo ILIKE, mismo ORDER BY).
 */
export async function list(ctx: ToolHandlerContext): Promise<HandlerResult> {
  const { db, args } = ctx;
  const departamento = args.departamento as string | undefined;
  const provincia = args.provincia as string | undefined;
  const distrito = args.distrito as string | undefined;
  const subsectorEconomico = args.subsectorEconomico as string | undefined;
  const administrado = args.administrado as string | undefined;
  const limit = args.limit ? Number(args.limit) : 200;
  const offset = args.offset ? Number(args.offset) : 0;

  const conditions: string[] = [];
  const params: unknown[] = [];
  const addIlike = (column: string, value: string) => {
    params.push(`%${value}%`);
    conditions.push(`${column} ILIKE $${params.length}`);
  };

  if (departamento) addIlike("i.departamento", departamento);
  if (provincia) addIlike("i.provincia", provincia);
  if (distrito) addIlike("i.distrito", distrito);
  if (subsectorEconomico) addIlike("i.subsector_economico", subsectorEconomico);
  if (administrado) addIlike("i.nombre_administrado", administrado);
  const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

  const { rows: countRows } = await db.query<{ total: string }>(
    `SELECT COUNT(*) AS total FROM infracciones_ambientales i ${where}`,
    params
  );
  const total = Number(countRows[0].total);

  const { rows } = await db.query<InfraccionRow>(
    `SELECT i.nombre_administrado, i.tipo_doc, i.id_doc_administrado, i.id_doc_enmascarado,
            i.unidad_fiscalizable, i.subsector_economico, i.departamento, i.provincia, i.distrito,
            i.nro_expediente, i.nro_rd, i.fecha_rd, i.detalle_infraccion, i.tipo_sancion,
            i.tipo_infraccion, i.medida_dictada, i.cantidad_multa, i.cantidad_infracciones,
            i.fecha_corte, rb.fetched_at
     FROM infracciones_ambientales i
     JOIN raw_ruias_batches rb ON rb.id = i.source_batch_id
     ${where}
     ORDER BY i.fecha_rd DESC NULLS LAST
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
        administrado: {
          nombre: r.nombre_administrado,
          tipoDocumento: r.tipo_doc,
          numeroDocumento: r.id_doc_administrado,
          documentoEnmascarado: r.id_doc_enmascarado,
        },
        unidadFiscalizable: r.unidad_fiscalizable,
        subsectorEconomico: r.subsector_economico,
        departamento: r.departamento,
        provincia: r.provincia,
        distrito: r.distrito,
        expediente: r.nro_expediente,
        resolucion: r.nro_rd,
        fechaResolucion: r.fecha_rd,
        detalleInfraccion: r.detalle_infraccion,
        tipoSancion: r.tipo_sancion,
        tipoInfraccion: r.tipo_infraccion,
        medidaDictada: r.medida_dictada,
        cantidadMulta: r.cantidad_multa === null ? null : Number(r.cantidad_multa),
        cantidadInfracciones: r.cantidad_infracciones,
        fechaCorte: r.fecha_corte,
        fuente: { dataset: "OEFA - RUIAS (Registro Único de Infractores Ambientales Sancionados)", extraidoEl: r.fetched_at },
      })),
    },
  };
}
