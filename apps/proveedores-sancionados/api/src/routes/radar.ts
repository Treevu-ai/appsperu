import { Router } from "express";
import { z } from "zod";
import { extractRuc } from "@appsperu/shared-identity";
import { pool } from "../db/pool.js";
import { comprasPool } from "../db/compras-pool.js";
import { asyncHandler } from "../lib/async-handler.js";
import { parseQuery } from "../lib/validate-query.js";
import { referenciaContrato } from "./crossref.js";
import { vigenteEnFecha } from "../lib/temporal-status.js";

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
 * `GET /api/radar` — RCC-05 a RCC-08 (docs/prd/PRD-001-radar-captura-contractual.md).
 *
 * El PRD original proponía una app nueva (`radar-captura`) con su propio
 * pool a `compras-publicas`. Esa app ya existe en los hechos: esta misma
 * (`proveedores-sancionados`) ya tiene `comprasPool`/`fiscalPool` -- crear
 * una app aparte hubiera duplicado la conexión en vez de reusarla.
 *
 * Las queries de `awards`/`minor_contracts`/`inhabilitaciones` son una copia
 * literal de las de `crossref.ts` (no una llamada a su función compartida
 * `computeCrossref`, que sigue existiendo pero solo la usa el router de
 * `crossref.ts`): `sql-fidelity.test.ts` exige que el SQL de cada handler
 * MCP sea rastreable a SU route homónimo, y un handler de Workers no podría
 * importar `computeCrossref` de todas formas (bundle distinto) -- mismo
 * patrón que el resto del catálogo, que prefiere SQL duplicado y verificado
 * a una función compartida entre route y handler.
 *
 * **RCC-09 (signals de minor_contracts, redes corporativas) queda fuera de
 * este endpoint a propósito.** El PRD los menciona en su schema de ejemplo,
 * pero integrarlos de verdad requiere la lógica completa de
 * `compras-publicas/observatory.ts` (signals S01-S13) y
 * `redes-proveedores.ts` (grafos de conformación societaria) -- no una
 * copia superficial. Se deja como follow-up explícito en vez de incluir un
 * campo `signals`/`redes` vacío o aproximado que un consumidor pueda
 * confundir con el feature real de esas apps.
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
    const hoy = new Date().toISOString().slice(0, 10);

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

    // `estado === 'VIGENTE'` es la etiqueta que trae la fuente al momento de
    // la extracción, no necesariamente la vigencia real hoy (una fila puede
    // seguir diciendo VIGENTE con `hasta` ya vencido, o `desde` futuro).
    // `vigenteEnFecha(hoy, desde, hasta)` es la verificación real -- mismo
    // criterio que `doble-inhabilitacion.ts` (hallazgo P1 de CodeRabbit en
    // PR #225, confirmado: sin esto, una sanción ya vencida contaba como
    // vigente en todo el resumen).
    const sancionVigenteDesdeRuc = new Map<string, string | Date>();
    if (rucs.length > 0) {
      const { rows: inhabRows } = await pool.query(
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
          sancionVigenteDesdeRuc.set(r.ruc, r.desde);
        }
      }
    }

    const [freshnessRow, recientesRows, dobleInhabRows] = await Promise.all([
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
      pool.query<{ dni_comun: string | null; ruc_administrativo: string; admin_desde: string | Date | null; admin_hasta: string | Date | null; judicial_desde: string | Date | null; judicial_hasta: string | Date | null }>(
        `SELECT COALESCE(ij.dni, i.dni) AS dni_comun, i.ruc AS ruc_administrativo,
                i.desde AS admin_desde, i.hasta AS admin_hasta,
                ij.fecha_inicio AS judicial_desde, ij.fecha_fin AS judicial_hasta
         FROM inhabilitaciones_judiciales ij
         JOIN inhabilitaciones i ON (ij.dni IS NOT NULL AND i.dni = ij.dni) OR i.ruc = ij.ruc_dni`
      ),
    ]);

    const diasDesdeFecha = (fecha: Date | string | null | undefined) =>
      fecha ? Math.floor((Date.now() - new Date(fecha).getTime()) / 86_400_000) : null;

    // Doble inhabilitación "hoy": la query trae todo cruce histórico por
    // identificador común; cuenta solo si AMBOS lados están vigentes en la
    // fecha actual (mismo criterio que arriba, hallazgo de CodeRabbit
    // confirmado -- antes contaba cualquier coincidencia histórica, vencida
    // o futura incluida).
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

    // `awards` es granular por (adjudicación, proveedor): un award con
    // varios integrantes de consorcio sancionados aparece una vez POR
    // PROVEEDOR, cada fila con el monto COMPLETO del award. Sumar
    // `totalContratosMonto`/`contratosEnOtraMoneda` fila por fila duplica
    // ese monto tantas veces como proveedores sancionados comparta el
    // mismo award -- hallazgo P1 de CodeRabbit en PR #225, confirmado. El
    // total agregado (a diferencia del total POR proveedor, que sí debe
    // mostrar el monto completo para cada uno) se calcula sobre contratos
    // ÚNICOS por `referenciaContrato`.
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

      // El total POR PROVEEDOR sí refleja el monto completo del award para
      // cada proveedor sancionado que participó -- es información real
      // sobre su exposición, aunque el award sea compartido.
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
          // Días desde que la SANCIÓN empezó a regir (campo que pide el PRD),
          // distinto de "hace cuánto el cruce detectó este contrato" --
          // ambos son útiles y reales, no se colapsan en uno solo.
          diasDesdeSancion: diasDesdeFecha(sancionDesde),
          diasDesdeDeteccion: diasDesdeFecha(primeraVezVisto),
        };
      });

    res.json({
      generadoEn: new Date().toISOString(),
      frescura: {
        proveedoresSancionados: {
          ultimaIngesta: freshnessRow.rows[0]?.ultima_ejecucion ?? null,
          diasSinActualizar: diasDesdeFecha(freshnessRow.rows[0]?.ultima_ejecucion),
          filasIngeridas: freshnessRow.rows[0]?.filas_ingeridas ?? null,
        },
        comprasPublicas: {
          ultimaIngesta: comprasFreshnessRow.rows[0]?.fetched_at ?? null,
          diasSinActualizar: diasDesdeFecha(comprasFreshnessRow.rows[0]?.fetched_at),
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
          "docs/BACKLOG_Scheduler_Ingesta_Diseno_v1.md. signals/redes (RCC-09) no están incluidos, ver docblock.",
      },
    });
  })
);
