import type { NeonRow } from "../../db/neon-pool.js";
import type { ToolHandlerContext, HandlerResult } from "../registry.js";
import { getPoolForApp, type NeonEnv } from "../../db/neon-env.js";
import { LATEST_BUDGET_CTE } from "../../db/latest-budget.js";
import { computeEntityScore, type EntityScoreInputs } from "./_helpers.js";

// Copiado de packages/shared-identity (extractRuc) — mismo motivo que
// proveedores-sancionados/_helpers.ts: mcp-server no declara ese paquete.
const RUC_PREFIXES = ["PE-RUC-", "seace:ruc:"] as const;
function extractRuc(supplierId: string): string | null {
  for (const prefix of RUC_PREFIXES) {
    if (supplierId.startsWith(prefix)) {
      const ruc = supplierId.slice(prefix.length);
      return /^\d{11}$/.test(ruc) ? ruc : null;
    }
  }
  return null;
}

const ESTADOS_REGULARES = new Set(["ACTIVO"]);
const CONDICIONES_REGULARES = new Set(["HABIDO"]);

/**
 * `salud-institucional` no tiene base propia en Neon (agregador puro, ver
 * docstring de `ToolHandlerContext.env` en registry.ts) — cruza 5 bases YA
 * portadas al Worker: radar-ejecucion, infobras, radar-inversiones,
 * compras-publicas, identidad-fiscal.
 *
 * Origen: apps/salud-institucional/api/src/routes/score.ts
 * (computeScoresForDepartamento). Las 5 consultas van SECUENCIALES —nunca
 * Promise.all— porque cada una abre una conexión WebSocket nueva contra una
 * base Neon distinta (`NeonPool.query` abre/cierra por llamada, ver
 * neon-pool.ts) y el Worker tiene un tope de conexiones simultáneas por
 * invocación (ver RUNBOOK_NEON.md); el route Express original sí las corría
 * en paralelo porque ahí cada `xxxPool` es una conexión persistente propia,
 * pero ese supuesto no aplica aquí.
 */
async function computeScoresForDepartamento(env: Record<string, unknown>, wantedDepartamento: string, anio: number) {
  const ejecucionPool = getPoolForApp(env as NeonEnv, "radar-ejecucion");
  const infobrasPool = getPoolForApp(env as NeonEnv, "infobras");
  const inversionesPool = getPoolForApp(env as NeonEnv, "radar-inversiones");
  const comprasPool = getPoolForApp(env as NeonEnv, "compras-publicas");
  const fiscalPool = getPoolForApp(env as NeonEnv, "identidad-fiscal");
  if (!ejecucionPool || !infobrasPool || !inversionesPool || !comprasPool || !fiscalPool) {
    throw new Error("Falta la conexión a alguna de las 5 bases que salud-institucional cruza (radar-ejecucion, infobras, radar-inversiones, compras-publicas, identidad-fiscal).");
  }

  // 1. Universo de entidades + ejecución presupuestal (radar-ejecucion, fuente primaria).
  const { rows: entityRows } = await ejecucionPool.query<
    { entity_code: string; nombre: string; nivel_gobierno: string | null; provincia: string | null; distrito: string | null; pim: string | null; devengado: string | null } & NeonRow
  >(
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
  const { rows: obrasRows } = await infobrasPool.query<
    { entity_code: string; total: string; paralizadas: string; distrito_sospechoso: string } & NeonRow
  >(
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
    obrasRows.map((r) => [r.entity_code, { total: Number(r.total), paralizadas: Number(r.paralizadas), distritoSospechoso: Number(r.distrito_sospechoso) }])
  );

  // 3. Inversiones (radar-inversiones), por SEC_EJEC exacto — sin crosswalk.
  const { rows: inversionRows } = await inversionesPool.query<{ entity_code: string; total: string; con_sobrecosto: string } & NeonRow>(
    `SELECT sec_ejec AS entity_code,
            COUNT(*) AS total,
            COUNT(*) FILTER (WHERE costo_actualizado > monto_viable) AS con_sobrecosto
     FROM investments
     WHERE sec_ejec = ANY($1)
     GROUP BY sec_ejec`,
    [entityCodes]
  );
  const inversionesByEntity = new Map(inversionRows.map((r) => [r.entity_code, { total: Number(r.total), conSobrecosto: Number(r.con_sobrecosto) }]));

  // 4. Compras (compras-publicas), vía el crosswalk ejecucion<->OECE.
  const { rows: comprasRows } = await comprasPool.query<{ entity_code: string; supplier_id: string; monto: string | null } & NeonRow>(
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

    const ruc = extractRuc(row.supplier_id);
    if (ruc) {
      allRucs.add(ruc);
      if (!rucsByEntity.has(row.entity_code)) rucsByEntity.set(row.entity_code, new Set());
      rucsByEntity.get(row.entity_code)!.add(ruc);
    }
  }

  // 5. Salud tributaria de los proveedores (identidad-fiscal).
  const fiscalByEntity = new Map<string, { evaluables: number; regulares: number }>();
  if (allRucs.size > 0) {
    const { rows: contribRows } = await fiscalPool.query<
      { ruc: string; estado_contribuyente: string | null; condicion_domicilio: string | null } & NeonRow
    >(`SELECT ruc, estado_contribuyente, condicion_domicilio FROM contribuyentes WHERE ruc = ANY($1)`, [[...allRucs]]);
    const contribByRuc = new Map(
      contribRows.map((r) => [
        r.ruc,
        ESTADOS_REGULARES.has((r.estado_contribuyente ?? "").toUpperCase()) && CONDICIONES_REGULARES.has((r.condicion_domicilio ?? "").toUpperCase()),
      ])
    );

    for (const [entityCode, rucs] of rucsByEntity) {
      let evaluables = 0;
      let regulares = 0;
      for (const ruc of rucs) {
        const esRegular = contribByRuc.get(ruc);
        if (esRegular === undefined) continue;
        evaluables += 1;
        if (esRegular) regulares += 1;
      }
      if (evaluables > 0) fiscalByEntity.set(entityCode, { evaluables, regulares });
    }
  }

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

/** Handler para `salud_institucional_score` — GET /api/score. */
export async function score(ctx: ToolHandlerContext): Promise<HandlerResult> {
  const { args, env } = ctx;
  const wantedDepartamento = ((args.departamento as string | undefined)?.toUpperCase().trim()) ?? "LA LIBERTAD";
  const anio = args.anio ? Number(args.anio) : 2026;

  const resultados = await computeScoresForDepartamento(env, wantedDepartamento, anio);
  return { status: 200, body: { departamento: wantedDepartamento, anioFiscal: anio, resultados } };
}

/** Handler para `salud_institucional_score_por_provincia` — GET /api/score/por-provincia. */
export async function scorePorProvincia(ctx: ToolHandlerContext): Promise<HandlerResult> {
  const { args, env } = ctx;
  const wantedDepartamento = ((args.departamento as string | undefined)?.toUpperCase().trim()) ?? "LA LIBERTAD";
  const anio = args.anio ? Number(args.anio) : 2026;

  const resultados = await computeScoresForDepartamento(env, wantedDepartamento, anio);

  const porProvincia = new Map<string, { sumaScore: number; conScore: number; sinScore: number }>();
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

  return { status: 200, body: { departamento: wantedDepartamento, anioFiscal: anio, provincias } };
}
