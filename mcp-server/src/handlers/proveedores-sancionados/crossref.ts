import type { NeonRow } from "../../db/neon-pool.js";
import type { ToolHandlerContext, HandlerResult } from "../registry.js";
import {
  extractRuc,
  consolidarEstadoTemporal,
  vigenteEnFecha,
  referenciaContrato,
  crossAppPool,
  crossAppUnavailable,
  type ContractRow,
} from "./_helpers.js";

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
  periodo_inhabilitacion: string | null;
  resolucion: string;
  desde: string | Date | null;
  hasta: string | Date | null;
  fetched_at: string | Date | null;
}

interface FiscalRow extends NeonRow {
  ruc: string;
  estado_contribuyente: string | null;
  condicion_domicilio: string | null;
  fetched_at: string | Date | null;
}

/**
 * Handler para `proveedores_sancionados_crossref` — GET /api/crossref.
 *
 * Cruce proveedor <-> Tribunal de Contrataciones por RUC exacto (extraído de
 * `supplier_id`/`winning_supplier_id`), cubriendo tanto adjudicaciones OCDS
 * (`awards`) como contratos menores (`minor_contracts`; `origen` distingue cada
 * fila). El estado de la fuente no basta para calificar una contratación
 * histórica: el cruce conserva por separado el periodo de inhabilitación, la
 * fecha de la contratación y la fecha de extracción.
 *
 * `departamento=TODOS` agrega awards+minor_contracts a nivel nacional en una
 * sola consulta. `soloNuevos` filtra a los casos marcados
 * `esNuevoDesdeUltimaCorrida` por la tabla `sanciones_contratos_vistos`.
 */
export async function list(ctx: ToolHandlerContext): Promise<HandlerResult> {
  const { db, args, env } = ctx;
  const comprasDb = crossAppPool("compras-publicas", env);
  if (!comprasDb) return crossAppUnavailable("compras-publicas");
  const fiscalDb = crossAppPool("identidad-fiscal", env);
  if (!fiscalDb) return crossAppUnavailable("identidad-fiscal");

  const wantedDepartamento = args.departamento ? (args.departamento as string).toUpperCase().trim() : "LA LIBERTAD";
  const soloInhabilitados = args.soloInhabilitados === "true";
  const soloNuevos = args.soloNuevos === "true";
  const soloLectura = args.soloLectura === "true";
  const ambitoNacional = wantedDepartamento === "TODOS";

  const [{ rows: awardRows }, { rows: minorContractRows }] = await Promise.all([
    ambitoNacional
      ? comprasDb.query<AwardRow>(
          `SELECT ocid, award_id, supplier_id, supplier_name, buyer_name, valor_monto, valor_moneda, fecha
           FROM awards`
        )
      : comprasDb.query<AwardRow>(
          `SELECT ocid, award_id, supplier_id, supplier_name, buyer_name, valor_monto, valor_moneda, fecha
           FROM awards WHERE departamento = $1`,
          [wantedDepartamento]
        ),
    ambitoNacional
      ? comprasDb.query<MinorContractRow>(
          `SELECT c.contracting_id, c.ocid, c.award_id, c.winning_supplier_id AS supplier_id,
                  s.legal_name AS supplier_name, m.official_name AS buyer_name,
                  c.awarded_amount AS valor_monto, c.award_date AS fecha
           FROM minor_contracts c
           LEFT JOIN supplier_profiles s ON s.supplier_id = c.winning_supplier_id
           LEFT JOIN municipalities m ON m.municipality_id = c.municipality_id
           WHERE c.winning_supplier_id IS NOT NULL`
        )
      : comprasDb.query<MinorContractRow>(
          `SELECT c.contracting_id, c.ocid, c.award_id, c.winning_supplier_id AS supplier_id,
                  s.legal_name AS supplier_name, m.official_name AS buyer_name,
                  c.awarded_amount AS valor_monto, c.award_date AS fecha
           FROM minor_contracts c
           LEFT JOIN supplier_profiles s ON s.supplier_id = c.winning_supplier_id
           LEFT JOIN municipalities m ON m.municipality_id = c.municipality_id
           WHERE c.winning_supplier_id IS NOT NULL AND (m.department = $1 OR c.execution_department = $1)`,
          [wantedDepartamento]
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
    // minor_contracts no registra moneda -- se deja null en vez de asumir
    // soles, para no inventar un dato que la fuente no persiste.
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

  const inhabByRuc = new Map<string, {
    estado: string | null;
    periodo: string | null;
    resolucion: string;
    desde: string | Date | null;
    hasta: string | Date | null;
    extraidoEn: string | Date | null;
  }[]>();
  const estadoTributarioByRuc = new Map<string, { estado: string | null; condicion: string | null; extraidoEn: string | Date | null }>();

  if (rucs.length > 0) {
    const { rows: inhabRows } = await db.query<InhabRow>(
      `SELECT i.ruc, i.estado, i.periodo_inhabilitacion, i.resolucion, i.desde, i.hasta, b.fetched_at
         FROM inhabilitaciones i
         JOIN raw_sanciones_batches b ON b.id = i.source_batch_id
        WHERE i.ruc = ANY($1)`,
      [rucs]
    );
    for (const r of inhabRows) {
      if (!inhabByRuc.has(r.ruc)) inhabByRuc.set(r.ruc, []);
      inhabByRuc.get(r.ruc)!.push({ estado: r.estado, periodo: r.periodo_inhabilitacion, resolucion: r.resolucion, desde: r.desde, hasta: r.hasta, extraidoEn: r.fetched_at });
    }

    const { rows: fiscalRows } = await fiscalDb.query<FiscalRow>(
      `SELECT c.ruc, c.estado_contribuyente, c.condicion_domicilio, b.fetched_at
         FROM contribuyentes c
         JOIN raw_padron_batches b ON b.id = c.source_batch_id
        WHERE c.ruc = ANY($1)`,
      [rucs]
    );
    for (const r of fiscalRows) {
      estadoTributarioByRuc.set(r.ruc, { estado: r.estado_contribuyente, condicion: r.condicion_domicilio, extraidoEn: r.fetched_at });
    }
  }

  // Casos con inhabilitacion vigente son los unicos que vale la pena
  // "recordar" -- el resto del cruce no cambia de valor entre corridas.
  const sancionadosRucContrato = contractRows
    .map((row) => {
      const ruc = row.supplierId ? rucBySupplierId.get(row.supplierId) ?? null : null;
      if (!ruc) return null;
      const inhabilitaciones = inhabByRuc.get(ruc) ?? [];
      const tieneInhabilitacionVigente = inhabilitaciones.some((i) => (i.estado ?? "").toUpperCase() === "VIGENTE");
      if (!tieneInhabilitacionVigente) return null;
      return { ruc, referencia: referenciaContrato(row) };
    })
    .filter((item): item is { ruc: string; referencia: string } => item !== null);

  // `INSERT ... ON CONFLICT DO NOTHING RETURNING` es atómico: solo devuelve las
  // filas que esta sentencia insertó de verdad, así que sirve de fuente de
  // verdad directa de "nuevo desde la última corrida" sin una lectura previa.
  const nuevosDesdeUltimaCorrida = new Set<string>();
  if (!soloLectura && sancionadosRucContrato.length > 0) {
    const paresUnicos = [...new Map(sancionadosRucContrato.map((item) => [`${item.ruc} ${item.referencia}`, item])).values()];
    const values = paresUnicos.map((_, i) => `($${i * 2 + 1}, $${i * 2 + 2})`).join(", ");
    const params = paresUnicos.flatMap((item) => [item.ruc, item.referencia]);
    const { rows: insertados } = await db.query<{ ruc: string; referencia_contrato: string }>(
      `INSERT INTO sanciones_contratos_vistos (ruc, referencia_contrato) VALUES ${values}
       ON CONFLICT (ruc, referencia_contrato) DO NOTHING
       RETURNING ruc, referencia_contrato`,
      params
    );
    for (const row of insertados) {
      nuevosDesdeUltimaCorrida.add(`${row.ruc} ${row.referencia_contrato}`);
    }
  }

  const resultados = contractRows.map((row) => {
    const supplierId = row.supplierId;
    const ruc = supplierId ? rucBySupplierId.get(supplierId) ?? null : null;
    const inhabilitaciones = ruc ? inhabByRuc.get(ruc) ?? [] : [];
    const tieneInhabilitacionVigente = inhabilitaciones.some((i) => (i.estado ?? "").toUpperCase() === "VIGENTE");
    const inhabilitadoEnFechaAdjudicacion = consolidarEstadoTemporal(
      inhabilitaciones.map((i) => vigenteEnFecha(row.fecha, i.desde, i.hasta))
    );
    const fiscal = ruc ? estadoTributarioByRuc.get(ruc) ?? null : null;
    const inhabilitacionExtraidaEn = inhabilitaciones.reduce<string | Date | null>((latest, item) => {
      if (!item.extraidoEn) return latest;
      if (!latest || new Date(item.extraidoEn).getTime() > new Date(latest).getTime()) return item.extraidoEn;
      return latest;
    }, null);

    return {
      origen: row.origen,
      ocid: row.ocid,
      awardId: row.awardId,
      supplierId,
      ruc,
      supplierName: row.supplierName,
      buyerName: row.buyerName,
      valorMonto: row.valorMonto,
      valorMoneda: row.valorMoneda,
      fecha: row.fecha,
      rucValido: ruc !== null,
      fechaAdjudicacion: row.fecha,
      inhabilitacionesEncontradas: inhabilitaciones.length,
      tieneInhabilitacionVigente,
      estadoActualFuente: {
        tieneInhabilitacionVigente,
        inhabilitacionExtraidaEn,
        estadoContribuyente: fiscal?.estado ?? null,
        condicionDomicilio: fiscal?.condicion ?? null,
        padronExtraidoEn: fiscal?.extraidoEn ?? null,
      },
      inhabilitadoEnFechaAdjudicacion,
      estadoTributarioEnFechaAdjudicacion: "NO_DISPONIBLE",
      estadoContribuyente: fiscal?.estado ?? null,
      condicionDomicilio: fiscal?.condicion ?? null,
      // Solo tiene sentido para casos con inhabilitacion vigente -- en el resto
      // queda `false` porque no hay nada que "vigilar" ahi.
      esNuevoDesdeUltimaCorrida: ruc !== null && tieneInhabilitacionVigente
        ? nuevosDesdeUltimaCorrida.has(`${ruc} ${referenciaContrato(row)}`)
        : false,
    };
  });

  const filtrados = resultados
    .filter((r) => !soloInhabilitados || r.tieneInhabilitacionVigente)
    .filter((r) => !soloNuevos || r.esNuevoDesdeUltimaCorrida);

  return {
    status: 200,
    body: {
      departamento: wantedDepartamento,
      resultados: filtrados,
    },
  };
}
