import type { NeonRow } from "../../db/neon-pool.js";
import type { ToolHandlerContext, HandlerResult } from "../registry.js";
import { extractRuc, referenciaContrato, crossAppPool, crossAppUnavailable, type ContractRow } from "./_helpers.js";

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

interface InhabRow extends NeonRow {
  ruc: string;
  estado: string | null;
}

/**
 * Handler para `proveedores_sancionados_radar` — GET /api/radar.
 * SQL idéntico a apps/proveedores-sancionados/api/src/routes/radar.ts, que a
 * su vez reusa (vía import local, no posible acá) las mismas queries de
 * crossref.ts para construir el cruce ámbito nacional + soloInhabilitados.
 */
export async function get(ctx: ToolHandlerContext): Promise<HandlerResult> {
  const { db, args, env } = ctx;
  const comprasDb = crossAppPool("compras-publicas", env);
  if (!comprasDb) return crossAppUnavailable("compras-publicas");

  const ventanaDias = args.ventanaDiasNuevos ? Number(args.ventanaDiasNuevos) : 7;
  if (!Number.isInteger(ventanaDias) || ventanaDias < 1 || ventanaDias > 90) {
    return { status: 400, body: { error: "ventanaDiasNuevos debe ser un entero entre 1 y 90." } };
  }

  const [{ rows: awardRows }, { rows: minorContractRows }, comprasFreshnessRows] = await Promise.all([
    comprasDb.query<AwardRow>(
      `SELECT ocid, award_id, supplier_id, supplier_name, buyer_name, valor_monto, valor_moneda, fecha
       FROM awards`
    ),
    comprasDb.query<MinorContractRow>(
      `SELECT c.contracting_id, c.ocid, c.award_id, c.winning_supplier_id AS supplier_id,
              s.legal_name AS supplier_name, m.official_name AS buyer_name,
              c.awarded_amount AS valor_monto, c.award_date AS fecha
       FROM minor_contracts c
       LEFT JOIN supplier_profiles s ON s.supplier_id = c.winning_supplier_id
       LEFT JOIN municipalities m ON m.municipality_id = c.municipality_id
       WHERE c.winning_supplier_id IS NOT NULL`
    ),
    comprasDb.query<{ fetched_at: string | Date | null }>(
      `SELECT fetched_at FROM raw_ocds_batches ORDER BY fetched_at DESC LIMIT 1`
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

  const rucBySupplierId = new Map<string, string>();
  for (const row of contractRows) {
    if (!row.supplierId) continue;
    const ruc = extractRuc(row.supplierId);
    if (ruc) rucBySupplierId.set(row.supplierId, ruc);
  }
  const rucs = [...new Set(rucBySupplierId.values())];

  const inhabByRuc = new Map<string, boolean>();
  if (rucs.length > 0) {
    const { rows: inhabRows } = await db.query<InhabRow>(
      `SELECT i.ruc, i.estado, i.periodo_inhabilitacion, i.resolucion, i.desde, i.hasta, b.fetched_at
         FROM inhabilitaciones i
         JOIN raw_sanciones_batches b ON b.id = i.source_batch_id
        WHERE i.ruc = ANY($1)`,
      [rucs]
    );
    for (const r of inhabRows) {
      if ((r.estado ?? "").toUpperCase() === "VIGENTE") inhabByRuc.set(r.ruc, true);
    }
  }

  const [freshnessRows, recientesRows, dobleInhabRows] = await Promise.all([
    db.query<{ ultima_ejecucion: string | Date | null; filas_ingeridas: number | string | null }>(
      `SELECT ultima_ejecucion, filas_ingeridas FROM ingestion_log
       WHERE fuente = 'tce_osce' ORDER BY ultima_ejecucion DESC LIMIT 1`
    ),
    db.query<{ ruc: string; referencia_contrato: string; primera_vez_visto: string | Date }>(
      `SELECT ruc, referencia_contrato, primera_vez_visto FROM sanciones_contratos_vistos
       WHERE primera_vez_visto > now() - ($1 || ' days')::interval
       ORDER BY primera_vez_visto DESC`,
      [ventanaDias]
    ),
    db.query<{ total: string }>(
      `SELECT COUNT(DISTINCT COALESCE(ij.dni, i.dni, i.ruc)) AS total
       FROM inhabilitaciones_judiciales ij
       JOIN inhabilitaciones i ON (ij.dni IS NOT NULL AND i.dni = ij.dni) OR i.ruc = ij.ruc_dni`
    ),
  ]);

  const diasDesdeIngesta = (fecha: string | Date | null | undefined) =>
    fecha ? Math.floor((Date.now() - new Date(fecha).getTime()) / 86_400_000) : null;

  const resultadosConSancion = contractRows
    .map((row) => {
      const ruc = row.supplierId ? rucBySupplierId.get(row.supplierId) ?? null : null;
      if (!ruc || !inhabByRuc.get(ruc)) return null;
      return { ...row, ruc };
    })
    .filter((r): r is ContractRow & { ruc: string } => r !== null);

  const porProveedor = new Map<string, { ruc: string; supplierName: string | null; montoTotal: number; contratos: number }>();
  const porEntidad = new Map<string, { buyerName: string; montoTotal: number; contratos: number }>();
  let totalContratosMonto = 0;
  let contratosConMontoDesconocido = 0;
  let contratosEnOtraMoneda = 0;
  let montoEnOtraMoneda = 0;

  for (const r of resultadosConSancion) {
    const esOtraMoneda = r.valorMoneda !== null && r.valorMoneda !== "PEN";
    if (r.valorMonto === null) {
      contratosConMontoDesconocido++;
    } else if (esOtraMoneda) {
      contratosEnOtraMoneda++;
      montoEnOtraMoneda += r.valorMonto;
    } else {
      totalContratosMonto += r.valorMonto;
    }

    const prov = porProveedor.get(r.ruc) ?? { ruc: r.ruc, supplierName: r.supplierName, montoTotal: 0, contratos: 0 };
    if (!esOtraMoneda) prov.montoTotal += r.valorMonto ?? 0;
    prov.contratos += 1;
    porProveedor.set(r.ruc, prov);

    if (r.buyerName) {
      const ent = porEntidad.get(r.buyerName) ?? { buyerName: r.buyerName, montoTotal: 0, contratos: 0 };
      if (!esOtraMoneda) ent.montoTotal += r.valorMonto ?? 0;
      ent.contratos += 1;
      porEntidad.set(r.buyerName, ent);
    }
  }

  const top5Proveedores = [...porProveedor.values()].sort((a, b) => b.montoTotal - a.montoTotal).slice(0, 5);
  const top5Entidades = [...porEntidad.values()].sort((a, b) => b.montoTotal - a.montoTotal).slice(0, 5);

  const recientesSet = new Set(recientesRows.rows.map((r) => `${r.ruc} ${r.referencia_contrato}`));
  const primeraVezPorClave = new Map(recientesRows.rows.map((r) => [`${r.ruc} ${r.referencia_contrato}`, r.primera_vez_visto]));
  const alertas = resultadosConSancion
    .filter((r) => recientesSet.has(`${r.ruc} ${referenciaContrato(r)}`))
    .map((r) => {
      const clave = `${r.ruc} ${referenciaContrato(r)}`;
      const primeraVezVisto = primeraVezPorClave.get(clave) ?? null;
      return {
        tipo: "NUEVO_CONTRATO_SANCIONADO",
        ruc: r.ruc,
        supplierName: r.supplierName,
        buyerName: r.buyerName,
        monto: r.valorMonto,
        moneda: r.valorMoneda,
        fecha: r.fecha,
        primeraVezVisto,
        diasDesdeDeteccion: diasDesdeIngesta(primeraVezVisto),
      };
    });

  return {
    status: 200,
    body: {
      generadoEn: new Date().toISOString(),
      frescura: {
        proveedoresSancionados: {
          ultimaIngesta: freshnessRows.rows[0]?.ultima_ejecucion ?? null,
          diasSinActualizar: diasDesdeIngesta(freshnessRows.rows[0]?.ultima_ejecucion),
          filasIngeridas: freshnessRows.rows[0]?.filas_ingeridas ?? null,
        },
        comprasPublicas: {
          ultimaIngesta: comprasFreshnessRows.rows[0]?.fetched_at ?? null,
          diasSinActualizar: diasDesdeIngesta(comprasFreshnessRows.rows[0]?.fetched_at),
        },
      },
      resumen: {
        totalProveedores: porProveedor.size,
        totalContratosMonto,
        moneda: "PEN",
        contratosConMontoDesconocido,
        contratosEnOtraMoneda,
        montoEnOtraMoneda,
        top5Proveedores,
        top5Entidades,
        nuevosDesdeUltimaCorrida: recientesRows.rows.length,
        ventanaDiasNuevos: ventanaDias,
        proveedoresDobleInhabilitacion: Number(dobleInhabRows.rows[0]?.total ?? 0),
      },
      alertas,
      fuente: {
        dataset: "Cruce TCE/OSCE (inhabilitaciones) x OCDS/SEACE (compras-publicas), ámbito nacional",
        nota:
          "totalContratosMonto (moneda=PEN) excluye contratos en otra moneda (hoy: 15 en USD, ver " +
          "contratosEnOtraMoneda/montoEnOtraMoneda) y los sin monto conocido (contratosConMontoDesconocido). " +
          "minor_contracts no registra moneda en la fuente -- se asume PEN por convención del dataset " +
          "(contratación menor peruana se licita en soles), no por un campo explícito como en awards.USD. " +
          "nuevosDesdeUltimaCorrida depende de que /api/crossref (soloLectura=false) se haya corrido en la " +
          "ventana pedida -- no hay scheduler todavía, ver docs/BACKLOG_Scheduler_Ingesta_Diseno_v1.md.",
      },
    },
  };
}
