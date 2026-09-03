import { Router } from "express";
import { z } from "zod";
import { pool } from "../db/pool.js";
import { comprasPool } from "../db/compras-pool.js";
import { ejecucionPool } from "../db/ejecucion-pool.js";
import { matchEntitiesToPadron } from "../crossref/match.js";
import { asyncHandler } from "../lib/async-handler.js";
import { parseQuery } from "../lib/validate-query.js";

export const crossrefRouter = Router();

const CrossrefQuerySchema = z.object({
  departamento: z.string().min(1).optional(),
  soloIrregulares: z.enum(["true", "false"]).optional(),
});

/**
 * `awards.supplier_id` en compras-publicas viene como `PE-RUC-<11 dígitos>`
 * para la mayoría de proveedores (77.3% de la muestra, confirmado en vivo el
 * 2026-08-20 — ver docs/data-contracts/sunat-padron-ruc.md). El resto son
 * consorcios con un id interno más corto que no es RUC estándar y no cruzan
 * por esta vía. `minor_contracts.winning_supplier_id` (contratos menores vía
 * SEACE — `legacy-seace-orders-connector.ts` y
 * `seace-public-minor-contracts-connector.ts`) usa el prefijo `seace:ruc:`
 * en su lugar; ambos formatos se aceptan (CX-01, ver docs/conectores.md).
 */
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
 * Cruce proveedor <-> padrón RUC, por RUC exacto extraído de `supplier_id`
 * (sin matching difuso — a diferencia del cruce por nombre de entidad que sí
 * lo necesita, ver "RUC del lado entidad" en el data contract). Cada
 * contratación se marca `irregular: true` si el proveedor no está ACTIVO/
 * HABIDO en el padrón, o si su RUC no se encontró ahí (aún no ingerido, o
 * el RUC-20 filtrado en la ingesta no lo cubre). Cubre tanto adjudicaciones
 * OCDS (`awards`) como contratos menores (`minor_contracts`, campo `origen`
 * distingue el origen de cada fila — CX-01).
 */
crossrefRouter.get("/", asyncHandler(async (req, res) => {
  const parsed = parseQuery(CrossrefQuerySchema, req.query, res);
  if (!parsed) return;
  const wantedDepartamento = parsed.departamento?.toUpperCase().trim() ?? "LA LIBERTAD";
  const soloIrregulares = parsed.soloIrregulares === "true";

  const [{ rows: awardRows }, { rows: minorContractRows }] = await Promise.all([
    comprasPool.query(
      `SELECT ocid, award_id, supplier_id, supplier_name, buyer_name, valor_monto, valor_moneda, fecha
       FROM awards
       WHERE departamento = $1`,
      [wantedDepartamento]
    ),
    comprasPool.query(
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
    // minor_contracts no registra moneda (no viene del estándar OCDS como
    // `awards`) — se deja `valorMoneda: null` en vez de asumir soles, para
    // no inventar un dato que la fuente no persiste.
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
  const contribuyenteByRuc = new Map<string, { razonSocial: string; estado: string | null; condicion: string | null; ubigeo: string | null }>();

  if (rucs.length > 0) {
    const { rows: contribRows } = await pool.query(
      `SELECT ruc, razon_social, estado_contribuyente, condicion_domicilio, ubigeo
       FROM contribuyentes WHERE ruc = ANY($1)`,
      [rucs]
    );
    for (const r of contribRows) {
      contribuyenteByRuc.set(r.ruc, {
        razonSocial: r.razon_social,
        estado: r.estado_contribuyente,
        condicion: r.condicion_domicilio,
        ubigeo: r.ubigeo,
      });
    }
  }

  const resultados = contractRows.map((row) => {
    const supplierId = row.supplierId;
    const ruc = supplierId ? rucBySupplierId.get(supplierId) ?? null : null;
    const contribuyente = ruc ? contribuyenteByRuc.get(ruc) ?? null : null;

    const esRucValido = ruc !== null;
    const encontradoEnPadron = contribuyente !== null;
    const estadoRegular = contribuyente ? ESTADOS_REGULARES.has((contribuyente.estado ?? "").toUpperCase()) : null;
    const condicionRegular = contribuyente
      ? CONDICIONES_REGULARES.has((contribuyente.condicion ?? "").toUpperCase())
      : null;

    // Irregular solo si SÍ tenemos el dato y dice que está mal — un RUC no
    // encontrado en el padrón (aún no ingerido) no se marca irregular, se
    // marca aparte (`encontradoEnPadron: false`) para no acusar sin evidencia.
    const irregular = encontradoEnPadron && (!estadoRegular || !condicionRegular);

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
      rucValido: esRucValido,
      encontradoEnPadron,
      estadoContribuyente: contribuyente?.estado ?? null,
      condicionDomicilio: contribuyente?.condicion ?? null,
      ubigeoProveedor: contribuyente?.ubigeo ?? null,
      irregular,
    };
  });

  res.json({
    departamento: wantedDepartamento,
    resultados: soloIrregulares ? resultados.filter((r) => r.irregular) : resultados,
  });
}));

const EntidadesQuerySchema = z.object({
  departamento: z.string().min(1).optional(),
});

/**
 * Cruce entidad <-> padrón RUC, por nombre (no hay ID compartido — a
 * diferencia del cruce de proveedores, que sí tiene RUC embebido en
 * `supplier_id`). Reutiliza el mismo matcher difuso de `compras-publicas`
 * (`matchEntitiesToPadron`, patrón `confirmada`/`candidata`) — probado en
 * vivo contra el caso real de Sánchez Carrión (ver docs/data-contracts/
 * sunat-padron-ruc.md): matcheó "candidata" con score 0.8 sin necesitar
 * ninguna extensión del matcher, solo reutilizarlo con las dos fuentes
 * correctas.
 */
crossrefRouter.get("/entidades", asyncHandler(async (req, res) => {
  const parsed = parseQuery(EntidadesQuerySchema, req.query, res);
  if (!parsed) return;
  const wantedDepartamento = parsed.departamento?.toUpperCase().trim() ?? "LA LIBERTAD";

  const { rows: entityRows } = await ejecucionPool.query(
    `SELECT e.entity_code, e.nombre
     FROM entities e
     JOIN territories t ON t.ubigeo = e.ubigeo
     WHERE t.departamento = $1`,
    [wantedDepartamento]
  );

  // Acotar el padrón al prefijo de ubigeo del departamento (los 2 primeros
  // dígitos del código INEI) antes de correr el matcher — sin esto, cada
  // request compara N entidades contra los ~2.3M contribuyentes completos
  // (89s reales medidos en vivo el 2026-08-20, colgó incluso el build de
  // Next.js al intentar pre-renderizar la página). Con el acote a La
  // Libertad (~107k contribuyentes, 21x menos), baja a segundos. Toda
  // entidad pública real está registrada con domicilio fiscal en su propia
  // región, así que este acote no descarta candidatos legítimos.
  const { rows: prefixRows } = await ejecucionPool.query<{ ubigeo: string }>(
    `SELECT ubigeo FROM territories WHERE departamento = $1 LIMIT 1`,
    [wantedDepartamento]
  );
  const ubigeoPrefix = prefixRows[0]?.ubigeo.slice(0, 2);

  const { rows: padronRows } = await pool.query(
    ubigeoPrefix
      ? `SELECT ruc, razon_social, estado_contribuyente, condicion_domicilio FROM contribuyentes WHERE ubigeo LIKE $1`
      : `SELECT ruc, razon_social, estado_contribuyente, condicion_domicilio FROM contribuyentes`,
    ubigeoPrefix ? [`${ubigeoPrefix}%`] : []
  );

  const matches = matchEntitiesToPadron(
    entityRows.map((r) => ({ entityCode: r.entity_code, nombre: r.nombre })),
    padronRows.map((r) => ({ ruc: r.ruc, razonSocial: r.razon_social }))
  );

  const contribuyenteByRuc = new Map(padronRows.map((r) => [r.ruc, r]));

  res.json({
    departamento: wantedDepartamento,
    totalEntidades: entityRows.length,
    totalMatches: matches.length,
    resultados: matches.map((m) => {
      const contribuyente = contribuyenteByRuc.get(m.ruc);
      return {
        entityCode: m.mefEntityCode,
        nombreEnRadarEjecucion: m.mefNombre,
        ruc: m.ruc,
        razonSocialEnPadron: m.razonSocial,
        confidence: m.confidence,
        score: m.score,
        estadoContribuyente: contribuyente?.estado_contribuyente ?? null,
        condicionDomicilio: contribuyente?.condicion_domicilio ?? null,
      };
    }),
  });
}));
