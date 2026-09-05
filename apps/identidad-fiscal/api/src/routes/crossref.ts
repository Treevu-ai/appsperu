import { Router } from "express";
import { z } from "zod";
import { extractRuc, vigenteEnFecha } from "@appsperu/shared-identity";
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

const ESTADOS_REGULARES = new Set(["ACTIVO"]);
const CONDICIONES_REGULARES = new Set(["HABIDO"]);

/**
 * Cruce proveedor <-> padrón RUC, por RUC exacto extraído de `supplier_id`
 * (sin matching difuso — a diferencia del cruce por nombre de entidad que sí
 * lo necesita, ver "RUC del lado entidad" en el data contract). Cada
 * adjudicación se marca `irregular: true` si el proveedor no está ACTIVO/
 * HABIDO en el padrón, o si su RUC no se encontró ahí (aún no ingerido, o
 * el RUC-20 filtrado en la ingesta no lo cubre).
 */
crossrefRouter.get("/", asyncHandler(async (req, res) => {
  const parsed = parseQuery(CrossrefQuerySchema, req.query, res);
  if (!parsed) return;
  const wantedDepartamento = parsed.departamento?.toUpperCase().trim() ?? "LA LIBERTAD";
  const soloIrregulares = parsed.soloIrregulares === "true";

  const { rows: awardRows } = await comprasPool.query(
    `SELECT ocid, award_id, supplier_id, supplier_name, buyer_name, valor_monto, valor_moneda, fecha
     FROM awards
     WHERE departamento = $1`,
    [wantedDepartamento]
  );

  const rucBySupplierId = new Map<string, string>();
  for (const row of awardRows) {
    const ruc = extractRuc(row.supplier_id as string);
    if (ruc) rucBySupplierId.set(row.supplier_id as string, ruc);
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

  const resultados = awardRows.map((row) => {
    const supplierId = row.supplier_id as string;
    const ruc = rucBySupplierId.get(supplierId) ?? null;
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

    // `irregular` de arriba usa el estado ACTUAL del padrón (último batch
    // ingerido), no el estado en la fecha de la adjudicación — `contribuyentes`
    // sobrescribe el estado en cada reingesta (ON CONFLICT DO UPDATE) y no
    // guarda desde cuándo empezó, a diferencia de `inhabilitaciones` en
    // proveedores-sancionados (que sí tiene `desde`/`hasta`). Por eso
    // `vigenteEnFecha` siempre recibe `desde: null` acá y el resultado es
    // "NO_VERIFICABLE" hoy — no se inventa una fecha que SUNAT no publica.
    // Mismo patrón de rigor temporal que proveedores-sancionados/crossref.ts,
    // aplicado con el dato que esta fuente sí tiene (CX-09).
    const estadoTributarioEnFechaAdjudicacion = contribuyente
      ? vigenteEnFecha(row.fecha, null, null)
      : "NO_VERIFICABLE";

    return {
      ocid: row.ocid,
      awardId: row.award_id,
      supplierId,
      supplierName: row.supplier_name,
      buyerName: row.buyer_name,
      valorMonto: row.valor_monto === null ? null : Number(row.valor_monto),
      valorMoneda: row.valor_moneda,
      fecha: row.fecha,
      rucValido: esRucValido,
      encontradoEnPadron,
      estadoContribuyente: contribuyente?.estado ?? null,
      condicionDomicilio: contribuyente?.condicion ?? null,
      ubigeoProveedor: contribuyente?.ubigeo ?? null,
      irregular,
      estadoTributarioEnFechaAdjudicacion,
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
