import type { NeonRow } from "../../db/neon-pool.js";
import type { ToolHandlerContext, HandlerResult } from "../registry.js";

interface CandidatoRow extends NeonRow {
  dni: string;
  nombre_completo: string;
  cargo: string;
  tipo_eleccion: string;
  organizacion_politica: string;
  organizacion_estado: string;
  estado: string;
  ubigeo: string;
  departamento: string;
  provincia: string;
  distrito: string;
  posicion: number | null;
  sexo: string | null;
  edad: number | null;
  provincia_consejero: string | null;
  sentencias_declaradas: string | null;
  fetched_at: string;
}

// Mismo criterio ya usado en proveedores-sancionados/personas-sancionadas.ts y
// compras-publicas/conformacion.ts — el DNI se enmascara siempre en la
// respuesta pública.
function maskDni(dni: string): string {
  return `${"*".repeat(dni.length - 3)}${dni.slice(-3)}`;
}

/**
 * Handler para `candidatos_erm_candidatos` — GET /api/candidatos.
 * Origen: apps/candidatos-erm/api/src/routes/candidatos.ts. SQL idéntico.
 */
export async function list(ctx: ToolHandlerContext): Promise<HandlerResult> {
  const { db, args } = ctx;
  const dni = args.dni as string | undefined;
  const departamento = args.departamento as string | undefined;
  const provincia = args.provincia as string | undefined;
  const distrito = args.distrito as string | undefined;
  const ubigeo = args.ubigeo as string | undefined;
  const cargo = args.cargo as string | undefined;
  const organizacionPolitica = args.organizacionPolitica as string | undefined;
  const tipoEleccion = args.tipoEleccion as string | undefined;
  const estado = args.estado as string | undefined;
  const limit = args.limit ? Number(args.limit) : 200;
  const offset = args.offset ? Number(args.offset) : 0;

  const conditions: string[] = [];
  const params: unknown[] = [];

  if (dni) {
    params.push(dni);
    conditions.push(`c.dni = $${params.length}`);
  }
  if (departamento) {
    params.push(departamento.toUpperCase());
    conditions.push(`c.departamento = $${params.length}`);
  }
  if (provincia) {
    params.push(provincia.toUpperCase());
    conditions.push(`c.provincia = $${params.length}`);
  }
  if (distrito) {
    params.push(distrito.toUpperCase());
    conditions.push(`c.distrito = $${params.length}`);
  }
  if (ubigeo) {
    params.push(ubigeo);
    conditions.push(`c.ubigeo = $${params.length}`);
  }
  if (cargo) {
    params.push(`%${cargo}%`);
    conditions.push(`c.cargo ILIKE $${params.length}`);
  }
  if (organizacionPolitica) {
    params.push(`%${organizacionPolitica}%`);
    conditions.push(`c.organizacion_politica ILIKE $${params.length}`);
  }
  if (tipoEleccion) {
    params.push(tipoEleccion);
    conditions.push(`c.tipo_eleccion = $${params.length}`);
  }
  if (estado) {
    params.push(estado.toUpperCase());
    conditions.push(`c.estado = $${params.length}`);
  }
  const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

  const { rows: countRows } = await db.query<{ total: string }>(`SELECT COUNT(*) AS total FROM candidatos_erm c ${where}`, params);
  const total = Number(countRows[0].total);

  const { rows } = await db.query<CandidatoRow>(
    `SELECT c.dni, c.nombre_completo, c.cargo, c.tipo_eleccion, c.organizacion_politica,
            c.organizacion_estado, c.estado, c.ubigeo, c.departamento, c.provincia, c.distrito,
            c.posicion, c.sexo, c.edad, c.provincia_consejero, c.sentencias_declaradas, rb.fetched_at
     FROM candidatos_erm c
     JOIN raw_candidatos_erm_batches rb ON rb.id = c.source_batch_id
     ${where}
     ORDER BY c.departamento, c.provincia, c.distrito, c.cargo, c.posicion
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
        dniEnmascarado: maskDni(r.dni),
        nombreCompleto: r.nombre_completo,
        cargo: r.cargo,
        tipoEleccion: r.tipo_eleccion,
        organizacionPolitica: r.organizacion_politica,
        organizacionEstado: r.organizacion_estado,
        estado: r.estado,
        ubigeo: r.ubigeo,
        departamento: r.departamento,
        provincia: r.provincia,
        distrito: r.distrito,
        posicion: r.posicion,
        sexo: r.sexo,
        edad: r.edad,
        provinciaConsejero: r.provincia_consejero,
        sentenciasDeclaradas: r.sentencias_declaradas,
        fuente: { dataset: "Candidatos ERM 2026 (derivado de hojas de vida JNE, vía Datapol)", extraidoEl: r.fetched_at },
      })),
    },
  };
}
