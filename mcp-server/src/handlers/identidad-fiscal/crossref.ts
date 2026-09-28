// @fidelity: precomputado
//
// Origen: apps/identidad-fiscal/api/src/routes/crossref.ts.
//
// `list` (GET /api/crossref) se porto literal: el cruce proveedor <-> padron es
// por RUC exacto extraido de `supplier_id`, sin matching difuso.
//
// `entidades` (GET /api/crossref/entidades) NO es un port literal. El origen
// corria `matchEntitiesToPadron` en cada request contra el padron acotado por
// prefijo UBIGEO (~107k contribuyentes en La Libertad) y reportaba que aun asi
// tardaba segundos. En Workers ese trabajo por request compite con los limites
// de CPU y memoria del isolate, asi que el cruce se precomputa en
// `entity_padron_crosswalk` (migracion 009) y se recalcula con
// `apps/identidad-fiscal/api/src/crossref/build-crosswalk.ts`; este handler solo
// lee. Es el mismo patron que compras-publicas usa con `entity_crosswalk`.
import type { NeonRow } from "../../db/neon-pool.js";
import type { ToolHandlerContext, HandlerResult } from "../registry.js";
import { extractRuc, vigenteEnFecha, crossAppPool, crossAppUnavailable } from "../proveedores-sancionados/_helpers.js";

const ESTADOS_REGULARES = new Set(["ACTIVO"]);
const CONDICIONES_REGULARES = new Set(["HABIDO"]);

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

interface ContribuyenteRow extends NeonRow {
  ruc: string;
  razon_social: string;
  estado_contribuyente: string | null;
  condicion_domicilio: string | null;
  ubigeo: string | null;
}

interface EntityCodeRow extends NeonRow {
  entity_code: string;
}

interface CrosswalkRow extends NeonRow {
  mef_entity_code: string;
  mef_nombre: string;
  ruc: string;
  razon_social: string;
  confidence: string;
  score: string | number;
  estado_contribuyente: string | null;
  condicion_domicilio: string | null;
}

interface ContractRow {
  origen: "awards" | "minor_contracts";
  ocid: string | null;
  awardId: string | null;
  supplierId: string | null;
  supplierName: string | null;
  buyerName: string | null;
  valorMonto: number | null;
  valorMoneda: string | null;
  fecha: string | Date | null;
}

/**
 * Handler para `identidad_fiscal_crossref_proveedores` — GET /api/crossref.
 *
 * Cruce proveedor <-> padron RUC, por RUC exacto extraido de `supplier_id`
 * (sin matching difuso — a diferencia del cruce por nombre de entidad que si
 * lo necesita, ver `entidades`). Cada contratacion se marca `irregular: true` si
 * el proveedor no esta ACTIVO/HABIDO en el padron, o si su RUC no se encontro
 * ahi (aun no ingerido, o el RUC-20 filtrado en la ingesta no lo cubre). Cubre
 * tanto adjudicaciones OCDS (`awards`) como contratos menores
 * (`minor_contracts`, campo `origen` distingue el origen de cada fila — CX-01).
 */
export async function list(ctx: ToolHandlerContext): Promise<HandlerResult> {
  const { db, args, env } = ctx;
  const comprasDb = crossAppPool("compras-publicas", env);
  if (!comprasDb) return crossAppUnavailable("compras-publicas");

  const wantedDepartamento = ((args.departamento as string | undefined) ?? "LA LIBERTAD").toUpperCase().trim();
  const soloIrregulares = args.soloIrregulares === "true";

  // Secuencial, no `Promise.all`: Workers tiene un limite de 6 conexiones
  // simultaneas por isolate y esta ruta ya cruza compras-publicas con la propia
  // base de identidad-fiscal.
  const { rows: awardRows } = await comprasDb.query<AwardRow>(
    `SELECT ocid, award_id, supplier_id, supplier_name, buyer_name, valor_monto, valor_moneda, fecha
       FROM awards
       WHERE departamento = $1`,
    [wantedDepartamento]
  );
  const { rows: minorContractRows } = await comprasDb.query<MinorContractRow>(
    `SELECT c.contracting_id, c.ocid, c.award_id, c.winning_supplier_id AS supplier_id,
            s.legal_name AS supplier_name, m.official_name AS buyer_name,
            c.awarded_amount AS valor_monto, c.award_date AS fecha
       FROM minor_contracts c
       LEFT JOIN supplier_profiles s ON s.supplier_id = c.winning_supplier_id
       LEFT JOIN municipalities m ON m.municipality_id = c.municipality_id
       WHERE c.winning_supplier_id IS NOT NULL AND (m.department = $1 OR c.execution_department = $1)`,
    [wantedDepartamento]
  );

  const contractRows: ContractRow[] = [
    ...awardRows.map(
      (row): ContractRow => ({
        origen: "awards",
        ocid: row.ocid,
        awardId: row.award_id,
        supplierId: row.supplier_id,
        supplierName: row.supplier_name,
        buyerName: row.buyer_name,
        valorMonto: row.valor_monto === null ? null : Number(row.valor_monto),
        valorMoneda: row.valor_moneda,
        fecha: row.fecha,
      })
    ),
    // minor_contracts no registra moneda (no viene del estandar OCDS como
    // `awards`) — se deja `valorMoneda: null` en vez de asumir soles, para no
    // inventar un dato que la fuente no persiste.
    ...minorContractRows.map(
      (row): ContractRow => ({
        origen: "minor_contracts",
        ocid: row.ocid,
        awardId: row.award_id,
        supplierId: row.supplier_id,
        supplierName: row.supplier_name,
        buyerName: row.buyer_name,
        valorMonto: row.valor_monto === null ? null : Number(row.valor_monto),
        valorMoneda: null,
        fecha: row.fecha,
      })
    ),
  ];

  const rucBySupplierId = new Map<string, string>();
  for (const row of contractRows) {
    if (!row.supplierId) continue;
    const ruc = extractRuc(row.supplierId);
    if (ruc) rucBySupplierId.set(row.supplierId, ruc);
  }

  const rucs = [...new Set(rucBySupplierId.values())];
  const contribuyenteByRuc = new Map<string, ContribuyenteRow>();

  if (rucs.length > 0) {
    const { rows: contribRows } = await db.query<ContribuyenteRow>(
      `SELECT ruc, razon_social, estado_contribuyente, condicion_domicilio, ubigeo
         FROM contribuyentes WHERE ruc = ANY($1)`,
      [rucs]
    );
    for (const r of contribRows) contribuyenteByRuc.set(r.ruc, r);
  }

  const resultados = contractRows.map((row) => {
    const supplierId = row.supplierId;
    const ruc = supplierId ? (rucBySupplierId.get(supplierId) ?? null) : null;
    const contribuyente = ruc ? (contribuyenteByRuc.get(ruc) ?? null) : null;

    const esRucValido = ruc !== null;
    const encontradoEnPadron = contribuyente !== null;
    const estadoRegular = contribuyente ? ESTADOS_REGULARES.has((contribuyente.estado_contribuyente ?? "").toUpperCase()) : null;
    const condicionRegular = contribuyente
      ? CONDICIONES_REGULARES.has((contribuyente.condicion_domicilio ?? "").toUpperCase())
      : null;

    // Irregular solo si SI tenemos el dato y dice que esta mal — un RUC no
    // encontrado en el padron (aun no ingerido) no se marca irregular, se
    // marca aparte (`encontradoEnPadron: false`) para no acusar sin evidencia.
    const irregular = encontradoEnPadron && (!estadoRegular || !condicionRegular);

    // `irregular` de arriba usa el estado ACTUAL del padron (ultimo batch
    // ingerido), no el estado en la fecha de la adjudicacion — `contribuyentes`
    // sobrescribe el estado en cada reingesta (ON CONFLICT DO UPDATE) y no
    // guarda desde cuando empezo, a diferencia de `inhabilitaciones` en
    // proveedores-sancionados (que si tiene `desde`/`hasta`). Por eso
    // `vigenteEnFecha` siempre recibe `desde: null` y el resultado es
    // "NO_VERIFICABLE" hoy — no se inventa una fecha que SUNAT no publica.
    // Mismo patron de rigor temporal que proveedores-sancionados/crossref.ts
    // (CX-09).
    const estadoTributarioEnFechaAdjudicacion = contribuyente ? vigenteEnFecha(row.fecha, null, null) : "NO_VERIFICABLE";

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
      estadoContribuyente: contribuyente?.estado_contribuyente ?? null,
      condicionDomicilio: contribuyente?.condicion_domicilio ?? null,
      ubigeoProveedor: contribuyente?.ubigeo ?? null,
      irregular,
      estadoTributarioEnFechaAdjudicacion,
    };
  });

  return {
    status: 200,
    body: {
      departamento: wantedDepartamento,
      resultados: soloIrregulares ? resultados.filter((r) => r.irregular) : resultados,
    },
  };
}

/**
 * Handler para `identidad_fiscal_crossref_entidades` — GET /api/crossref/entidades.
 *
 * Cruce entidad <-> padron RUC, por nombre (no hay ID compartido — a diferencia
 * del cruce de proveedores, que si tiene RUC embebido en `supplier_id`). En el
 * origen el matcher corria en cada request; aqui lee el cruce ya calculado.
 *
 * El estado tributario se sigue leyendo en vivo de `contribuyentes` (no desde
 * la tabla precomputada): esa tabla se sobrescribe en cada reingesta, y
 * servirla desde el crosswalk daria un estado desactualizado.
 */
export async function entidades(ctx: ToolHandlerContext): Promise<HandlerResult> {
  const { db, args, env } = ctx;
  const ejecucionDb = crossAppPool("radar-ejecucion", env);
  if (!ejecucionDb) return crossAppUnavailable("radar-ejecucion");

  const wantedDepartamento = ((args.departamento as string | undefined) ?? "LA LIBERTAD").toUpperCase().trim();

  const { rows: entityRows } = await ejecucionDb.query<EntityCodeRow>(
    `SELECT e.entity_code, e.nombre
     FROM entities e
     JOIN territories t ON t.ubigeo = e.ubigeo
     WHERE t.departamento = $1`,
    [wantedDepartamento]
  );
  const entityCodes = entityRows.map((r) => r.entity_code);

  // `entity_padron_crosswalk` no tiene columna `departamento` (igual que
  // `entity_crosswalk` en compras-publicas), asi que el scoping del departamento
  // va por los codigos de entidad, que es el mismo criterio que usa el DELETE
  // del backfill.
  let crosswalkRows: CrosswalkRow[] = [];
  if (entityCodes.length > 0) {
    // @nuevo: lectura del cruce ya calculado (tabla de la migración 009). No
    // tiene equivalente en el route de origen porque allí el cruce se armaba en
    // memoria con el matcher, en cada request.
    const { rows } = await db.query<CrosswalkRow>(
      `SELECT w.mef_entity_code, w.mef_nombre, w.ruc, w.razon_social, w.confidence, w.score,
              c.estado_contribuyente, c.condicion_domicilio
         FROM entity_padron_crosswalk w
         LEFT JOIN contribuyentes c ON c.ruc = w.ruc
        WHERE w.mef_entity_code = ANY($1)
        ORDER BY w.score DESC, w.mef_entity_code`,
      [entityCodes]
    );
    crosswalkRows = rows;
  }

  return {
    status: 200,
    body: {
      departamento: wantedDepartamento,
      totalEntidades: entityRows.length,
      totalMatches: crosswalkRows.length,
      resultados: crosswalkRows.map((m) => ({
        entityCode: m.mef_entity_code,
        nombreEnRadarEjecucion: m.mef_nombre,
        ruc: m.ruc,
        razonSocialEnPadron: m.razon_social,
        confidence: m.confidence,
        score: m.score,
        estadoContribuyente: m.estado_contribuyente ?? null,
        condicionDomicilio: m.condicion_domicilio ?? null,
      })),
    },
  };
}
