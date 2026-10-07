import type { NeonRow } from "../../db/neon-pool.js";
import type { ToolHandlerContext, HandlerResult } from "../registry.js";
import { computeConcentration } from "./_helpers.js";

interface ProveedorRow extends NeonRow {
  departamento: string;
  supplier_id: string;
  supplier_name: string;
  monto_total: number | string;
  adjudicaciones: number | string;
  entidades_compradoras: number | string;
}

/**
 * Handler para `compras_publicas_indice_concentracion` — GET /api/indices/concentracion.
 * Origen: apps/compras-publicas/api/src/routes/concentracion.ts.
 */
export async function list(ctx: ToolHandlerContext): Promise<HandlerResult> {
  const { db, args } = ctx;
  const departamento = args.departamento as string | undefined;
  const categoria = args.categoria as string | undefined;
  const soloRedes = args.soloRedes === "true" || args.soloRedes === true;
  const proveedor = args.proveedor as string | undefined;
  const anio = args.anio ? Number(args.anio) : undefined;
  const conProveedores = args.conProveedores === "true" || args.conProveedores === true;

  // `departamento` y `proveedor` NO se filtran en SQL — ambos requieren ver
  // el universo completo de proveedores por departamento para calcularse
  // correctamente (ver más abajo). `categoria`/`anio` sí restringen el
  // universo de datos en sí, no la comparabilidad entre proveedores.
  const condiciones: string[] = [];
  const params: unknown[] = [];
  if (categoria) { params.push(categoria); condiciones.push(`LOWER(pp.categoria) = $${params.length}`); }
  if (anio !== undefined) { params.push(anio); condiciones.push(`EXTRACT(YEAR FROM a.fecha) = $${params.length}`); }
  const where = condiciones.length > 0 ? `WHERE ${condiciones.join(" AND ")}` : "";

  const { rows: proveedores } = await db.query<ProveedorRow>(
    `SELECT
       a.departamento,
       a.supplier_id,
       a.supplier_name,
       SUM(a.valor_monto) AS monto_total,
       COUNT(*) AS adjudicaciones,
       COUNT(DISTINCT a.buyer_id) AS entidades_compradoras
     FROM awards a
     LEFT JOIN procurement_processes pp ON pp.ocid = a.ocid
     ${where}
     GROUP BY a.departamento, a.supplier_id, a.supplier_name
     HAVING SUM(a.valor_monto) > 0
     ORDER BY a.departamento, SUM(a.valor_monto) DESC`,
    params
  );

  // Redes: se calcula sobre el universo SIN filtro de `departamento` — si se
  // filtrara antes, cada proveedor solo tendría 1 departamento visible y
  // `soloRedes=true&departamento=X` nunca encontraría redes.
  const deptosPorProveedor = new Map<string, Set<string>>();
  for (const p of proveedores) {
    if (!deptosPorProveedor.has(p.supplier_id)) deptosPorProveedor.set(p.supplier_id, new Set());
    deptosPorProveedor.get(p.supplier_id)!.add(p.departamento);
  }

  // Lista de departamentos a mostrar: acotada por `departamento` y/o por
  // dónde opera `proveedor` — pero la concentración de cada departamento
  // mostrado siempre se calcula con TODOS sus proveedores (competidores
  // incluidos). Filtrar las filas de awards por `proveedor` antes de calcular
  // las cuotas eliminaba a todos sus competidores y el HHI salía siempre
  // 10,000.
  let deptos = [...new Set(proveedores.map((p) => p.departamento))].sort();
  if (departamento) {
    const deptoFiltro = departamento.toUpperCase();
    deptos = deptos.filter((d) => d === deptoFiltro);
  }
  if (proveedor) {
    const deptosDelProveedor = deptosPorProveedor.get(proveedor) ?? new Set();
    deptos = deptos.filter((d) => deptosDelProveedor.has(d));
  }

  const porDepartamento: Record<string, unknown>[] = [];

  for (const dept of deptos) {
    let deptProviders = proveedores.filter((p) => p.departamento === dept);

    if (soloRedes) {
      const proveedoresEnDept = deptProviders.filter((p) => deptosPorProveedor.get(p.supplier_id)!.size > 1);
      if (proveedoresEnDept.length === 0) continue;
      deptProviders = proveedoresEnDept;
    }

    const shares = deptProviders.map((p) => ({ supplierId: p.supplier_id, valorTotal: Number(p.monto_total) }));
    const totalDepto = deptProviders.reduce((s, p) => s + Number(p.monto_total), 0);
    const conc = computeConcentration(shares);

    const hhiNivel = conc.hhi < 1500 ? "COMPETITIVO" : conc.hhi < 2500 ? "MODERADO" : "ALTAMENTE_CONCENTRADO";

    const item: Record<string, unknown> = {
      departamento: dept,
      valorTotal: totalDepto,
      proveedoresConsiderados: conc.proveedoresConsiderados,
      cr1: Math.round((deptProviders.reduce((s, p) => Math.max(s, Number(p.monto_total)), 0) / totalDepto) * 1000) / 10,
      cr3: Math.round(conc.cr3 * 10) / 10,
      cr5: Math.round(conc.cr5 * 10) / 10,
      hhi: conc.hhi,
      hhiNivel,
      alerta:
        conc.cr3 > 80
          ? "UN_PROVEEDOR_O_GRUPO_DOMINA_MAS_DEL_80_PCT"
          : conc.hhi >= 2500
            ? "MERCADO_ALTAMENTE_CONCENTRADO"
            : null,
    };

    if (conProveedores) {
      item.proveedores = deptProviders.map((p) => ({
        supplierId: p.supplier_id,
        supplierName: p.supplier_name,
        montoTotal: Number(p.monto_total),
        cuotaPct: Math.round((Number(p.monto_total) / totalDepto) * 10000) / 100,
        adjudicaciones: Number(p.adjudicaciones),
        entidadesCompradoras: Number(p.entidades_compradoras),
      }));
    }

    porDepartamento.push(item);
  }

  const redes = !soloRedes
    ? []
    : [...deptosPorProveedor]
        .filter(([, d]) => d.size > 1)
        .map(([supplierId, deptosSet]) => {
          const montos = proveedores.filter((p) => p.supplier_id === supplierId);
          return {
            supplierId,
            supplierName: montos[0]?.supplier_name,
            departamentos: [...deptosSet],
            montoTotal: montos.reduce((s, p) => s + Number(p.monto_total), 0),
            adjudicaciones: montos.reduce((s, p) => s + Number(p.adjudicaciones), 0),
          };
        })
        .sort((a, b) => b.montoTotal - a.montoTotal);

  return {
    status: 200,
    body: {
      meta: {
        cobertura: "Awards OECE (últimas ~10 páginas por corrida — no es snapshot completo)",
        metodologia: {
          crk: "Suma de las k cuotas de mercado más grandes (%)",
          hhi: "Suma de cuotas al cuadrado (base 10,000; 1 proveedor = 10,000)",
          umbralesHhi: { competitivo: "< 1,500", moderado: "1,500 – 2,500", altamenteConcentrado: "> 2,500" },
        },
        limitaciones: [
          "La muestra no es completa del universo — cobertura variable según última corrida OECE.",
          "Grupos económicos con múltiples RUCs no se detectan desde awards.",
          "Proveedores nuevos o inactivos no participan y pueden subestimar la concentración real.",
          "`proveedor` y `departamento` solo acotan qué departamentos se muestran — el HHI/CRk de cada departamento siempre se calcula sobre TODOS sus proveedores, nunca sobre un subconjunto.",
        ],
        filtros: { departamento, categoria, soloRedes, proveedor, anio },
      },
      porDepartamento,
      ...(redes.length > 0 ? { redesProveedores: redes } : {}),
    },
  };
}

interface AwardsConcRow extends NeonRow {
  departamento: string;
  monto_total: number | string;
  proveedores: number | string;
  entidades_compradoras: number | string;
}

interface MenorConcRow extends NeonRow {
  provincia: string;
  monto_total: number | string;
  contratos: number | string;
  proveedores: number | string;
}

interface ProveedorMontoRow extends NeonRow {
  supplier_id: string;
  monto: number | string;
}

/**
 * Handler para `compras_publicas_indice_concentracion_comparativa` — GET /api/indices/concentracion/comparativa.
 * Origen: apps/compras-publicas/api/src/routes/concentracion.ts.
 */
export async function comparativa(ctx: ToolHandlerContext): Promise<HandlerResult> {
  const { db, args } = ctx;
  const departamento = (args.departamento as string | undefined) ?? "LA LIBERTAD";
  const anio = args.anio ? Number(args.anio) : 2026;
  const deptos = departamento
    .split(",")
    .map((d) => d.trim().toUpperCase())
    .filter((d) => d.length > 0);

  const { rows: awardsConc } = await db.query<AwardsConcRow>(
    `SELECT
       COALESCE(a.departamento, 'NO REGISTRADO') AS departamento,
       SUM(a.valor_monto) AS monto_total,
       COUNT(DISTINCT a.supplier_id) AS proveedores,
       COUNT(DISTINCT a.buyer_id) AS entidades_compradoras
     FROM awards a
     WHERE a.departamento = ANY($1)
       AND EXTRACT(YEAR FROM a.fecha) = $2
       AND a.valor_monto > 0
     GROUP BY a.departamento`,
    [deptos, anio]
  );

  const { rows: menoresConc } = await db.query<MenorConcRow>(
    `SELECT
       mu.province AS provincia,
       SUM(m.awarded_amount) AS monto_total,
       COUNT(*) AS contratos,
       COUNT(DISTINCT m.winning_supplier_id) AS proveedores
     FROM minor_contracts m
     JOIN municipalities mu ON mu.municipality_id = m.municipality_id
     WHERE mu.department = ANY($1)
       AND m.year = $2
       AND m.awarded_amount > 0
     GROUP BY mu.province`,
    [deptos, anio]
  );

  const awardsProviders: Record<string, number> = {};
  for (const r of awardsConc) {
    const { rows: provs } = await db.query<ProveedorMontoRow>(
      `SELECT supplier_id, SUM(valor_monto) AS monto
       FROM awards
       WHERE departamento = $1 AND EXTRACT(YEAR FROM fecha) = $2 AND valor_monto > 0
       GROUP BY supplier_id`,
      [r.departamento, anio]
    );
    const conc = computeConcentration(provs.map((p) => ({ supplierId: p.supplier_id, valorTotal: Number(p.monto) })));
    awardsProviders[r.departamento] = conc.hhi;
  }

  return {
    status: 200,
    body: {
      meta: {
        cobertura: "Awards OECE (mayor cuantía) + menores SEACE (menor a 8 UIT)",
        nota: "Awards y menores son mercados distintos — la comparación directa de HHI tiene sentido solo como proxy de diversificación del proveedor, no como benchmark directo.",
        filtros: { departamentos: deptos, anio },
        fuente: { awards: "OECE / contratacionesabiertas.oece.gob.pe", menores: "SEACE / Sigma" },
      },
      awards: awardsConc.map((r) => {
        const hhi = awardsProviders[r.departamento] ?? null;
        return {
          departamento: r.departamento,
          montoTotal: Number(r.monto_total),
          proveedores: Number(r.proveedores),
          entidadesCompradoras: Number(r.entidades_compradoras),
          hhi,
          hhiNivel:
            hhi === null
              ? null
              : hhi < 1500
                ? "COMPETITIVO"
                : hhi < 2500
                  ? "MODERADO"
                  : "ALTAMENTE_CONCENTRADO",
        };
      }),
      menores: menoresConc.map((r) => ({
        provincia: r.provincia,
        montoTotal: Number(r.monto_total),
        contratos: Number(r.contratos),
        proveedores: Number(r.proveedores),
      })),
    },
  };
}
