import { Router } from "express";
import { z } from "zod";
import { extractRuc } from "@appsperu/shared-identity";
import { pool } from "../db/pool.js";
import { comprasPool } from "../db/compras-pool.js";
import { asyncHandler } from "../lib/async-handler.js";
import { parseQuery } from "../lib/validate-query.js";

export const redesProveedoresRouter = Router();

const RedesProveedoresQuerySchema = z.object({
  departamento: z.string().min(1).optional(),
  minMunicipios: z.coerce.number().int().min(1).default(2),
  soloSancionados: z.enum(["true", "false"]).optional(),
});

/**
 * Proveedores de contratos menores (`minor_contracts`, compras-publicas)
 * que ganan en varias municipalidades distintas — señal de red o
 * concentración territorial, no una conclusión de irregularidad. Solo
 * `minor_contracts`, no `awards` (OCDS mayor cuantía): `awards` no tiene
 * un municipio real (el comprador puede ser una entidad nacional), así que
 * mezclarlo contaminaría el concepto de "distrito" de este vertical.
 *
 * A pesar de su nombre, `municipalities` NO es solo gobiernos municipales:
 * verificado en vivo contra datos reales (2026-09-05), de 90 filas solo 23
 * son "MUNICIPALIDAD ..." — el resto son ministerios, gobiernos regionales,
 * empresas municipales de agua/luz, UGEL, etc. que también compraron un
 * contrato menor con ejecución en algún departamento del universo
 * materializado (no solo La Libertad). Sin el filtro `official_name ILIKE
 * 'MUNICIPALIDAD%'`, "municipiosCount" mezclaría gobiernos locales con
 * ministerios nacionales — rompiendo la promesa del vertical ("¿en cuántas
 * municipalidades gana este proveedor?").
 *
 * Reusa el mismo patrón de cruce que `crossref.ts` (comprasPool +
 * extractRuc + inhabilitaciones), pero agregado por proveedor en vez de
 * por contrato — aquí solo importa si el proveedor tiene una inhabilitación
 * VIGENTE hoy, no la reconstrucción temporal por fecha de cada contrato
 * (eso tiene sentido para juzgar un contrato puntual, no para resumir la
 * huella territorial de un proveedor).
 */
redesProveedoresRouter.get("/", asyncHandler(async (req, res) => {
  const parsed = parseQuery(RedesProveedoresQuerySchema, req.query, res);
  if (!parsed) return;
  const departamento = (parsed.departamento ?? "LA LIBERTAD").toUpperCase().trim();
  const { minMunicipios } = parsed;
  const soloSancionados = parsed.soloSancionados === "true";

  const { rows: supplierRows } = await comprasPool.query(
    `SELECT c.winning_supplier_id AS supplier_id, s.legal_name, s.ruc,
            COUNT(DISTINCT c.municipality_id)::integer AS municipios_count,
            COUNT(*)::integer AS contratos,
            SUM(c.awarded_amount) AS monto_total,
            jsonb_agg(DISTINCT jsonb_build_object(
              'municipalityId', m.municipality_id,
              'officialName', m.official_name,
              'district', m.district
            )) AS municipios
     FROM minor_contracts c
     JOIN municipalities m ON m.municipality_id = c.municipality_id
     LEFT JOIN supplier_profiles s ON s.supplier_id = c.winning_supplier_id
     WHERE c.winning_supplier_id IS NOT NULL
       AND m.official_name ILIKE 'MUNICIPALIDAD%'
       AND (m.department = $1 OR c.execution_department = $1)
     GROUP BY c.winning_supplier_id, s.legal_name, s.ruc
     HAVING COUNT(DISTINCT c.municipality_id) >= $2
     ORDER BY municipios_count DESC, monto_total DESC
     LIMIT 500`,
    [departamento, minMunicipios]
  );

  // Prefiere el RUC canónico de supplier_profiles (s.ruc); solo cae al
  // parseo de supplier_id cuando el LEFT JOIN no encontró perfil (más
  // robusto que depender siempre del heurístico de string).
  const rucBySupplierId = new Map<string, string>();
  for (const row of supplierRows) {
    if (!row.supplier_id) continue;
    const ruc = row.ruc ?? extractRuc(row.supplier_id);
    if (ruc) rucBySupplierId.set(row.supplier_id, ruc);
  }
  const rucs = [...new Set(rucBySupplierId.values())];

  const sancionadoRucs = new Set<string>();
  if (rucs.length > 0) {
    const { rows: inhabRows } = await pool.query(
      `SELECT DISTINCT ruc FROM inhabilitaciones WHERE ruc = ANY($1) AND estado = 'VIGENTE'`,
      [rucs]
    );
    for (const r of inhabRows) sancionadoRucs.add(r.ruc);
  }

  const resultados = supplierRows.map((row) => {
    const ruc = row.supplier_id ? rucBySupplierId.get(row.supplier_id) ?? null : null;
    return {
      supplierId: row.supplier_id,
      legalName: row.legal_name,
      ruc,
      municipiosCount: Number(row.municipios_count),
      municipios: row.municipios,
      contratos: Number(row.contratos),
      montoTotal: row.monto_total === null ? null : Number(row.monto_total),
      tieneInhabilitacionVigente: ruc !== null && sancionadoRucs.has(ruc),
    };
  });

  res.json({
    departamento,
    minMunicipios,
    resultados: soloSancionados ? resultados.filter((r) => r.tieneInhabilitacionVigente) : resultados,
    limitation: "Un proveedor activo en varios municipios no implica irregularidad; es una señal para revisión, no una conclusión.",
  });
}));
