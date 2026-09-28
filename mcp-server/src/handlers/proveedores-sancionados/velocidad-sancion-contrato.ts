import type { NeonRow } from "../../db/neon-pool.js";
import type { ToolHandlerContext, HandlerResult } from "../registry.js";
import {
  extractRuc,
  peorCoincidencia,
  crossAppPool,
  crossAppUnavailable,
  type ContractRow,
  type InhabilitacionRow,
} from "./_helpers.js";

interface InhabUniverseRow extends NeonRow {
  ruc: string;
  resolucion: string;
  desde: string | Date | null;
  hasta: string | Date | null;
  estado: string | null;
}

interface AwardRow extends NeonRow {
  ocid: string | null;
  award_id: string | null;
  supplier_id: string | null;
  supplier_name: string | null;
  buyer_name: string | null;
  valor_monto: string | number | null;
  valor_moneda: string | null;
  fecha: string | Date | null;
}

interface MinorContractRow extends NeonRow {
  ocid: string | null;
  award_id: string | null;
  supplier_id: string | null;
  supplier_name: string | null;
  buyer_name: string | null;
  valor_monto: string | number | null;
  fecha: string | Date | null;
}

/**
 * Handler para `proveedores_sancionados_velocidad_sancion_contrato` —
 * GET /api/crossref/velocidad-sancion-contrato.
 *
 * Radar de alerta por severidad: `DURANTE_SANCION_VIGENTE` (el contrato se
 * adjudicó mientras la inhabilitación estaba activa) y `POCO_DESPUES_DE_SANCION`
 * (se adjudicó dentro de `ventanaDiasPostSancion` días de que la inhabilitación
 * terminó — proveedores que esperan a que expire la sanción).
 *
 * A diferencia de `crossref` (default La Libertad), el default aquí es
 * NACIONAL; pasar `departamento` lo acota.
 *
 * El orden está invertido a propósito: primero se trae el universo (chico) de
 * RUC sancionados y se filtran `awards`/`minor_contracts` por ese universo con
 * `= ANY($n)` — si se consultaran los 108K+ contratos nacionales primero, el
 * costo del request sería proporcional a todo el corpus y no a los ~7K RUC con
 * inhabilitación real.
 */
export async function list(ctx: ToolHandlerContext): Promise<HandlerResult> {
  const { db, args, env } = ctx;
  const comprasDb = crossAppPool("compras-publicas", env);
  if (!comprasDb) return crossAppUnavailable("compras-publicas");

  const wantedDepartamento = args.departamento ? (args.departamento as string).toUpperCase().trim() : null;
  const ventanaDiasPostSancion = args.ventanaDiasPostSancion !== undefined ? Number(args.ventanaDiasPostSancion) : 90;

  const { rows: inhabRows } = await db.query<InhabUniverseRow>(
    "SELECT ruc, resolucion, desde, hasta, estado FROM inhabilitaciones WHERE desde IS NOT NULL"
  );
  const inhabilitacionesByRuc = new Map<string, InhabilitacionRow[]>();
  for (const r of inhabRows) {
    if (!inhabilitacionesByRuc.has(r.ruc)) inhabilitacionesByRuc.set(r.ruc, []);
    inhabilitacionesByRuc.get(r.ruc)!.push({ resolucion: r.resolucion, desde: r.desde, hasta: r.hasta, estado: r.estado });
  }
  const rucsSancionados = [...inhabilitacionesByRuc.keys()];

  if (rucsSancionados.length === 0) {
    return {
      status: 200,
      body: {
        departamento: wantedDepartamento ?? "TODOS",
        ventanaDiasPostSancion,
        totalAlertas: 0,
        alertas: [],
        nota: "Sin inhabilitaciones registradas con fecha `desde` -- no hay universo de RUC sancionados contra el cual cruzar.",
      },
    };
  }
  const awardsSupplierIds = rucsSancionados.map((ruc) => `PE-RUC-${ruc}`);
  const minorContractsSupplierIds = rucsSancionados.map((ruc) => `seace:ruc:${ruc}`);

  const [{ rows: awardRows }, { rows: minorContractRows }] = await Promise.all([
    wantedDepartamento
      ? comprasDb.query<AwardRow>(
          `SELECT ocid, award_id, supplier_id, supplier_name, buyer_name, valor_monto, valor_moneda, fecha
           FROM awards WHERE departamento = $1 AND supplier_id = ANY($2)`,
          [wantedDepartamento, awardsSupplierIds]
        )
      : comprasDb.query<AwardRow>(
          `SELECT ocid, award_id, supplier_id, supplier_name, buyer_name, valor_monto, valor_moneda, fecha
           FROM awards WHERE supplier_id = ANY($1)`,
          [awardsSupplierIds]
        ),
    wantedDepartamento
      ? comprasDb.query<MinorContractRow>(
          `SELECT c.contracting_id, c.ocid, c.award_id, c.winning_supplier_id AS supplier_id,
                  s.legal_name AS supplier_name, m.official_name AS buyer_name,
                  c.awarded_amount AS valor_monto, c.award_date AS fecha
           FROM minor_contracts c
           LEFT JOIN supplier_profiles s ON s.supplier_id = c.winning_supplier_id
           LEFT JOIN municipalities m ON m.municipality_id = c.municipality_id
           WHERE c.winning_supplier_id = ANY($2) AND (m.department = $1 OR c.execution_department = $1)`,
          [wantedDepartamento, minorContractsSupplierIds]
        )
      : comprasDb.query<MinorContractRow>(
          `SELECT c.contracting_id, c.ocid, c.award_id, c.winning_supplier_id AS supplier_id,
                  s.legal_name AS supplier_name, m.official_name AS buyer_name,
                  c.awarded_amount AS valor_monto, c.award_date AS fecha
           FROM minor_contracts c
           LEFT JOIN supplier_profiles s ON s.supplier_id = c.winning_supplier_id
           LEFT JOIN municipalities m ON m.municipality_id = c.municipality_id
           WHERE c.winning_supplier_id = ANY($1)`,
          [minorContractsSupplierIds]
        ),
  ]);

  const contractRows: ContractRow[] = [
    ...awardRows.map((row): ContractRow => ({
      origen: "awards",
      ocid: row.ocid,
      awardId: row.award_id,
      supplierId: row.supplier_id,
      supplierName: row.supplier_name,
      buyerName: row.buyer_name,
      valorMonto: row.valor_monto === null ? null : Number(row.valor_monto),
      valorMoneda: row.valor_moneda,
      fecha: row.fecha,
    })),
    ...minorContractRows.map((row): ContractRow => ({
      origen: "minor_contracts",
      ocid: row.ocid,
      awardId: row.award_id,
      supplierId: row.supplier_id,
      supplierName: row.supplier_name,
      buyerName: row.buyer_name,
      valorMonto: row.valor_monto === null ? null : Number(row.valor_monto),
      valorMoneda: null,
      fecha: row.fecha,
    })),
  ];

  // Los contratos ya vienen pre-filtrados por RUC sancionado -- solo hace falta
  // mapear cada `supplierId` de vuelta a su RUC.
  const rucBySupplierId = new Map<string, string>();
  for (const row of contractRows) {
    if (!row.supplierId) continue;
    const ruc = extractRuc(row.supplierId);
    if (ruc) rucBySupplierId.set(row.supplierId, ruc);
  }

  const alertas = contractRows
    .map((row) => {
      const ruc = row.supplierId ? rucBySupplierId.get(row.supplierId) ?? null : null;
      if (!ruc) return null;
      const inhabilitaciones = inhabilitacionesByRuc.get(ruc) ?? [];
      if (inhabilitaciones.length === 0) return null;
      const coincidencia = peorCoincidencia(row.fecha, inhabilitaciones, ventanaDiasPostSancion);
      if (!coincidencia) return null;

      return {
        origen: row.origen,
        ocid: row.ocid,
        awardId: row.awardId,
        ruc,
        supplierName: row.supplierName,
        buyerName: row.buyerName,
        valorMonto: row.valorMonto,
        valorMoneda: row.valorMoneda,
        fechaContrato: row.fecha,
        severidad: coincidencia.severidad,
        resolucionInhabilitacion: coincidencia.resolucion,
        diasDesdeFinSancion: coincidencia.diasDesdeFinSancion,
      };
    })
    .filter((item): item is NonNullable<typeof item> => item !== null)
    .sort((a, b) => {
      if (a.severidad !== b.severidad) return a.severidad === "DURANTE_SANCION_VIGENTE" ? -1 : 1;
      const diasA = a.diasDesdeFinSancion ?? -1;
      const diasB = b.diasDesdeFinSancion ?? -1;
      return diasA - diasB;
    });

  return {
    status: 200,
    body: {
      departamento: wantedDepartamento ?? "TODOS",
      ventanaDiasPostSancion,
      totalAlertas: alertas.length,
      alertas,
      nota:
        "DURANTE_SANCION_VIGENTE: el contrato se adjudicó mientras la inhabilitación estaba activa. " +
        "POCO_DESPUES_DE_SANCION: el contrato se adjudicó dentro de la ventana configurada después de que la inhabilitación terminó. " +
        "Ninguna de las dos conclusiones determina irregularidad por sí sola — requiere revisión humana, mismo estándar que el resto de señales del catálogo.",
    },
  };
}
