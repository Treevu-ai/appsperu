import type { NeonRow } from "../../db/neon-pool.js";
import type { ToolHandlerContext, HandlerResult } from "../registry.js";
import { extractRuc, crossAppPool, crossAppUnavailable } from "./_helpers.js";

interface DenunciaRow extends NeonRow {
  provincia: string;
  distrito: string;
  ubigeo: string | null;
  total_extorsion: string;
}

interface ProveedorSancionadoRow extends NeonRow {
  supplier_id: string | null;
  supplier_name: string | null;
  ruc: string | null;
  valor_monto: string | number | null;
  fecha: string | Date | null;
  buyer_name: string | null;
  provincia: string | null;
  distrito: string | null;
}

interface InhabEstadoRow extends NeonRow {
  ruc: string;
  estado: string;
}

type ContratoRow = ProveedorSancionadoRow & { origen: "awards" | "minor_contracts" };

type ProveedorSancionado = {
  origen: "awards" | "minor_contracts";
  supplierName: string | null;
  ruc: string;
  valorMonto: number | null;
  fecha: string | Date | null;
  comprador: string | null;
  provincia: string | null;
  distrito: string | null;
};

/**
 * Handler para `proveedores_sancionados_extorsion_sancionados` —
 * GET /api/crossref/extorsion-sancionados.
 *
 * Para cada distrito con denuncias de Extorsión, lista los proveedores
 * sancionados (persona jurídica, con su RUC) con contratos en ese mismo distrito
 * y año. Es una COINCIDENCIA TERRITORIAL, no prueba de relación: la sanción y
 * la denuncia pueden no estar vinculadas. Úsalo para priorizar verificación, no
 * para concluir.
 */
export async function list(ctx: ToolHandlerContext): Promise<HandlerResult> {
  const { db, args, env } = ctx;
  const seguridadDb = crossAppPool("seguridad-ciudadana", env);
  if (!seguridadDb) return crossAppUnavailable("seguridad-ciudadana");
  const comprasDb = crossAppPool("compras-publicas", env);
  if (!comprasDb) return crossAppUnavailable("compras-publicas");

  const departamento = (args.departamento as string).toUpperCase();
  const anio = Number(args.anio);

  const { rows: denunciaRows } = await seguridadDb.query<DenunciaRow>(
    `SELECT provincia, distrito, ubigeo, SUM(cantidad)::text AS total_extorsion
       FROM police_reports
      WHERE departamento = $1 AND anio = $2 AND modalidad = 'Extorsión'
      GROUP BY provincia, distrito, ubigeo
      ORDER BY provincia, distrito`,
    [departamento, anio]
  );

  if (denunciaRows.length === 0) {
    return {
      status: 200,
      body: {
        departamento,
        anio,
        distritos: [],
      },
    };
  }

  const rucBySupplierId = new Map<string, string>();

  const contractRows: ContratoRow[] = [];

  const { rows: minorRows } = await comprasDb.query<ProveedorSancionadoRow>(
    `SELECT c.winning_supplier_id AS supplier_id,
            s.legal_name AS supplier_name,
            s.ruc,
            c.awarded_amount::text AS valor_monto,
            c.award_date AS fecha,
            m.official_name AS buyer_name,
            c.execution_province AS provincia,
            c.execution_district AS distrito
       FROM minor_contracts c
       LEFT JOIN supplier_profiles s ON s.supplier_id = c.winning_supplier_id
       LEFT JOIN municipalities m ON m.municipality_id = c.municipality_id
      WHERE c.execution_department = $1 AND c.year = $2
        AND c.winning_supplier_id IS NOT NULL`,
    [departamento, anio]
  );
  for (const row of minorRows) {
    if (row.supplier_id) {
      const ruc = row.ruc ?? extractRuc(row.supplier_id);
      if (ruc) rucBySupplierId.set(row.supplier_id, ruc);
    }
    contractRows.push({ ...row, origen: "minor_contracts" });
  }

  const { rows: awardRows } = await comprasDb.query<ProveedorSancionadoRow>(
    `SELECT a.supplier_id, a.supplier_name, a.valor_monto::text,
            a.fecha, a.buyer_name, NULL::text AS provincia, NULL::text AS distrito
       FROM awards a
      WHERE a.departamento = $1 AND EXTRACT(YEAR FROM a.fecha) = $2`,
    [departamento, anio]
  );
  for (const row of awardRows) {
    if (row.supplier_id) {
      const ruc = extractRuc(row.supplier_id);
      if (ruc) rucBySupplierId.set(row.supplier_id, ruc);
    }
    contractRows.push({ ...row, origen: "awards" });
  }

  const rucs = [...new Set(rucBySupplierId.values())];

  const sancionadoRucs = new Set<string>();
  if (rucs.length > 0) {
    const { rows: inhabRows } = await db.query<InhabEstadoRow>(
      `SELECT DISTINCT ruc, estado FROM inhabilitaciones WHERE ruc = ANY($1)`,
      [rucs]
    );
    for (const r of inhabRows) {
      if ((r.estado ?? "").toUpperCase() === "VIGENTE") sancionadoRucs.add(r.ruc);
    }
  }

  const proveedoresSancionados = contractRows
    .map((row) => {
      const ruc = row.supplier_id ? rucBySupplierId.get(row.supplier_id) ?? null : null;
      if (!ruc) return null;
      const tieneInhabilitacionVigente = sancionadoRucs.has(ruc);
      if (!tieneInhabilitacionVigente) return null;
      return {
        origen: row.origen,
        supplierName: row.supplier_name,
        ruc,
        valorMonto: row.valor_monto ? Number(row.valor_monto) : null,
        fecha: row.fecha,
        comprador: row.buyer_name,
        provincia: row.provincia,
        distrito: row.distrito,
      };
    })
    .filter((item): item is NonNullable<typeof item> => item !== null);

  const proveedoresSancionadosConDistrito: ProveedorSancionado[] = [];
  const proveedoresSinDistrito: ProveedorSancionado[] = [];

  for (const p of proveedoresSancionados) {
    if (p.distrito && p.provincia) {
      proveedoresSancionadosConDistrito.push(p);
    } else {
      const compradorUpper = (p.comprador ?? "").toUpperCase();
      let matchedProvincia: string | null = null;
      let matchedDistrito: string | null = null;
      for (const d of denunciaRows) {
        const distUpper = d.distrito.toUpperCase();
        if (distUpper.length > 3 && compradorUpper.includes(distUpper)) {
          matchedDistrito = d.distrito;
          matchedProvincia = d.provincia;
          break;
        }
      }
      if (matchedDistrito && matchedProvincia) {
        proveedoresSancionadosConDistrito.push({ ...p, provincia: matchedProvincia, distrito: matchedDistrito });
      } else {
        proveedoresSinDistrito.push(p);
      }
    }
  }

  const proveedoresPorDistrito = new Map<string, ProveedorSancionado[]>();
  for (const p of proveedoresSancionadosConDistrito) {
    const key = `${p.provincia ?? ""}|${p.distrito ?? ""}`;
    if (!proveedoresPorDistrito.has(key)) proveedoresPorDistrito.set(key, []);
    proveedoresPorDistrito.get(key)!.push(p);
  }

  const distritos = denunciaRows.map((d) => {
    const key = `${d.provincia}|${d.distrito}`;
    const proveedores = proveedoresPorDistrito.get(key) ?? [];
    return {
      provincia: d.provincia,
      distrito: d.distrito,
      ubigeo: d.ubigeo,
      denunciasExtorsion: Number(d.total_extorsion),
      proveedoresSancionadosConContratos: proveedores,
      totalProveedoresSancionados: proveedores.length,
    };
  });

  return {
    status: 200,
    body: {
      departamento,
      anio,
      proveedoresSancionadosSinDistrito: proveedoresSinDistrito,
      totalProveedoresSancionadosSinDistrito: proveedoresSinDistrito.length,
      distritos,
    },
  };
}
