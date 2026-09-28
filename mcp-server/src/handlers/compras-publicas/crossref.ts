import type { NeonRow } from "../../db/neon-pool.js";
import type { ToolHandlerContext, HandlerResult } from "../registry.js";
import { asNumber, maskDocumento } from "./_helpers.js";

interface CrosswalkRow extends NeonRow {
  mef_entity_code: string;
  mef_nombre: string;
  oece_buyer_id: string;
  oece_buyer_name: string;
  confidence: string;
  score: string | number;
  computed_at: string | null;
}

interface ProcurementAggRow extends NeonRow {
  buyer_id: string;
  procesos: string | number;
  valor_total: string | number | null;
}

export async function salud(ctx: ToolHandlerContext): Promise<HandlerResult> {
  const { db } = ctx;

  const { rows } = await db.query<CrosswalkRow>(
    `SELECT COUNT(*) AS filas,
            COUNT(*) FILTER (WHERE confidence = 'confirmada') AS confirmadas,
            COUNT(*) FILTER (WHERE confidence = 'candidata') AS candidatas,
            MAX(computed_at) AS ultima_construccion
     FROM entity_crosswalk`
  );
  const filas = Number(rows[0].filas);

  return {
    status: 200,
    body: {
      filas,
      confirmadas: Number(rows[0].confirmadas),
      candidatas: Number(rows[0].candidatas),
      ultimaConstruccion: rows[0].ultima_construccion,
      estado: filas === 0 ? "VACIO" : "OK",
    },
  };
}

export async function list(ctx: ToolHandlerContext): Promise<HandlerResult> {
  const { db, args } = ctx;
  const confidence = args.confidence as string | undefined;

  const params: unknown[] = [];
  let where = "";
  if (confidence) {
    params.push(confidence);
    where = `WHERE confidence = $${params.length}`;
  }

  const { rows: crosswalk } = await db.query<CrosswalkRow>(
    `SELECT mef_entity_code, mef_nombre, oece_buyer_id, oece_buyer_name, confidence, score, computed_at
     FROM entity_crosswalk
     ${where}
     ORDER BY confidence, mef_nombre`,
    params
  );

  if (crosswalk.length === 0) {
    return { status: 200, body: { resultados: [] } };
  }

  const entityCodes = crosswalk.map((r) => r.mef_entity_code);
  const buyerIds = crosswalk.map((r) => r.oece_buyer_id);

  // TODO(handlers): The original route used radarPool (a cross-app Postgres pool
  // to radar-ejecucion's database) with LATEST_BUDGET_CTE to query `latest_budget`.
  // That table lives in the `radar_ejecucion` database, not `compras_publicas`.
  // `crossAppPool` returns null until ToolHandlerContext exposes `env` for
  // getPoolForApp (see proveedores-sancionados/_helpers.ts). The devengado and
  // cortes data cannot be resolved via `db` alone — they default to 0/null.
  const devengadoByEntity = new Map<string, { devengado: number; cortes: string[] }>();

  const comprasResult = await db.query<ProcurementAggRow>(
    `SELECT buyer_id, COUNT(*) AS procesos, SUM(valor_monto) AS valor_total
     FROM procurement_processes
     WHERE buyer_id = ANY($1)
     GROUP BY buyer_id`,
    [buyerIds]
  );

  const comprasByBuyer = new Map(
    comprasResult.rows.map((r) => [r.buyer_id, { procesos: Number(r.procesos), valorTotal: Number(r.valor_total) || 0 }])
  );

  return {
    status: 200,
    body: {
      resultados: crosswalk.map((r) => {
        const compras = comprasByBuyer.get(r.oece_buyer_id) ?? { procesos: 0, valorTotal: 0 };
        const devengado = devengadoByEntity.get(r.mef_entity_code);
        return {
          mefEntityCode: r.mef_entity_code,
          mefNombre: r.mef_nombre,
          oeceBuyerId: r.oece_buyer_id,
          oeceBuyerName: r.oece_buyer_name,
          confidence: r.confidence,
          score: Number(r.score),
          devengado: devengado ? devengado.devengado : 0,
          coberturaTemporal: devengado
            ? { cortesUsados: devengado.cortes, estado: "PARCIAL" }
            : null,
          comprasProcesos: compras.procesos,
          comprasValorTotal: compras.valorTotal,
          computedAt: r.computed_at,
        };
      }),
    },
  };
}
