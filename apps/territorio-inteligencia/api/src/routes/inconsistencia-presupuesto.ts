import { Router } from "express";
import { inversionPrivadaPool } from "../db/inversion-privada-pool.js";
import { catastroMineroPool } from "../db/catastro-minero-pool.js";
import { asyncHandler } from "../lib/async-handler.js";
import { parseQuery } from "../lib/validate-query.js";
import { InconsistenciaPresupuestoQuerySchema, type InconsistenciaPresupuestoQuery, type InconsistenciaData } from "../schema/inconsistencia-presupuesto.js";

export const inconsistenciaPresupuestoRouter = Router();

/**
 * "proyectos" e "inteligencia_minero" (código anterior) no existen en
 * ninguna base del repo — eran remanentes de `create_proyectos.cjs` /
 * `create_int_mining.cjs`. El dato real de proyectos públicos financiados
 * por privados vive en `inversion-privada.oxi_investment_promotions` (Obras
 * por Impuestos), que sí trae distrito/provincia como texto real (a
 * diferencia de catastro-forestal, que guarda códigos UBIGEO) — se cruza por
 * coincidencia exacta de distrito+provincia contra `catastro_minero_derechos`,
 * no por geometría (ninguna de las dos tiene polígono).
 */
interface ProyectoRow {
  codigo_referencia: string | null;
  nombre_proyecto: string;
  monto_inversion_referencial: number | string | null;
  departamento: string | null;
  provincia: string | null;
  distrito: string | null;
  entidad: string | null;
}

export async function getInconsistenciasPresupuestales(
  query: InconsistenciaPresupuestoQuery
): Promise<InconsistenciaData[]> {
  const { departamento, sector } = query;

  const conditions: string[] = [];
  const params: unknown[] = [];
  if (departamento) {
    params.push(`%${departamento}%`);
    conditions.push(`departamento ILIKE $${params.length}`);
  }
  if (sector) {
    params.push(`%${sector}%`);
    conditions.push(`entidad ILIKE $${params.length}`);
  }
  const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

  const { rows: proyectos } = await inversionPrivadaPool.query<ProyectoRow>(
    `SELECT codigo_referencia, nombre_proyecto, monto_inversion_referencial,
            departamento, provincia, distrito, entidad
     FROM oxi_investment_promotions
     ${where}
     LIMIT 100`,
    params
  );

  if (proyectos.length === 0) return [];

  const pares = new Set(
    proyectos.filter((p) => p.distrito && p.provincia).map((p) => `${p.provincia}|${p.distrito}`)
  );
  if (pares.size === 0) {
    return proyectos.map((p) => toInconsistencia(p, false));
  }

  const { rows: derechos } = await catastroMineroPool.query<{ provincia: string; distrito: string }>(
    `SELECT DISTINCT provincia, distrito FROM catastro_minero_derechos
     WHERE (provincia, distrito) IN (${[...pares].map((_, i) => `($${i * 2 + 1}, $${i * 2 + 2})`).join(",")})`,
    [...pares].flatMap((p) => p.split("|"))
  );
  const distritosConMineria = new Set(derechos.map((d) => `${d.provincia}|${d.distrito}`));

  return proyectos.map((p) =>
    toInconsistencia(p, !!(p.provincia && p.distrito && distritosConMineria.has(`${p.provincia}|${p.distrito}`)))
  );
}

function toInconsistencia(p: ProyectoRow, conflicto: boolean): InconsistenciaData {
  return {
    proyecto: p.nombre_proyecto,
    codigoProyecto: p.codigo_referencia ?? "",
    monto: p.monto_inversion_referencial === null ? 0 : Number(p.monto_inversion_referencial),
    ubicacion: [p.departamento, p.provincia, p.distrito].filter(Boolean).join(" - "),
    conflictoDeteccionado: conflicto,
    detalleConflicto: conflicto
      ? "Hay derechos mineros registrados (catastro-minero) en el mismo distrito que este proyecto OxI — coincidencia de ubicación, no necesariamente superposición física exacta (ninguna de las dos fuentes tiene geometría)."
      : "Sin derechos mineros registrados en el mismo distrito.",
  };
}

inconsistenciaPresupuestoRouter.get("/", asyncHandler(async (req, res) => {
  const query = parseQuery(InconsistenciaPresupuestoQuerySchema, req.query, res);
  if (!query) return;
  const results = await getInconsistenciasPresupuestales(query);
  res.json(results);
}));
