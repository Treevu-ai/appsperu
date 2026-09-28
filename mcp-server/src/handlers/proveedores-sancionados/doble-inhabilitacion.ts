import type { NeonRow } from "../../db/neon-pool.js";
import type { ToolHandlerContext, HandlerResult } from "../registry.js";
import { vigenteEnFecha } from "./_helpers.js";

interface DobleInhabilitacionRow extends NeonRow {
  dni_comun: string | null;
  ruc_administrativo: string | null;
  razon_social: string | null;
  resolucion_administrativa: string | null;
  admin_desde: string | Date | null;
  admin_hasta: string | Date | null;
  admin_estado: string | null;
  ruc_dni_judicial: string | null;
  nombre_judicial: string | null;
  organo_jurisdiccional: string | null;
  resolucion_judicial: string | null;
  judicial_desde: string | Date | null;
  judicial_hasta: string | Date | null;
}

/**
 * Handler para `proveedores_sancionados_doble_inhabilitacion` —
 * GET /api/crossref/doble-inhabilitacion.
 *
 * JOIN real dentro de esta misma base, no un crosswalk fuzzy: ¿qué RUC/DNI tiene
 * sanción administrativa (Tribunal de Contrataciones) Y orden judicial (OECE)
 * simultáneamente? El cruce es por `dni` generado o por coincidencia exacta de
 * `ruc`/`ruc_dni` — nunca por nombre.
 *
 * "Vigente hoy" de AMBOS lados se calcula con `vigenteEnFecha` sobre el rango
 * real `[desde,hasta]`, no confiando en el campo `estado` de la fuente. `vigente`
 * es un `EstadoTemporal` (`true`/`false`/`"NO_VERIFICABLE"`), nunca un boolean
 * forzado por ausencia de dato.
 */
export async function list(ctx: ToolHandlerContext): Promise<HandlerResult> {
  const { db, args } = ctx;
  const ruc = args.ruc as string | undefined;
  const organoJurisdiccional = args.organoJurisdiccional as string | undefined;

  const conditions: string[] = [];
  const params: unknown[] = [];
  if (ruc) {
    params.push(ruc);
    // El parámetro acepta RUC completo O DNI de 8 dígitos — filtrar solo por
    // ruc/ruc_dni descartaba un DNI válido, porque el DNI de 8 dígitos nunca
    // calza esas columnas completas, solo las generadas `dni`.
    conditions.push(`(i.ruc = $${params.length} OR ij.ruc_dni = $${params.length} OR i.dni = $${params.length} OR ij.dni = $${params.length})`);
  }
  if (organoJurisdiccional) {
    params.push(`%${organoJurisdiccional}%`);
    conditions.push(`ij.organo_jurisdiccional ILIKE $${params.length}`);
  }
  const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

  const { rows } = await db.query<DobleInhabilitacionRow>(
    `SELECT
       COALESCE(ij.dni, i.dni) AS dni_comun,
       i.ruc AS ruc_administrativo,
       i.razon_social,
       i.resolucion AS resolucion_administrativa,
       i.desde AS admin_desde,
       i.hasta AS admin_hasta,
       i.estado AS admin_estado,
       ij.ruc_dni AS ruc_dni_judicial,
       ij.nombre AS nombre_judicial,
       ij.organo_jurisdiccional,
       ij.numero_resolucion AS resolucion_judicial,
       ij.fecha_inicio AS judicial_desde,
       ij.fecha_fin AS judicial_hasta
     FROM inhabilitaciones_judiciales ij
     JOIN inhabilitaciones i
       ON (ij.dni IS NOT NULL AND i.dni = ij.dni) OR i.ruc = ij.ruc_dni
     ${where}
     ORDER BY ij.fecha_inicio DESC NULLS LAST`,
    params
  );

  const hoy = new Date().toISOString().slice(0, 10);

  return {
    status: 200,
    body: {
      total: rows.length,
      resultados: rows.map((r) => {
        const administrativaVigente = vigenteEnFecha(hoy, r.admin_desde, r.admin_hasta);
        const judicialVigente = vigenteEnFecha(hoy, r.judicial_desde, r.judicial_hasta);
        return {
          // Solo los últimos 3 dígitos del DNI: es un identificador de cruce
          // interno, nunca se expone completo en una respuesta pública.
          dniComunEnmascarado: typeof r.dni_comun === "string" && r.dni_comun.length >= 3 ? `***${r.dni_comun.slice(-3)}` : null,
          administrativa: {
            ruc: r.ruc_administrativo,
            razonSocial: r.razon_social,
            resolucion: r.resolucion_administrativa,
            desde: r.admin_desde,
            hasta: r.admin_hasta,
            estado: r.admin_estado,
            vigente: administrativaVigente,
          },
          judicial: {
            rucDni: r.ruc_dni_judicial,
            nombre: r.nombre_judicial,
            organoJurisdiccional: r.organo_jurisdiccional,
            resolucion: r.resolucion_judicial,
            desde: r.judicial_desde,
            hasta: r.judicial_hasta,
            vigente: judicialVigente,
          },
          ambasVigentesHoy: administrativaVigente === true && judicialVigente === true,
        };
      }),
      limitation:
        "Coincidencia de identificador (RUC/DNI) entre dos bases legales distintas -- administrativa (Tribunal de Contrataciones) y judicial (Poder Judicial, vía OECE). No implica que ambas sanciones tengan el mismo origen ni el mismo hecho; son procesos independientes que resultaron en el mismo RUC/DNI. Universo judicial pequeño (14 filas al corte 2026-09-01) -- 0 resultados es una respuesta esperada, no un error.",
    },
  };
}
