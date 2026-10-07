import { Router } from "express";
import { z } from "zod";
import { pool } from "../db/pool.js";
import { computeConcentration } from "../suppliers/concentration.js";
import { asyncHandler } from "../lib/async-handler.js";
import { parseQuery } from "../lib/validate-query.js";

export const concentracionRouter = Router();

/**
 * Índice de concentración de mercado en adjudicaciones públicas (awards, OCDS/OECE).
 *
 * Descompone CR1, CR3, CR5 y HHI por departamento y categoría de contratación.
 * También responde al caso de uso "¿en qué mercados locales un solo proveedor
 * domina más del 50% del valor contratado?".
 *
 * Metodología:
 *   - CRk = suma de las k cuotas de mercado más grandes (%, 0–100)
 *   - HHI = suma de las cuotas de mercado al cuadrado (base 10,000; monopolio = 10,000)
 *   - Cuota = valor_adjudicado / valor_total_del_mercado × 100
 *   - HHI < 1,500 = mercado competitivo; 1,500–2,500 = moderadamente concentrado;
 *     > 2,500 = altamente concentrado (umbrales de la FTC/Sherman Act)
 *   - El HHI se calcula sobre las cuotas calculadas, no sobre el universo completo
 *
 * Limitaciones documentadas:
 *   - La muestra de awards refleja solo las últimas ~10 páginas de la API OECE
 *     por corrida de ingesta — no es un snapshot completo del universo.
 *     No inflar la cobertura real.
 *   - Un proveedor que aparece como un solo RUC pero es un grupo económico
 *     con múltiples RUCs no se detecta desde awards — requiere conformación
 *     societaria (fuera de este endpoint).
 *   - La ausencia de proveedores competidores en un mercado pequeño puede ser un
 *     hallazgo o una falta de interés comercial, no necesariamente irregularidad.
 */

const ConcentracionQuerySchema = z.object({
  /** Departamento a filtrar. Si se omite, devuelve el desglose por todos los departamentos. */
  departamento: z.string().min(1).optional(),
  /** Categoría OCDS (goods / works / services). */
  categoria: z.enum(["goods", "works", "services"]).optional(),
  /** Solo proveedores que ganan en múltiples departamentos (red de proveedores). */
  soloRedes: z.enum(["true", "false"]).optional().default("false"),
  /** Proveedor específico (RUC). */
  proveedor: z.string().min(1).optional(),
  /** Año de adjudicaciones. */
  anio: z.coerce.number().int().min(2020).max(2100).optional(),
  /** Si true, incluye métricas por proveedor individual (para debugging). */
  conProveedores: z.enum(["true", "false"]).optional().default("false"),
});

concentracionRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const parsed = parseQuery(ConcentracionQuerySchema, req.query, res);
    if (!parsed) return;

    const { departamento, categoria, soloRedes, proveedor, anio, conProveedores } = parsed;

    const condiciones: string[] = [];
    const params: unknown[] = [];

    if (departamento) {
      params.push(departamento.toUpperCase());
      condiciones.push(`a.departamento = $${params.length}`);
    }
    if (categoria) {
      params.push(categoria);
      condiciones.push(`LOWER(pp.categoria) = $${params.length}`);
    }
    if (proveedor) {
      params.push(proveedor);
      condiciones.push(`a.supplier_id = $${params.length}`);
    }
    if (anio !== undefined) {
      params.push(anio);
      condiciones.push(`EXTRACT(YEAR FROM a.fecha) = $${params.length}`);
    }

    const where = condiciones.length > 0 ? `WHERE ${condiciones.join(" AND ")}` : "";

    // Proveedores por departamento
    const proveedoresQuery = `
      SELECT
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
      ORDER BY a.departamento, SUM(a.valor_monto) DESC`;

    const { rows: proveedores } = await pool.query(proveedoresQuery, params);

    // Redes: proveedores que operan en más de 1 departamento
    const deptosPorProveedor = new Map<string, Set<string>>();
    for (const p of proveedores) {
      if (!deptosPorProveedor.has(p.supplier_id)) {
        deptosPorProveedor.set(p.supplier_id, new Set());
      }
      deptosPorProveedor.get(p.supplier_id)!.add(p.departamento);
    }

    // Concentración por departamento
    const deptos = [...new Set(proveedores.map((p) => p.departamento))].sort();
    const porDepartamento: Record<string, unknown>[] = [];

    for (const dept of deptos) {
      const deptProviders = proveedores.filter((p) => p.departamento === dept);

      if (soloRedes === "true") {
        // Filtrar a proveedores con presencia en más de 1 departamento
        const proveedoresEnDept = deptProviders.filter(
          (p) => deptosPorProveedor.get(p.supplier_id)!.size > 1
        );
        if (proveedoresEnDept.length === 0) continue;
        deptProviders.length = 0;
        proveedoresEnDept.forEach((p) => deptProviders.push(p));
      }

      const shares = deptProviders.map((p) => ({
        supplierId: p.supplier_id,
        valorTotal: Number(p.monto_total),
      }));

      const totalDepto = deptProviders.reduce((s, p) => s + Number(p.monto_total), 0);
      const conc = computeConcentration(shares);

      // Umbrales HHI interpretados (FTC/Sherman):
      // <1500 = competitivo, 1500–2500 = moderado, >2500 = altamente concentrado
      const hhiNivel =
        conc.hhi < 1500
          ? "COMPETITIVO"
          : conc.hhi < 2500
            ? "MODERADO"
            : "ALTAMENTE_CONCENTRADO";

      const item: Record<string, unknown> = {
        departamento: dept,
        valorTotal: totalDepto,
        proveedoresConsiderados: conc.proveedoresConsiderados,
        cr1: Math.round(
          (deptProviders.reduce((s, p) => Math.max(s, Number(p.monto_total)), 0) /
            totalDepto) *
            1000
        ) / 10,
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

      if (conProveedores === "true") {
        item.proveedores = deptProviders.map((p) => ({
          supplierId: p.supplier_id,
          supplierName: p.supplier_name,
          montoTotal: Number(p.monto_total),
          cuotaPct:
            Math.round((Number(p.monto_total) / totalDepto) * 10000) / 100,
          adjudicaciones: Number(p.adjudicaciones),
          entidadesCompradoras: Number(p.entidades_compradoras),
        }));
      }

      porDepartamento.push(item);
    }

    // Redes de proveedores cross-departamentales
    const redes = soloRedes !== "true"
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

    res.json({
      meta: {
        cobertura: "Awards OECE (últimas ~10 páginas por corrida — no es snapshot completo)",
        metodologia: {
          crk: "Suma de las k cuotas de mercado más grandes (%)",
          hhi: "Suma de cuotas al cuadrado (base 10,000; 1 proveedor = 10,000)",
          umbralesHhi: {
            competitivo: "< 1,500",
            moderado: "1,500 – 2,500",
            altamenteConcentrado: "> 2,500",
          },
        },
        limitaciones: [
          "La muestra no es completa del universo — cobertura variable según última corrida OECE.",
          "Grupos económicos con múltiples RUCs no se detectan desde awards.",
          "Proveedores nuevos o inactivos no participan y pueden subestimar la concentración real.",
        ],
        filtros: { departamento, categoria, soloRedes, proveedor, anio },
      },
      porDepartamento,
      ...(redes.length > 0 ? { redesProveedores: redes } : {}),
    });
  })
);

/**
 * Comparación directa entre la concentración en awards (mayor cuantía) y
 * en contratos menores (menor a 8 UIT). Responde: ¿dónde diverge
 * la concentración entre ambos mercados?
 */
const ComparativaQuerySchema = z.object({
  /** Departamento a filtrar. Default: LA LIBERTAD. */
  departamento: z.string().min(1).default("LA LIBERTAD"),
  /** Año de adjudicaciones. Default: 2026. */
  anio: z.coerce.number().int().min(2020).max(2100).default(2026),
});

concentracionRouter.get(
  "/comparativa",
  asyncHandler(async (req, res) => {
    const parsed = parseQuery(ComparativaQuerySchema, req.query, res);
    if (!parsed) return;

    const { departamento, anio } = parsed;
    const deptos = departamento.split(",").map((d) => d.trim().toUpperCase());

    // Concentración awards
    const { rows: awardsConc } = await pool.query(
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

    // Concentración menores por provincia
    const { rows: menoresConc } = await pool.query(
      `SELECT
         mu.province AS provincia,
         SUM(m.awarded_amount) AS monto_total,
         COUNT(*) AS contratos,
         COUNT(DISTINCT m.winning_supplier_id) AS proveedores
       FROM minor_contracts m
       JOIN municipalities mu ON mu.municipality_id = m.municipality_id
       WHERE mu.department = $1
         AND m.year = $2
         AND m.awarded_amount > 0
       GROUP BY mu.province`,
      [departamento.toUpperCase(), anio]
    );

    // HHI awards
    const awardsProviders: Record<string, number> = {};
    for (const r of awardsConc) {
      const { rows: provs } = await pool.query(
        `SELECT supplier_id, SUM(valor_monto) AS monto
         FROM awards
         WHERE departamento = $1 AND EXTRACT(YEAR FROM fecha) = $2 AND valor_monto > 0
         GROUP BY supplier_id`,
        [r.departamento, anio]
      );
      const total = Number(r.monto_total);
      const conc = computeConcentration(
        provs.map((p) => ({ supplierId: p.supplier_id, valorTotal: Number(p.monto) }))
      );
      awardsProviders[r.departamento] = conc.hhi;
    }

    res.json({
      meta: {
        cobertura: "Awards OECE (mayor cuantía) + menores SEACE (menor a 8 UIT)",
        nota: "Awards y menores son mercados distintos — la comparación directa de HHI tiene sentido solo como proxy de diversificación del proveedor, no como benchmark directo.",
        filtros: { departamentos: deptos, anio },
        fuente: {
          awards: "OECE / contratacionesabiertas.oece.gob.pe",
          menores: "SEACE / Sigma",
        },
      },
      awards: awardsConc.map((r) => ({
        departamento: r.departamento,
        montoTotal: Number(r.monto_total),
        proveedores: Number(r.proveedores),
        entidadesCompradoras: Number(r.entidades_compradoras),
        hhi: awardsProviders[r.departamento] ?? null,
        hhiNivel:
          (awardsProviders[r.departamento] ?? 0) < 1500
            ? "COMPETITIVO"
            : (awardsProviders[r.departamento] ?? 0) < 2500
              ? "MODERADO"
              : "ALTAMENTE_CONCENTRADO",
      })),
      menores: menoresConc.map((r) => ({
        provincia: r.provincia,
        montoTotal: Number(r.monto_total),
        contratos: Number(r.contratos),
        proveedores: Number(r.proveedores),
      })),
    });
  })
);
