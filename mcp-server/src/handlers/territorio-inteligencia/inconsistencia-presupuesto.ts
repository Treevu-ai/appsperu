import type { NeonRow } from "../../db/neon-pool.js";
import { getPoolForApp, type NeonEnv } from "../../db/neon-env.js";
import type { ToolHandlerContext, HandlerResult } from "../registry.js";

interface ProyectoRow extends NeonRow {
  codigo_referencia: string | null;
  nombre_proyecto: string;
  monto_inversion_referencial: number | string | null;
  departamento: string | null;
  provincia: string | null;
  distrito: string | null;
  entidad: string | null;
}

/**
 * Handler para `territorio_inteligencia_inconsistencia_presupuesto` — GET /api/inconsistencia-presupuesto.
 * Origen: apps/territorio-inteligencia/api/src/services/inconsistencia-presupuesto.service.ts.
 * Cruza `inversion-privada.oxi_investment_promotions` (Obras por Impuestos)
 * contra `catastro-minero` por coincidencia exacta de distrito+provincia —
 * señal de coexistencia territorial, no superposición geométrica (ninguna
 * de las dos fuentes tiene polígono).
 */
export async function list(ctx: ToolHandlerContext): Promise<HandlerResult> {
  const { args, env } = ctx;
  const departamento = args.departamento as string | undefined;
  const sector = args.sector as string | undefined;

  const inversionPrivadaPool = getPoolForApp(env as NeonEnv, "inversion-privada");
  const catastroMineroPool = getPoolForApp(env as NeonEnv, "catastro-minero");
  if (!inversionPrivadaPool || !catastroMineroPool) {
    return { status: 200, body: { estado: "ENRIQUECIMIENTO_NO_CONFIGURADO", resultados: [] } };
  }

  const condiciones: string[] = [];
  const params: unknown[] = [];
  if (departamento) {
    params.push(`%${departamento}%`);
    condiciones.push(`departamento ILIKE $${params.length}`);
  }
  if (sector) {
    params.push(`%${sector}%`);
    condiciones.push(`entidad ILIKE $${params.length}`);
  }
  const where = condiciones.length > 0 ? `WHERE ${condiciones.join(" AND ")}` : "";

  const { rows: proyectos } = await inversionPrivadaPool.query<ProyectoRow>(
    `SELECT codigo_referencia, nombre_proyecto, monto_inversion_referencial,
            departamento, provincia, distrito, entidad
     FROM oxi_investment_promotions ${where} LIMIT 100`,
    params
  );

  if (proyectos.length === 0) return { status: 200, body: [] };

  const pares = new Set(
    proyectos.filter((p) => p.distrito && p.provincia).map((p) => `${p.provincia}|${p.distrito}`)
  );

  let distritosConMineria = new Set<string>();
  if (pares.size > 0) {
    const { rows: derechos } = await catastroMineroPool.query<{ provincia: string; distrito: string }>(
      `SELECT DISTINCT provincia, distrito FROM catastro_minero_derechos
       WHERE (provincia, distrito) IN (${[...pares].map((_, i) => `($${i * 2 + 1}, $${i * 2 + 2})`).join(",")})`,
      [...pares].flatMap((p) => p.split("|"))
    );
    distritosConMineria = new Set(derechos.map((d) => `${d.provincia}|${d.distrito}`));
  }

  const resultados = proyectos.map((p) => {
    const conflicto = !!(p.provincia && p.distrito && distritosConMineria.has(`${p.provincia}|${p.distrito}`));
    return {
      proyecto: p.nombre_proyecto,
      codigoProyecto: p.codigo_referencia ?? "",
      monto: p.monto_inversion_referencial === null ? 0 : Number(p.monto_inversion_referencial),
      ubicacion: [p.departamento, p.provincia, p.distrito].filter(Boolean).join(" - "),
      conflictoDeteccionado: conflicto,
      detalleConflicto: conflicto
        ? "Hay derechos mineros registrados (catastro-minero) en el mismo distrito que este proyecto OxI — coincidencia de ubicación, no superposición física exacta."
        : "Sin derechos mineros registrados en el mismo distrito.",
    };
  });

  return { status: 200, body: resultados };
}
