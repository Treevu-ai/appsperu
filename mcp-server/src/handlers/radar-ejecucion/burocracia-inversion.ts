import type { NeonRow } from "../../db/neon-pool.js";
import { LATEST_BUDGET_CTE } from "../../db/latest-budget.js";
import type { ToolHandlerContext, HandlerResult } from "../registry.js";

interface BurocraciaInversionRow extends NeonRow {
  entity_code: string;
  nombre: string;
  nivel_gobierno: string;
  departamento: string | null;
  provincia: string | null;
  distrito: string | null;
  anio_fiscal: number;
  devengado_personal: number | string | null;
  devengado_inversion: number | string | null;
  devengado_clasificado: number | string | null;
  tiene_filas_sin_clasificar: boolean;
}

/**
 * Handler para `radar_ejecucion_burocracia_inversion` — GET /api/burocracia-inversion.
 *
 * Ratio gasto-en-planilla vs. gasto-en-inversión por entidad/distrito.
 * No es un conector nuevo: usa `budget_execution.generica` (ADR-0006),
 * ya poblado por `mef-connector.ts`. El código real de "genérica" del MEF
 * es un dígito simple, no "2.1"/"2.6" como decía el texto original de
 * ADR-0006 — verificado en vivo contra datos reales de budget_execution
 * (2026-09-05): `1` = "PERSONAL Y OBLIGACIONES SOCIALES", `6` =
 * "ADQUISICION DE ACTIVOS NO FINANCIEROS" (inversión).
 *
 * Excluye `meta_departamento IS NOT NULL` (gasto de Gobierno Nacional
 * dirigido a un departamento, ej. ANIN en La Libertad con sede en Lima):
 * el destino de esas filas solo se conoce a nivel departamento, no
 * distrito, así que atribuirles el distrito de la sede de la entidad
 * sería un dato falso para este vertical.
 */
export async function list(ctx: ToolHandlerContext): Promise<HandlerResult> {
  const { db, args } = ctx;

  const anio = args.anio as string | undefined;
  const departamento = args.departamento as string | undefined;
  const nivel = args.nivel as string | undefined;
  const entityCode = args.entityCode as string | undefined;

  const conditions: string[] = ["b.meta_departamento IS NULL"];
  const params: unknown[] = [];

  if (anio) {
    params.push(Number(anio));
    conditions.push(`b.anio_fiscal = $${params.length}`);
  }
  if (departamento) {
    params.push(departamento.toUpperCase());
    conditions.push(`t.departamento = $${params.length}`);
  }
  if (nivel) {
    params.push(nivel);
    conditions.push(`e.nivel_gobierno = $${params.length}`);
  }
  if (entityCode) {
    params.push(entityCode);
    conditions.push(`e.entity_code = $${params.length}`);
  }

  const where = `WHERE ${conditions.join(" AND ")}`;

  const { rows } = await db.query<BurocraciaInversionRow>(
    `${LATEST_BUDGET_CTE}
     SELECT e.entity_code, e.nombre, e.nivel_gobierno, t.departamento, t.provincia, t.distrito,
            b.anio_fiscal,
            SUM(b.devengado) FILTER (WHERE b.generica = '1') AS devengado_personal,
            SUM(b.devengado) FILTER (WHERE b.generica = '6') AS devengado_inversion,
            SUM(b.devengado) FILTER (WHERE b.generica IS NOT NULL) AS devengado_clasificado,
            bool_or(b.generica IS NULL) AS tiene_filas_sin_clasificar
     FROM latest_budget b
     JOIN entities e ON e.entity_code = b.entity_code
     LEFT JOIN territories t ON t.ubigeo = e.ubigeo
     ${where}
     GROUP BY e.entity_code, e.nombre, e.nivel_gobierno, t.departamento, t.provincia, t.distrito, b.anio_fiscal
     ORDER BY devengado_clasificado DESC NULLS LAST
     LIMIT 1000`,
    params
  );

  return {
    status: 200,
    body: {
      coberturaTemporal: {
        estado: "PARCIAL",
        limitacion: "Cada observación usa el último corte disponible de budget_execution; no cubre gasto de Gobierno Nacional dirigido a un departamento (meta_departamento).",
      },
      metodologia: {
        genericaPersonal: "1 — PERSONAL Y OBLIGACIONES SOCIALES",
        genericaInversion: "6 — ADQUISICION DE ACTIVOS NO FINANCIEROS",
        exclusiones: "Excluye gasto de Gobierno Nacional dirigido a un departamento (meta_departamento) y filas sin GENERICA clasificada (no se tratan como cero, se excluyen de ambos sumandos).",
        referencia: "docs/adr/0006-radar-ejecucion-generica-de-gasto-y-gasto-nacional-por-meta-departamento.md",
      },
      resultados: rows.map((r) => {
        const devengadoPersonal = Number(r.devengado_personal ?? 0);
        const devengadoInversion = Number(r.devengado_inversion ?? 0);
        const ratioIndefinido = devengadoInversion === 0;
        return {
          entityCode: r.entity_code,
          nombre: r.nombre,
          nivelGobierno: r.nivel_gobierno,
          departamento: r.departamento,
          provincia: r.provincia,
          distrito: r.distrito,
          anioFiscal: r.anio_fiscal,
          devengadoPersonal,
          devengadoInversion,
          devengadoTotal: Number(r.devengado_clasificado ?? 0),
          ratioPlanillaInversion: ratioIndefinido ? null : devengadoPersonal / devengadoInversion,
          ratioIndefinido,
          tieneFilasSinClasificar: r.tiene_filas_sin_clasificar,
          fuente: {
            dataset: "MEF - Presupuesto y ejecución de gasto",
            referencia: "ADR-0006",
          },
        };
      }),
    },
  };
}