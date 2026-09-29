import type { NeonRow } from "../../db/neon-pool.js";
import type { ToolHandlerContext, HandlerResult } from "../registry.js";
import { extractRuc, crossAppPool } from "./_helpers.js";

interface InfraccionAgregada {
  ruc: string;
  nombreAdministrado: string;
  totalInfracciones: number;
  subsectores: string[];
  ultimaFechaRd: string | null;
}

interface ComprasAgregado {
  adjudicaciones: number;
  buyersDistintos: number;
  montoTotal: number;
  ultimaFecha: string | null;
}

const LIMITATION =
  "Solo cruza RUC (empresas) -- las infracciones a persona natural (D.N.I.) vienen enmascaradas desde la ingesta y no se pueden cruzar. Una sanción ambiental de OEFA no inhabilita legalmente para contratar con el Estado (a diferencia de una inhabilitación del Tribunal de Contrataciones): esta es una coincidencia de identidad entre dos registros públicos independientes, no una irregularidad por sí sola.";

/**
 * Handler para `infracciones_ambientales_crossref` — GET /api/crossref.
 *
 * Origen: apps/infracciones-ambientales/api/src/routes/crossref.ts. Cruza
 * infracciones OEFA (base propia) con compras-publicas (cross-app, opcional
 * — si no hay conexión, responde ENRIQUECIMIENTO_NO_CONFIGURADO en vez de
 * fallar). Consultas secuenciales dentro del bloque compras (mismo orden que
 * el route Express: awards, luego minor_contracts, ambas dentro del mismo
 * Promise.all original — se preserva tal cual porque ambas van contra la
 * MISMA base compras-publicas, no cruzan bases distintas).
 */
export async function list(ctx: ToolHandlerContext): Promise<HandlerResult> {
  const { db, args, env } = ctx;
  const ruc = args.ruc as string | undefined;
  const departamento = args.departamento as string | undefined;
  const limit = args.limit ? Number(args.limit) : 200;
  const offset = args.offset ? Number(args.offset) : 0;

  const comprasPool = crossAppPool("compras-publicas", env);
  if (!comprasPool) {
    return { status: 200, body: { estado: "ENRIQUECIMIENTO_NO_CONFIGURADO", total: 0, resultados: [] } };
  }

  const conditions: string[] = ["tipo_doc = 'R.U.C.'"];
  const params: unknown[] = [];
  if (ruc) {
    params.push(ruc);
    conditions.push(`id_doc_administrado = $${params.length}`);
  }
  if (departamento) {
    params.push(departamento.toUpperCase());
    conditions.push(`departamento = $${params.length}`);
  }

  const { rows: infraccionRows } = await db.query<{
    ruc: string;
    nombre_administrado: string;
    total_infracciones: string;
    subsectores: string[] | null;
    ultima_fecha_rd: string | null;
  } & NeonRow>(
    `SELECT id_doc_administrado AS ruc,
            MAX(nombre_administrado) AS nombre_administrado,
            COUNT(*) AS total_infracciones,
            array_agg(DISTINCT subsector_economico) FILTER (WHERE subsector_economico IS NOT NULL) AS subsectores,
            MAX(fecha_rd) AS ultima_fecha_rd
     FROM infracciones_ambientales
     WHERE ${conditions.join(" AND ")}
     GROUP BY id_doc_administrado`,
    params
  );

  if (infraccionRows.length === 0) {
    return { status: 200, body: { total: 0, resultados: [], limitation: LIMITATION } };
  }

  const infraccionesPorRuc = new Map<string, InfraccionAgregada>(
    infraccionRows.map((r) => [
      r.ruc,
      {
        ruc: r.ruc,
        nombreAdministrado: r.nombre_administrado,
        totalInfracciones: Number(r.total_infracciones),
        subsectores: r.subsectores ?? [],
        ultimaFechaRd: r.ultima_fecha_rd,
      },
    ])
  );

  const rucs = [...infraccionesPorRuc.keys()];
  const awardsSupplierIds = rucs.map((r) => `PE-RUC-${r}`);
  const minorSupplierIds = rucs.map((r) => `seace:ruc:${r}`);

  let comprasPorRuc = new Map<string, ComprasAgregado>();
  try {
    // Secuencial: ambas consultas van contra la misma base compras-publicas,
    // así que no hay riesgo de exceder el tope de conexiones concurrentes por
    // cruzar bases distintas — se mantiene el mismo orden que el route
    // Express (awards, luego minor_contracts).
    const { rows: awardRows } = await comprasPool.query<{
      supplier_id: string;
      buyer_name: string | null;
      valor_monto: string | null;
      fecha: string | null;
    } & NeonRow>(`SELECT supplier_id, buyer_name, valor_monto, fecha FROM awards WHERE supplier_id = ANY($1)`, [
      awardsSupplierIds,
    ]);
    const { rows: minorRows } = await comprasPool.query<{
      winning_supplier_id: string;
      buyer_name: string | null;
      awarded_amount: string | null;
      award_date: string | null;
    } & NeonRow>(
      `SELECT c.winning_supplier_id, m.official_name AS buyer_name, c.awarded_amount, c.award_date
       FROM minor_contracts c
       LEFT JOIN municipalities m ON m.municipality_id = c.municipality_id
       WHERE c.winning_supplier_id = ANY($1)`,
      [minorSupplierIds]
    );

    const acc = new Map<string, { adjudicaciones: number; buyers: Set<string>; montoTotal: number; ultimaFecha: string | null }>();
    const addRow = (supplierId: string, buyerName: string | null, monto: string | null, fecha: string | null) => {
      const supplierRuc = extractRuc(supplierId);
      if (!supplierRuc) return;
      const entry = acc.get(supplierRuc) ?? { adjudicaciones: 0, buyers: new Set<string>(), montoTotal: 0, ultimaFecha: null };
      entry.adjudicaciones += 1;
      if (buyerName) entry.buyers.add(buyerName);
      entry.montoTotal += Number(monto) || 0;
      if (fecha && (!entry.ultimaFecha || fecha > entry.ultimaFecha)) entry.ultimaFecha = fecha;
      acc.set(supplierRuc, entry);
    };
    for (const r of awardRows) addRow(r.supplier_id, r.buyer_name, r.valor_monto, r.fecha);
    for (const r of minorRows) addRow(r.winning_supplier_id, r.buyer_name, r.awarded_amount, r.award_date);

    comprasPorRuc = new Map(
      [...acc.entries()].map(([rucKey, v]) => [
        rucKey,
        { adjudicaciones: v.adjudicaciones, buyersDistintos: v.buyers.size, montoTotal: v.montoTotal, ultimaFecha: v.ultimaFecha },
      ])
    );
  } catch (err) {
    console.error("No se pudo cruzar contra compras-publicas (enriquecimiento opcional):", err instanceof Error ? err.message : err);
    return { status: 200, body: { estado: "ENRIQUECIMIENTO_NO_DISPONIBLE", total: 0, resultados: [] } };
  }

  const resultados = rucs
    .filter((r) => comprasPorRuc.has(r))
    .map((r) => ({
      ...infraccionesPorRuc.get(r)!,
      comprasPublicas: comprasPorRuc.get(r)!,
    }))
    .sort((a, b) => b.comprasPublicas.montoTotal - a.comprasPublicas.montoTotal);

  return {
    status: 200,
    body: {
      total: resultados.length,
      resultados: resultados.slice(offset, offset + limit),
      limitation: LIMITATION,
    },
  };
}
