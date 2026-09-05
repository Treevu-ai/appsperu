import { Router } from "express";
import { z } from "zod";
import { LATEST_BUDGET_CTE } from "@appsperu/shared-queries";
import { ejecucionPool } from "../db/ejecucion-pool.js";
import { infobrasPool } from "../db/infobras-pool.js";
import { inversionesPool } from "../db/inversiones-pool.js";
import { comprasPool } from "../db/compras-pool.js";
import { fiscalPool } from "../db/fiscal-pool.js";
import { computeEntityScore, type EntityScoreInputs } from "../score/compute.js";
import { asyncHandler } from "../lib/async-handler.js";
import { parseQuery } from "../lib/validate-query.js";

export const scoreRouter = Router();

const ScoreQuerySchema = z.object({
  departamento: z.string().min(1).optional(),
  anio: z.string().regex(/^\d{4}$/).optional(),
});

const RUC_PREFIX = "PE-RUC-";
function extractRuc(supplierId: string): string | null {
  if (!supplierId.startsWith(RUC_PREFIX)) return null;
  const ruc = supplierId.slice(RUC_PREFIX.length);
  return /^\d{11}$/.test(ruc) ? ruc : null;
}
const ESTADOS_REGULARES = new Set(["ACTIVO"]);
const CONDICIONES_REGULARES = new Set(["HABIDO"]);

/**
 * Ensambla el score de salud institucional cruzando 5 bases en vivo — nunca
 * escribe en ninguna, esta app no tiene base propia. Cada bloque se arma
 * independiente y se junta en memoria por `entity_code` (la llave canónica
 * de radar-ejecucion); si un bloque no tiene datos para una entidad, esa
 * entidad simplemente no trae ese componente (ver score/compute.ts — nunca
 * se imputa 0 ni 100 por ausencia de dato).
 */
scoreRouter.get("/", asyncHandler(async (req, res) => {
  const parsed = parseQuery(ScoreQuerySchema, req.query, res);
  if (!parsed) return;
  const wantedDepartamento = parsed.departamento?.toUpperCase().trim() ?? "LA LIBERTAD";
  const anio = parsed.anio ? Number(parsed.anio) : 2026;

  // 1. Universo de entidades + ejecución presupuestal (radar-ejecucion, fuente primaria).
  const { rows: entityRows } = await ejecucionPool.query(
    `${LATEST_BUDGET_CTE}
     SELECT e.entity_code, e.nombre, SUM(b.pim) AS pim, SUM(b.devengado) AS devengado
     FROM entities e
     JOIN territories t ON t.ubigeo = e.ubigeo
     LEFT JOIN latest_budget b ON b.entity_code = e.entity_code AND b.anio_fiscal = $2
     WHERE t.departamento = $1
     GROUP BY e.entity_code, e.nombre`,
    [wantedDepartamento, anio]
  );

  if (entityRows.length === 0) {
    res.json({ departamento: wantedDepartamento, resultados: [] });
    return;
  }
  const entityCodes = entityRows.map((r) => r.entity_code);

  // 2. Obras (infobras), vía el crosswalk ejecucion<->infobras ya construido.
  const { rows: obrasRows } = await infobrasPool.query(
    `SELECT ec.ejecucion_entity_code AS entity_code,
            COUNT(*) AS total,
            COUNT(*) FILTER (WHERE pw.existe_paralizacion) AS paralizadas
     FROM entity_crosswalk ec
     JOIN public_works pw ON pw.codigo_entidad = ec.infobras_codigo_entidad
     WHERE ec.ejecucion_entity_code = ANY($1)
     GROUP BY ec.ejecucion_entity_code`,
    [entityCodes]
  );
  const obrasByEntity = new Map(
    obrasRows.map((r) => [r.entity_code, { total: Number(r.total), paralizadas: Number(r.paralizadas) }])
  );

  // 3. Inversiones (radar-inversiones), por SEC_EJEC exacto — sin crosswalk, clave compartida directa.
  const { rows: inversionRows } = await inversionesPool.query(
    `SELECT sec_ejec AS entity_code,
            COUNT(*) AS total,
            COUNT(*) FILTER (WHERE costo_actualizado > monto_viable) AS con_sobrecosto
     FROM investments
     WHERE sec_ejec = ANY($1)
     GROUP BY sec_ejec`,
    [entityCodes]
  );
  const inversionesByEntity = new Map(
    inversionRows.map((r) => [r.entity_code, { total: Number(r.total), conSobrecosto: Number(r.con_sobrecosto) }])
  );

  // 4. Compras (compras-publicas), vía el crosswalk ejecucion<->OECE — monto por proveedor,
  //    para concentración y para alimentar el bloque fiscal (paso 5).
  const { rows: comprasRows } = await comprasPool.query(
    `SELECT ec.mef_entity_code AS entity_code, a.supplier_id, SUM(a.valor_monto) AS monto
     FROM entity_crosswalk ec
     JOIN awards a ON a.buyer_id = ec.oece_buyer_id
     WHERE ec.mef_entity_code = ANY($1)
     GROUP BY ec.mef_entity_code, a.supplier_id`,
    [entityCodes]
  );

  const comprasByEntity = new Map<string, { totalAdjudicado: number; maxProveedorAdjudicado: number }>();
  const rucsByEntity = new Map<string, Set<string>>();
  const allRucs = new Set<string>();

  for (const row of comprasRows) {
    const monto = Number(row.monto) || 0;
    const prev = comprasByEntity.get(row.entity_code) ?? { totalAdjudicado: 0, maxProveedorAdjudicado: 0 };
    comprasByEntity.set(row.entity_code, {
      totalAdjudicado: prev.totalAdjudicado + monto,
      maxProveedorAdjudicado: Math.max(prev.maxProveedorAdjudicado, monto),
    });

    const ruc = extractRuc(row.supplier_id as string);
    if (ruc) {
      allRucs.add(ruc);
      if (!rucsByEntity.has(row.entity_code)) rucsByEntity.set(row.entity_code, new Set());
      rucsByEntity.get(row.entity_code)!.add(ruc);
    }
  }

  // 5. Salud tributaria de los proveedores (identidad-fiscal) — solo se evalúan
  //    los RUC encontrados en el padrón; los no encontrados no cuentan ni a favor ni en contra.
  const fiscalByEntity = new Map<string, { evaluables: number; regulares: number }>();
  if (allRucs.size > 0) {
    const { rows: contribRows } = await fiscalPool.query(
      `SELECT ruc, estado_contribuyente, condicion_domicilio FROM contribuyentes WHERE ruc = ANY($1)`,
      [[...allRucs]]
    );
    const contribByRuc = new Map(
      contribRows.map((r) => [
        r.ruc,
        ESTADOS_REGULARES.has((r.estado_contribuyente ?? "").toUpperCase()) &&
          CONDICIONES_REGULARES.has((r.condicion_domicilio ?? "").toUpperCase()),
      ])
    );

    for (const [entityCode, rucs] of rucsByEntity) {
      let evaluables = 0;
      let regulares = 0;
      for (const ruc of rucs) {
        const esRegular = contribByRuc.get(ruc);
        if (esRegular === undefined) continue; // no encontrado en el padrón, no se evalúa
        evaluables += 1;
        if (esRegular) regulares += 1;
      }
      if (evaluables > 0) fiscalByEntity.set(entityCode, { evaluables, regulares });
    }
  }

  // Ensamblar y calcular.
  const inputs: EntityScoreInputs[] = entityRows.map((r) => ({
    entityCode: r.entity_code,
    nombre: r.nombre,
    ejecucion: r.pim !== null ? { pim: Number(r.pim), devengado: Number(r.devengado) || 0 } : null,
    obras: obrasByEntity.get(r.entity_code) ?? null,
    inversiones: inversionesByEntity.get(r.entity_code) ?? null,
    compras: comprasByEntity.get(r.entity_code) ?? null,
    fiscal: fiscalByEntity.get(r.entity_code) ?? null,
  }));

  const resultados = inputs.map(computeEntityScore).sort((a, b) => (b.scoreCompuesto ?? -1) - (a.scoreCompuesto ?? -1));

  res.json({ departamento: wantedDepartamento, anioFiscal: anio, resultados });
}));
