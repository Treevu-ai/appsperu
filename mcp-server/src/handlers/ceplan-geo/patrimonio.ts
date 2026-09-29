import type { NeonRow } from "../../db/neon-pool.js";
import type { ToolHandlerContext, HandlerResult } from "../registry.js";

/**
 * Handler para `ceplan_geo_patrimonio_predios` — GET /api/patrimonio/predios.
 * Idéntico a `apps/ceplan-geo/api/src/routes/patrimonio.ts`.
 */
export async function predios(ctx: ToolHandlerContext): Promise<HandlerResult> {
  const { db, args } = ctx;
  const departamento = args.departamento as string | undefined;
  const provincia = args.provincia as string | undefined;
  const distrito = args.distrito as string | undefined;

  const conditions: string[] = [];
  const params: unknown[] = [];
  if (departamento) {
    params.push(departamento.toUpperCase());
    conditions.push(`departamento = $${params.length}`);
  }
  if (provincia) {
    params.push(provincia.toUpperCase());
    conditions.push(`provincia = $${params.length}`);
  }
  if (distrito) {
    params.push(distrito.toUpperCase());
    conditions.push(`distrito = $${params.length}`);
  }
  const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

  const { rows } = await db.query<NeonRow>(
    `SELECT numero_informe, fecha_emision, actividad, departamento, provincia, distrito,
            cus, area_supervisada_m2, resultado_supervision, titular_predio, zona_playa_protegida
     FROM sbn_supervision_predios
     ${where}
     ORDER BY fecha_emision DESC
     LIMIT 500`,
    params
  );

  return {
    status: 200,
    body: {
      filtros: { departamento: departamento ?? null, provincia: provincia ?? null, distrito: distrito ?? null },
      predios: rows.map((r) => ({
        numeroInforme: r.numero_informe,
        fechaEmision: r.fecha_emision,
        actividad: r.actividad,
        departamento: r.departamento,
        provincia: r.provincia,
        distrito: r.distrito,
        cus: r.cus,
        areaSupervisadaM2: r.area_supervisada_m2 === null ? null : Number(r.area_supervisada_m2),
        resultadoSupervision: r.resultado_supervision,
        titularPredio: r.titular_predio,
        zonaPlayaProtegida: r.zona_playa_protegida,
      })),
      limitacion:
        "Cobertura parcial: solo predios efectivamente supervisados por SBN, no el registro completo SINABIP (ese dataset se publica solo como enlace de Google Drive, actualmente roto).",
      fuente: { dataset: "SBN — Supervisión de predios estatales (Plataforma Nacional de Datos Abiertos)" },
    },
  };
}
