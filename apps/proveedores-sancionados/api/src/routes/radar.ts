import { Router } from "express";
import { z } from "zod";
import { extractRuc } from "@appsperu/shared-identity";
import { pool } from "../db/pool.js";
import { comprasPool } from "../db/compras-pool.js";
import { asyncHandler } from "../lib/async-handler.js";
import { parseQuery } from "../lib/validate-query.js";
import { referenciaContrato } from "./crossref.js";

export const radarRouter = Router();

const RadarQuerySchema = z.object({
  ventanaDiasNuevos: z.coerce.number().int().min(1).max(90).optional().describe("Default 7."),
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
 * `GET /api/radar` — RCC-05 a RCC-09 (docs/prd/PRD-001-radar-captura-contractual.md).
 *
 * El PRD original proponía una app nueva (`radar-captura`) con su propio
 * pool a `compras-publicas`. Esa app ya existe en los hechos: esta misma
 * (`proveedores-sancionados`) ya tiene `comprasPool`/`fiscalPool` -- crear
 * una app aparte hubiera duplicado la conexión en vez de reusarla.
 *
 * Las queries de `awards`/`minor_contracts`/`inhabilitaciones` son una copia
 * literal de las de `crossref.ts` (no una llamada a su lógica compartida):
 * `sql-fidelity.test.ts` exige que el SQL de cada handler MCP sea
 * rastreable al route homónimo exacto, así que este route necesita su
 * propia copia para que `proveedores_sancionados_radar` (el handler MCP)
 * tenga de dónde copiarla también -- mismo patrón que el resto del catálogo,
 * que deliberadamente prefiere SQL duplicado y verificado a una función
 * compartida que un handler de Workers no podría importar de todas formas.
 *
 * `nuevosDesdeUltimaCorrida`/`alertas` se leen directo de
 * `sanciones_contratos_vistos` (sin recalcular el cruce con `soloLectura:
 * false`) -- ese flag solo lo debe escribir la corrida oficial
 * (`GET /api/crossref?soloNuevos=...`), nunca una vista de dashboard que
 * puede llamarse muchas veces. Si esa corrida oficial no se ha ejecutado en
 * la ventana pedida, `nuevosDesdeUltimaCorrida` da 0 aunque haya sanciones
 * nuevas sin detectar todavía -- no es "no hay novedades", es "nadie ha
 * corrido la detección" (ver docs/BACKLOG_Scheduler_Ingesta_Diseno_v1.md).
 */
radarRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const parsed = parseQuery(RadarQuerySchema, req.query, res);
    if (!parsed) return;
    const ventanaDias = parsed.ventanaDiasNuevos ?? 7;

    const [{ rows: awardRows }, { rows: minorContractRows }, comprasFreshnessRow] = await Promise.all([
      comprasPool.query(
        `SELECT ocid, award_id, supplier_id, supplier_name, buyer_name, valor_monto, valor_moneda, fecha
         FROM awards`
      ),
      comprasPool.query(
        `SELECT c.contracting_id, c.ocid, c.award_id, c.winning_supplier_id AS supplier_id,
                s.legal_name AS supplier_name, m.official_name AS buyer_name,
                c.awarded_amount AS valor_monto, c.award_date AS fecha
         FROM minor_contracts c
         LEFT JOIN supplier_profiles s ON s.supplier_id = c.winning_supplier_id
         LEFT JOIN municipalities m ON m.municipality_id = c.municipality_id
         WHERE c.winning_supplier_id IS NOT NULL`
      ),
      comprasPool.query<{ fetched_at: Date | null }>(
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
      const { rows: inhabRows } = await pool.query(
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

    const [freshnessRow, recientesRows, dobleInhabRow] = await Promise.all([
      pool.query<{ ultima_ejecucion: Date | null; filas_ingeridas: number | null }>(
        `SELECT ultima_ejecucion, filas_ingeridas FROM ingestion_log
         WHERE fuente = 'tce_osce' ORDER BY ultima_ejecucion DESC LIMIT 1`
      ),
      pool.query<{ ruc: string; referencia_contrato: string; primera_vez_visto: Date }>(
        `SELECT ruc, referencia_contrato, primera_vez_visto FROM sanciones_contratos_vistos
         WHERE primera_vez_visto > now() - ($1 || ' days')::interval
         ORDER BY primera_vez_visto DESC`,
        [ventanaDias]
      ),
      pool.query<{ total: string }>(
        `SELECT COUNT(DISTINCT COALESCE(ij.dni, i.dni, i.ruc)) AS total
         FROM inhabilitaciones_judiciales ij
         JOIN inhabilitaciones i ON (ij.dni IS NOT NULL AND i.dni = ij.dni) OR i.ruc = ij.ruc_dni`
      ),
    ]);

    const diasDesdeIngesta = (fecha: Date | null | undefined) =>
      fecha ? Math.floor((Date.now() - new Date(fecha).getTime()) / 86_400_000) : null;

    const resultadosConSancion = contractRows
      .map((row) => {
        const ruc = row.supplierId ? rucBySupplierId.get(row.supplierId) ?? null : null;
        if (!ruc || !inhabByRuc.get(ruc)) return null;
        return { ...row, ruc };
      })
      .filter((r): r is ContractRow & { ruc: string } => r !== null);

    // `valorMoneda` es 'PEN' para la inmensa mayoría de `awards`, pero hay 15
    // filas reales en USD (verificado contra compras_publicas 2026-10-02) —
    // sumarlas junto a soles sin distinguir inflaría el total con montos de
    // otra magnitud/moneda. `minor_contracts` no registra moneda en la
    // fuente (null); se asume PEN por convención del dataset (toda la
    // contratación menor peruana se licita en soles), no porque el dato lo
    // confirme — distinto del caso USD, que sí es un dato explícito a
    // excluir.
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

    // alertas: cruzar las filas "vistas por primera vez" (tabla, sin volver
    // a correr el cruce) contra los resultados ya traídos, para mostrar
    // monto/entidad sin una tercera consulta a compras-publicas.
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

    res.json({
      generadoEn: new Date().toISOString(),
      frescura: {
        proveedoresSancionados: {
          ultimaIngesta: freshnessRow.rows[0]?.ultima_ejecucion ?? null,
          diasSinActualizar: diasDesdeIngesta(freshnessRow.rows[0]?.ultima_ejecucion),
          filasIngeridas: freshnessRow.rows[0]?.filas_ingeridas ?? null,
        },
        comprasPublicas: {
          ultimaIngesta: comprasFreshnessRow.rows[0]?.fetched_at ?? null,
          diasSinActualizar: diasDesdeIngesta(comprasFreshnessRow.rows[0]?.fetched_at),
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
        proveedoresDobleInhabilitacion: Number(dobleInhabRow.rows[0]?.total ?? 0),
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
    });
  })
);
