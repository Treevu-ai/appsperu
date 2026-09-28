import type { NeonRow } from "../../db/neon-pool.js";
import type { ToolHandlerContext, HandlerResult } from "../registry.js";
import { extractRuc, crossAppPool, crossAppUnavailable } from "./_helpers.js";

interface SupplierRow extends NeonRow {
  supplier_id: string | null;
  legal_name: string | null;
  ruc: string | null;
  municipios_count: number | string;
  contratos: number | string;
  monto_total: string | number | null;
  municipios: unknown;
}

interface SancionadoRow extends NeonRow {
  ruc: string;
}

/**
 * Handler para `proveedores_sancionados_redes_proveedores` —
 * GET /api/crossref/redes-proveedores.
 *
 * Proveedores de contratos menores (`minor_contracts`) que ganan en varias
 * municipalidades distintas — señal de red o concentración territorial, no una
 * conclusión de irregularidad. Solo cuenta municipalidades reales
 * (`official_name ILIKE 'MUNICIPALIDAD%'`): el resto del universo de compradores
 * incluye ministerios, gobiernos regionales y UGEL, que no son municipios.
 *
 * Aquí solo importa si el proveedor tiene una inhabilitación VIGENTE hoy, no la
 * reconstrucción temporal fecha por fecha de cada contrato.
 */
export async function list(ctx: ToolHandlerContext): Promise<HandlerResult> {
  const { db, args, env } = ctx;
  const comprasDb = crossAppPool("compras-publicas", env);
  if (!comprasDb) return crossAppUnavailable("compras-publicas");

  const departamento = (args.departamento ? (args.departamento as string) : "LA LIBERTAD").toUpperCase().trim();
  const minMunicipios = args.minMunicipios !== undefined ? Number(args.minMunicipios) : 2;
  const soloSancionados = args.soloSancionados === "true";

  const { rows: supplierRows } = await comprasDb.query<SupplierRow>(
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

  // Prefiere el RUC canónico de supplier_profiles (s.ruc); solo cae al parseo de
  // supplier_id cuando el LEFT JOIN no encontró perfil.
  const rucBySupplierId = new Map<string, string>();
  for (const row of supplierRows) {
    if (!row.supplier_id) continue;
    const ruc = row.ruc ?? extractRuc(row.supplier_id);
    if (ruc) rucBySupplierId.set(row.supplier_id, ruc);
  }
  const rucs = [...new Set(rucBySupplierId.values())];

  const sancionadoRucs = new Set<string>();
  if (rucs.length > 0) {
    const { rows: inhabRows } = await db.query<SancionadoRow>(
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

  return {
    status: 200,
    body: {
      departamento,
      minMunicipios,
      resultados: soloSancionados ? resultados.filter((r) => r.tieneInhabilitacionVigente) : resultados,
      limitation: "Un proveedor activo en varios municipios no implica irregularidad; es una señal para revisión, no una conclusión.",
    },
  };
}
