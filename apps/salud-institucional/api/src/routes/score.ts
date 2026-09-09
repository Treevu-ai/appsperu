import { Router } from "express";
import { z } from "zod";
import { LATEST_BUDGET_CTE } from "@appsperu/shared-queries";
import { extractRuc } from "@appsperu/shared-identity";
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

const ESTADOS_REGULARES = new Set(["ACTIVO"]);
const CONDICIONES_REGULARES = new Set(["HABIDO"]);

/**
 * Ensambla el score de salud institucional cruzando 5 bases en vivo — nunca
 * escribe en ninguna, esta app no tiene base propia. Cada bloque se arma
 * independiente y se junta en memoria por `entity_code` (la llave canónica
 * de radar-ejecucion); si un bloque no tiene datos para una entidad, esa
 * entidad simplemente no trae ese componente (ver score/compute.ts — nunca
 * se imputa 0 ni 100 por ausencia de dato).
 *
 * Extraído a función compartida (SI-03) porque `GET /por-provincia` necesita
 * el mismo conjunto de resultados ya calculado, no una query nueva.
 */
async function computeScoresForDepartamento(wantedDepartamento: string, anio: number) {
  // 1. Universo de entidades + ejecución presupuestal (radar-ejecucion, fuente primaria).
  const { rows: entityRows } = await ejecucionPool.query(
    `${LATEST_BUDGET_CTE}
     SELECT e.entity_code, e.nombre, e.nivel_gobierno, t.provincia, t.distrito,
            SUM(b.pim) AS pim, SUM(b.devengado) AS devengado
     FROM entities e
     JOIN territories t ON t.ubigeo = e.ubigeo
     LEFT JOIN latest_budget b ON b.entity_code = e.entity_code AND b.anio_fiscal = $2
     WHERE t.departamento = $1
     GROUP BY e.entity_code, e.nombre, e.nivel_gobierno, t.provincia, t.distrito`,
    [wantedDepartamento, anio]
  );

  if (entityRows.length === 0) {
    return [];
  }
  const entityCodes = entityRows.map((r) => r.entity_code);

  // 2. Obras (infobras), vía el crosswalk ejecucion<->infobras ya construido.
  const { rows: obrasRows } = await infobrasPool.query(
    `SELECT ec.ejecucion_entity_code AS entity_code,
            COUNT(*) AS total,
            COUNT(*) FILTER (WHERE pw.existe_paralizacion) AS paralizadas,
            COUNT(*) FILTER (WHERE pw.distrito_sospechoso) AS distrito_sospechoso
     FROM entity_crosswalk ec
     JOIN public_works pw ON pw.codigo_entidad = ec.infobras_codigo_entidad
     WHERE ec.ejecucion_entity_code = ANY($1)
     GROUP BY ec.ejecucion_entity_code`,
    [entityCodes]
  );
  const obrasByEntity = new Map(
    obrasRows.map((r) => [
      r.entity_code,
      { total: Number(r.total), paralizadas: Number(r.paralizadas), distritoSospechoso: Number(r.distrito_sospechoso) },
    ])
  );

  // 3. Inversiones (radar-inversiones), por SEC_EJEC exacto — sin crosswalk, clave compartida directa.
  // La condición de abajo es el equivalente SQL de
  // `costDriftPct(monto_viable, costo_actualizado) > SOBRECOSTO_UMBRAL_PCT`
  // (@appsperu/shared-signals, ver docs/adr/0020-umbral-sobrecosto-unificado.md).
  // No se calcula fila por fila en JS (evita traer todas las inversiones a
  // memoria solo para un COUNT) — si SOBRECOSTO_UMBRAL_PCT deja de ser 0,
  // esta condición debe actualizarse a
  // `costo_actualizado > monto_viable * (1 + SOBRECOSTO_UMBRAL_PCT / 100)`.
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
    nivelGobierno: r.nivel_gobierno,
    provincia: r.provincia,
    distrito: r.distrito,
    ejecucion: r.pim !== null ? { pim: Number(r.pim), devengado: Number(r.devengado) || 0 } : null,
    obras: obrasByEntity.get(r.entity_code) ?? null,
    inversiones: inversionesByEntity.get(r.entity_code) ?? null,
    compras: comprasByEntity.get(r.entity_code) ?? null,
    fiscal: fiscalByEntity.get(r.entity_code) ?? null,
  }));

  const resultados = inputs.map(computeEntityScore).sort((a, b) => (b.scoreCompuesto ?? -1) - (a.scoreCompuesto ?? -1));

  // Ranking dentro de cada cohorte de nivel de gobierno (SI-02) — no se calcula
  // en compute.ts porque requiere ver el conjunto completo de entidades, no una
  // entidad aislada. Entidades sin score no reciben ranking.
  const cohortesPorNivel = new Map<string, typeof resultados>();
  for (const r of resultados) {
    if (r.scoreCompuesto === null) continue;
    const nivel = r.nivelGobierno ?? "SIN_NIVEL";
    if (!cohortesPorNivel.has(nivel)) cohortesPorNivel.set(nivel, []);
    cohortesPorNivel.get(nivel)!.push(r);
  }
  for (const cohorte of cohortesPorNivel.values()) {
    cohorte.sort((a, b) => (b.scoreCompuesto ?? -1) - (a.scoreCompuesto ?? -1));
    cohorte.forEach((r, index) => {
      r.rankingEnNivelGobierno = { posicion: index + 1, total: cohorte.length };
    });
  }

  return resultados;
}

scoreRouter.get("/", asyncHandler(async (req, res) => {
  const parsed = parseQuery(ScoreQuerySchema, req.query, res);
  if (!parsed) return;
  const wantedDepartamento = parsed.departamento?.toUpperCase().trim() ?? "LA LIBERTAD";
  const anio = parsed.anio ? Number(parsed.anio) : 2026;

  const resultados = await computeScoresForDepartamento(wantedDepartamento, anio);
  res.json({ departamento: wantedDepartamento, anioFiscal: anio, resultados });
}));

/**
 * SI-03: promedio de scoreCompuesto por provincia (solo entidades con score
 * no nulo), sobre el mismo conjunto de resultados que ya calcula GET /.
 * Provincias sin ninguna entidad con score no aparecen con un 0 engañoso —
 * quedan con promedioScore: null y sinDatos: true.
 */
scoreRouter.get("/por-provincia", asyncHandler(async (req, res) => {
  const parsed = parseQuery(ScoreQuerySchema, req.query, res);
  if (!parsed) return;
  const wantedDepartamento = parsed.departamento?.toUpperCase().trim() ?? "LA LIBERTAD";
  const anio = parsed.anio ? Number(parsed.anio) : 2026;

  const resultados = await computeScoresForDepartamento(wantedDepartamento, anio);

  const porProvincia = new Map<
    string,
    { sumaScore: number; conScore: number; sinScore: number }
  >();
  for (const r of resultados) {
    const provincia = r.provincia ?? "SIN_PROVINCIA";
    if (!porProvincia.has(provincia)) porProvincia.set(provincia, { sumaScore: 0, conScore: 0, sinScore: 0 });
    const acc = porProvincia.get(provincia)!;
    if (r.scoreCompuesto === null) {
      acc.sinScore += 1;
    } else {
      acc.sumaScore += r.scoreCompuesto;
      acc.conScore += 1;
    }
  }

  const provincias = [...porProvincia.entries()]
    .map(([provincia, acc]) => ({
      provincia,
      promedioScore: acc.conScore > 0 ? Math.round((acc.sumaScore / acc.conScore) * 10) / 10 : null,
      entidadesConScore: acc.conScore,
      entidadesSinScore: acc.sinScore,
      sinDatos: acc.conScore === 0,
    }))
    .sort((a, b) => (b.promedioScore ?? -1) - (a.promedioScore ?? -1));

  res.json({ departamento: wantedDepartamento, anioFiscal: anio, provincias });
}));
