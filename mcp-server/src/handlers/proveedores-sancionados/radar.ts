import type { NeonRow } from "../../db/neon-pool.js";
import type { ToolHandlerContext, HandlerResult } from "../registry.js";
import { extractRuc, referenciaContrato, vigenteEnFecha, crossAppPool, crossAppUnavailable, type ContractRow } from "./_helpers.js";

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
  desde: string | Date | null;
  hasta: string | Date | null;
}

interface DobleInhabRow extends NeonRow {
  dni_comun: string | null;
  ruc_administrativo: string;
  admin_desde: string | Date | null;
  admin_hasta: string | Date | null;
  judicial_desde: string | Date | null;
  judicial_hasta: string | Date | null;
}

/**
 * Handler para `proveedores_sancionados_radar` — GET /api/radar.
 * SQL idéntico a apps/proveedores-sancionados/api/src/routes/radar.ts (copia
 * literal, no una llamada compartida -- ver docblock de ese archivo).
 * RCC-09 (signals/redes) queda fuera, mismo criterio que el route.
 */
export async function get(ctx: ToolHandlerContext): Promise<HandlerResult> {
  const { db, args, env } = ctx;
  const comprasDb = crossAppPool("compras-publicas", env);
  if (!comprasDb) return crossAppUnavailable("compras-publicas");

  const ventanaDias = args.ventanaDiasNuevos ? Number(args.ventanaDiasNuevos) : 7;
  if (!Number.isInteger(ventanaDias) || ventanaDias < 1 || ventanaDias > 90) {
    return { status: 400, body: { error: "ventanaDiasNuevos debe ser un entero entre 1 y 90." } };
  }
  const hoy = new Date().toISOString().slice(0, 10);

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

  const sancionVigenteDesdeRuc = new Map<string, string | Date>();
  if (rucs.length > 0) {
    const { rows: inhabRows } = await db.query<InhabRow>(
      `SELECT i.ruc, i.estado, i.periodo_inhabilitacion, i.resolucion, i.desde, i.hasta, b.fetched_at
         FROM inhabilitaciones i
         JOIN raw_sanciones_batches b ON b.id = i.source_batch_id
        WHERE i.ruc = ANY($1)`,
      [rucs]
    );
    for (const r of inhabRows) {
      if ((r.estado ?? "").toUpperCase() !== "VIGENTE") continue;
      if (vigenteEnFecha(hoy, r.desde, r.hasta) !== true) continue;
      const actual = sancionVigenteDesdeRuc.get(r.ruc);
      if (!actual || (r.desde && new Date(r.desde).getTime() < new Date(actual).getTime())) {
        sancionVigenteDesdeRuc.set(r.ruc, r.desde as string | Date);
      }
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
    db.query<DobleInhabRow>(
      `SELECT COALESCE(ij.dni, i.dni) AS dni_comun, i.ruc AS ruc_administrativo,
              i.desde AS admin_desde, i.hasta AS admin_hasta,
              ij.fecha_inicio AS judicial_desde, ij.fecha_fin AS judicial_hasta
       FROM inhabilitaciones_judiciales ij
       JOIN inhabilitaciones i ON (ij.dni IS NOT NULL AND i.dni = ij.dni) OR i.ruc = ij.ruc_dni`
    ),
  ]);

  const diasDesdeFecha = (fecha: string | Date | null | undefined) =>
    fecha ? Math.floor((Date.now() - new Date(fecha).getTime()) / 86_400_000) : null;

  const identificadoresDobleVigente = new Set<string>();
  for (const r of dobleInhabRows.rows) {
    const administrativaVigente = vigenteEnFecha(hoy, r.admin_desde, r.admin_hasta);
    const judicialVigente = vigenteEnFecha(hoy, r.judicial_desde, r.judicial_hasta);
    if (administrativaVigente === true && judicialVigente === true) {
      identificadoresDobleVigente.add(r.dni_comun ?? r.ruc_administrativo);
    }
  }

  const resultadosConSancion = contractRows
    .map((row) => {
      const ruc = row.supplierId ? rucBySupplierId.get(row.supplierId) ?? null : null;
      if (!ruc || !sancionVigenteDesdeRuc.has(ruc)) return null;
      return { ...row, ruc };
    })
    .filter((r): r is ContractRow & { ruc: string } => r !== null);

  const contratosUnicosVistos = new Set<string>();
  let totalContratosMonto = 0;
  let contratosConMontoDesconocido = 0;
  let contratosEnOtraMoneda = 0;
  const montoPorOtraMoneda = new Map<string, number>();

  const porProveedor = new Map<string, { ruc: string; supplierName: string | null; montoTotal: number; contratos: number }>();
  const porEntidad = new Map<string, { buyerName: string; montoTotal: number; contratos: number }>();

  for (const r of resultadosConSancion) {
    const esOtraMoneda = r.valorMoneda !== null && r.valorMoneda !== "PEN";
    const claveContrato = referenciaContrato(r);

    if (!contratosUnicosVistos.has(claveContrato)) {
      contratosUnicosVistos.add(claveContrato);
      if (r.valorMonto === null) {
        contratosConMontoDesconocido++;
      } else if (esOtraMoneda) {
        contratosEnOtraMoneda++;
        const moneda = r.valorMoneda as string;
        montoPorOtraMoneda.set(moneda, (montoPorOtraMoneda.get(moneda) ?? 0) + r.valorMonto);
      } else {
        totalContratosMonto += r.valorMonto;
      }
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
      const sancionDesde = sancionVigenteDesdeRuc.get(r.ruc) ?? null;
      return {
        tipo: "NUEVO_CONTRATO_SANCIONADO",
        ruc: r.ruc,
        supplierName: r.supplierName,
        buyerName: r.buyerName,
        monto: r.valorMonto,
        moneda: r.valorMoneda,
        fecha: r.fecha,
        primeraVezVisto,
        diasDesdeSancion: diasDesdeFecha(sancionDesde),
        diasDesdeDeteccion: diasDesdeFecha(primeraVezVisto),
      };
    });

  return {
    status: 200,
    body: {
      generadoEn: new Date().toISOString(),
      frescura: {
        proveedoresSancionados: {
          ultimaIngesta: freshnessRows.rows[0]?.ultima_ejecucion ?? null,
          diasSinActualizar: diasDesdeFecha(freshnessRows.rows[0]?.ultima_ejecucion),
          filasIngeridas: freshnessRows.rows[0]?.filas_ingeridas ?? null,
        },
        comprasPublicas: {
          ultimaIngesta: comprasFreshnessRows.rows[0]?.fetched_at ?? null,
          diasSinActualizar: diasDesdeFecha(comprasFreshnessRows.rows[0]?.fetched_at),
        },
      },
      resumen: {
        totalProveedores: porProveedor.size,
        totalContratosMonto,
        moneda: "PEN",
        contratosConMontoDesconocido,
        contratosEnOtraMoneda,
        montoPorOtraMoneda: Object.fromEntries(montoPorOtraMoneda),
        top5Proveedores,
        top5Entidades,
        nuevosDesdeUltimaCorrida: recientesRows.rows.length,
        ventanaDiasNuevos: ventanaDias,
        proveedoresDobleInhabilitacion: identificadoresDobleVigente.size,
      },
      alertas,
      fuente: {
        dataset: "Cruce TCE/OSCE (inhabilitaciones) x OCDS/SEACE (compras-publicas), ámbito nacional",
        nota:
          "totalContratosMonto (moneda=PEN) cuenta cada contrato una sola vez (un award compartido por varios " +
          "proveedores sancionados no se suma más de una vez), excluye contratos en otra moneda " +
          "(contratosEnOtraMoneda/montoPorOtraMoneda, desglosado por moneda) y los sin monto conocido " +
          "(contratosConMontoDesconocido). top5Proveedores/top5Entidades SÍ reflejan el monto completo por cada " +
          "proveedor/entidad, aunque el award sea compartido -- es su exposición real, no doble conteo. " +
          "minor_contracts no registra moneda en la fuente -- se asume PEN por convención del dataset " +
          "(contratación menor peruana se licita en soles), no por un campo explícito como en awards.USD. " +
          "Sanciones vigentes verificadas por rango de fechas real (vigenteEnFecha), no solo por el campo " +
          "`estado` de la fuente. nuevosDesdeUltimaCorrida depende de que /api/crossref (soloLectura=false) se " +
          "haya corrido en la ventana pedida -- no hay scheduler todavía, ver " +
          "docs/BACKLOG_Scheduler_Ingesta_Diseno_v1.md. signals/redes (RCC-09) no están incluidos.",
      },
    },
  };
}
