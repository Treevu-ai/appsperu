import { Router } from "express";
import { z } from "zod";
import { extractRuc } from "@appsperu/shared-identity";
import { pool } from "../db/pool.js";
import { comprasPool } from "../db/compras-pool.js";
import { fiscalPool } from "../db/fiscal-pool.js";
import { asyncHandler } from "../lib/async-handler.js";
import { parseQuery } from "../lib/validate-query.js";
import { consolidarEstadoTemporal, vigenteEnFecha } from "../lib/temporal-status.js";

export const crossrefRouter = Router();

const CrossrefQuerySchema = z.object({
  departamento: z.string().min(1).optional(),
  soloInhabilitados: z.enum(["true", "false"]).optional(),
  // PV-06: `TODOS` agrega awards+minor_contracts sin filtrar por departamento
  // (una sola consulta nacional, no un loop de 25 llamadas por región).
  // `soloNuevos` filtra a los casos que PV-05 marcó como nunca vistos antes —
  // el punto de entrada pensado para vigilancia, no para el reporte completo.
  soloNuevos: z.enum(["true", "false"]).optional(),
});

type ContractRow = {
  origen: "awards" | "minor_contracts";
  ocid: string | null;
  awardId: string | null;
  supplierId: string | null;
  supplierName: string | null;
  buyerName: string | null;
  valorMonto: number | null;
  valorMoneda: string | null;
  fecha: string | Date | null;
};

/**
 * Identificador estable de un contrato para `sanciones_contratos_vistos`
 * (PV-05). `ocid`+`awardId` ya son la clave de unicidad de `awards`
 * (`ocid, award_id, supplier_id`) y de `minor_contracts` (`ocid, award_id`)
 * en compras-publicas -- combinarlos con `origen` evita colisiones entre
 * ambas tablas sin depender de un ID adicional que hoy no se selecciona.
 */
function referenciaContrato(row: Pick<ContractRow, "origen" | "ocid" | "awardId">): string {
  return `${row.origen}:${row.ocid ?? ""}:${row.awardId ?? ""}`;
}

/**
 * Cruce proveedor <-> Tribunal de Contrataciones, por RUC exacto (extraído
 * de `supplier_id`/`winning_supplier_id` de compras-publicas, mismo patrón
 * que identidad-fiscal/crossref.ts). El estado de la fuente no basta para
 * calificar una contratación historica: el cruce conserva por separado el
 * periodo de inhabilitacion, la fecha de la contratacion y la fecha de
 * extraccion. Cubre tanto adjudicaciones OCDS (`awards`) como contratos
 * menores (`minor_contracts`, campo `origen` distingue cada fila -- CX-01).
 */
crossrefRouter.get("/", asyncHandler(async (req, res) => {
  const parsed = parseQuery(CrossrefQuerySchema, req.query, res);
  if (!parsed) return;
  const wantedDepartamento = parsed.departamento?.toUpperCase().trim() ?? "LA LIBERTAD";
  const soloInhabilitados = parsed.soloInhabilitados === "true";
  const soloNuevos = parsed.soloNuevos === "true";
  const ambitoNacional = wantedDepartamento === "TODOS";

  const [{ rows: awardRows }, { rows: minorContractRows }] = await Promise.all([
    ambitoNacional
      ? comprasPool.query(
          `SELECT ocid, award_id, supplier_id, supplier_name, buyer_name, valor_monto, valor_moneda, fecha
           FROM awards`
        )
      : comprasPool.query(
          `SELECT ocid, award_id, supplier_id, supplier_name, buyer_name, valor_monto, valor_moneda, fecha
           FROM awards WHERE departamento = $1`,
          [wantedDepartamento]
        ),
    ambitoNacional
      ? comprasPool.query(
          `SELECT c.contracting_id, c.ocid, c.award_id, c.winning_supplier_id AS supplier_id,
                  s.legal_name AS supplier_name, m.official_name AS buyer_name,
                  c.awarded_amount AS valor_monto, c.award_date AS fecha
           FROM minor_contracts c
           LEFT JOIN supplier_profiles s ON s.supplier_id = c.winning_supplier_id
           LEFT JOIN municipalities m ON m.municipality_id = c.municipality_id
           WHERE c.winning_supplier_id IS NOT NULL`
        )
      : comprasPool.query(
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
    estado: string;
    periodo: string | null;
    resolucion: string;
    desde: string | Date | null;
    hasta: string | Date | null;
    extraidoEn: string | Date | null;
  }[]>();
  const estadoTributarioByRuc = new Map<string, { estado: string | null; condicion: string | null; extraidoEn: string | Date | null }>();

  if (rucs.length > 0) {
    const { rows: inhabRows } = await pool.query(
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

    const { rows: fiscalRows } = await fiscalPool.query(
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

  // PV-05: casos con inhabilitacion vigente son los unicos que vale la pena
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

  // PV-05 (revisión de código 2026-09-12): un SELECT seguido de un INSERT
  // aparte dejaba una ventana de carrera entre dos corridas concurrentes del
  // cruce (ambas podrían ver el caso como "no visto" antes de que la otra
  // termine de insertar). `INSERT ... ON CONFLICT DO NOTHING RETURNING` es
  // atómico: solo devuelve las filas que esta sentencia insertó de verdad,
  // así que sirve como fuente de verdad directa de "nuevo desde la última
  // corrida" sin depender de una lectura previa.
  const nuevosDesdeUltimaCorrida = new Set<string>();
  if (sancionadosRucContrato.length > 0) {
    // Deduplicar antes de insertar: el mismo par RUC+contrato puede repetirse
    // si `contractRows` tiene mas de una fila para el mismo award (no deberia,
    // pero el indice unico de la tabla es la garantia real, no este dedupe).
    const paresUnicos = [...new Map(sancionadosRucContrato.map((item) => [`${item.ruc} ${item.referencia}`, item])).values()];
    const values = paresUnicos.map((_, i) => `($${i * 2 + 1}, $${i * 2 + 2})`).join(", ");
    const params = paresUnicos.flatMap((item) => [item.ruc, item.referencia]);
    const { rows: insertados } = await pool.query<{ ruc: string; referencia_contrato: string }>(
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
      // PV-05: solo tiene sentido para casos con inhabilitacion vigente --
      // en el resto queda `false` porque no hay nada que "vigilar" ahi.
      esNuevoDesdeUltimaCorrida: ruc !== null && tieneInhabilitacionVigente
        ? nuevosDesdeUltimaCorrida.has(`${ruc} ${referenciaContrato(row)}`)
        : false,
    };
  });

  const filtrados = resultados
    .filter((r) => !soloInhabilitados || r.tieneInhabilitacionVigente)
    .filter((r) => !soloNuevos || r.esNuevoDesdeUltimaCorrida);

  res.json({
    departamento: wantedDepartamento,
    resultados: filtrados,
  });
}));
