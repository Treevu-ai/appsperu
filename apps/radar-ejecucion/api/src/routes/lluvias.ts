import { Router } from "express";
import { z } from "zod";
import { pool } from "../db/pool.js";
import { asyncHandler } from "../lib/async-handler.js";
import { parseQuery } from "../lib/validate-query.js";

export const lluviasRouter = Router();

const LluviasQuerySchema = z.object({
  anio: z.string().regex(/^\d{4}$/, "debe ser un año de 4 dígitos").optional(),
  departamento: z.string().min(1).optional(),
  busqueda: z.string().min(2).max(160).optional(),
});

/**
 * Tablero de terminal para hacer seguimiento a la preparación ante lluvias.
 *
 * Importante: el CSV del MEF identifica el territorio meta solo a nivel
 * departamento. Por eso `distritoBeneficiado` queda null cuando no existe
 * evidencia distrital; la sede de una entidad no se presenta como si fuera el
 * distrito que recibe el beneficio.
 */
lluviasRouter.get(
  "/seguimiento",
  asyncHandler(async (req, res) => {
    const parsed = parseQuery(LluviasQuerySchema, req.query, res);
    if (!parsed) return;

    const departamento = (parsed.departamento ?? "LA LIBERTAD").toUpperCase();
    const conditions: string[] = [
      "(p.meta_departamento = $1 OR (p.meta_departamento IS NULL AND t.departamento = $1))",
    ];
    const params: unknown[] = [departamento];

    if (parsed.anio) {
      params.push(Number(parsed.anio));
      conditions.push(`p.anio_fiscal = $${params.length}`);
    }
    if (parsed.busqueda) {
      params.push(`%${parsed.busqueda.toUpperCase()}%`);
      conditions.push(
        `(UPPER(p.proyecto_nombre) LIKE $${params.length} OR UPPER(COALESCE(p.programa_ppto_nombre, '')) LIKE $${params.length})`
      );
    }

    const { rows } = await pool.query(
      `WITH latest_projects AS (
         SELECT DISTINCT ON (
           p.entity_code, p.funcion, p.anio_fiscal, p.proyecto_nombre,
           COALESCE(p.meta_departamento, ''), COALESCE(p.generica, '')
         ) p.*
         FROM budget_execution_proyectos p
         ORDER BY p.entity_code, p.funcion, p.anio_fiscal, p.proyecto_nombre,
                  COALESCE(p.meta_departamento, ''), COALESCE(p.generica, ''),
                  p.fecha_corte DESC, p.id DESC
       )
       SELECT p.entity_code, e.nombre AS entidad_responsable, p.proyecto_nombre,
              p.programa_ppto_nombre, p.anio_fiscal, p.pia, p.pim, p.devengado,
              p.meta_departamento, p.fecha_corte, rb.resource_id,
              t.departamento AS departamento_ejecutora, t.provincia AS provincia_ejecutora,
              t.distrito AS distrito_ejecutora
       FROM latest_projects p
       JOIN entities e ON e.entity_code = p.entity_code
       JOIN raw_mef_batches rb ON rb.id = p.source_batch_id
       LEFT JOIN territories t ON t.ubigeo = e.ubigeo
       WHERE ${conditions.join(" AND ")}
       ORDER BY p.devengado DESC, p.pim DESC, p.proyecto_nombre
       LIMIT 500`,
      params
    );

    const evidenceParams: unknown[] = [departamento];
    let evidenceWhere = "p.departamento = $1";
    if (parsed.busqueda) {
      evidenceParams.push(`%${parsed.busqueda.toUpperCase()}%`);
      evidenceWhere += ` AND UPPER(p.actividad_literal) LIKE $${evidenceParams.length}`;
    }
    const { rows: proyectosTerritoriales } = await pool.query(
      `SELECT p.cui, p.actividad_literal, p.entidad_responsable, p.departamento,
              p.pia_legal, p.pim, p.devengado, p.estado_pim,
              p.alerta_consistencia_territorial, p.observed_at,
              COALESCE(
                jsonb_agg(DISTINCT jsonb_build_object('distrito', t.distrito, 'estado', t.estado))
                  FILTER (WHERE t.distrito IS NOT NULL), '[]'::jsonb
              ) AS distritos,
              COALESCE(
                jsonb_agg(DISTINCT jsonb_build_object('etiqueta', s.etiqueta, 'url', s.url, 'detalle', s.detalle))
                  FILTER (WHERE s.id IS NOT NULL), '[]'::jsonb
              ) AS fuentes
       FROM project_evidence_links p
       LEFT JOIN project_evidence_territories t ON t.cui = p.cui
       LEFT JOIN project_evidence_sources s ON s.cui = p.cui
       WHERE ${evidenceWhere}
       GROUP BY p.cui, p.actividad_literal, p.entidad_responsable, p.departamento,
                p.pia_legal, p.pim, p.devengado, p.estado_pim,
                p.alerta_consistencia_territorial, p.observed_at
       ORDER BY p.pia_legal DESC NULLS LAST, p.cui`,
      evidenceParams,
    );

    res.json({
      tablero: "seguimiento_lluvias",
      filtros: { departamento, anio: parsed.anio ? Number(parsed.anio) : null, busqueda: parsed.busqueda ?? null },
      cobertura: {
        reglaTerritorial:
          "Incluye gasto con DEPARTAMENTO_META igual al filtro y entidades cuya sede está en el departamento. El MEF no identifica el distrito beneficiado para todas las filas.",
        pimsHistoricos:
          "PIM=0 puede significar que la actividad no figura en la fila presupuestal MES_EJE=0; no se redistribuye el PIM agregado de la entidad.",
        conciliacion:
          "Las filas MEF de actividad y los proyectos con CUI se publican en secciones separadas. No hay cruce automático por nombre: solo se unirá cuando una fuente publique una clave exacta común.",
      },
      resultados: rows.map((r) => {
        const pim = Number(r.pim);
        const devengado = Number(r.devengado);
        return {
          entidadResponsable: r.entidad_responsable,
          entityCode: r.entity_code,
          cui: null,
          cuiEstado: "NO_PUBLICADO_EN_CSV_MEF_GASTO",
          actividad: r.proyecto_nombre,
          programaPresupuestal: r.programa_ppto_nombre,
          anioFiscal: r.anio_fiscal,
          pia: Number(r.pia),
          pim,
          devengado,
          saldoPorDevengar: pim >= devengado ? pim - devengado : null,
          pimCobertura: pim > 0 ? "ATRIBUIDO_A_LA_ACTIVIDAD_POR_FILA_MEF" : "NO_ATRIBUIBLE_EN_FILA_MEF",
          distritoBeneficiado: null,
          distritoBeneficiadoEstado: "NO_PUBLICADO_EN_CSV_MEF_GASTO",
          alcanceTerritorial:
            r.meta_departamento !== null
              ? { tipo: "DEPARTAMENTO_META", departamento: r.meta_departamento }
              : {
                  tipo: "SEDE_EJECUTORA_NO_EQUIVALE_A_BENEFICIARIO",
                  departamento: r.departamento_ejecutora,
                  provincia: r.provincia_ejecutora,
                  distrito: r.distrito_ejecutora,
                },
          fechaCorte: r.fecha_corte,
          fuente: { dataset: "MEF - Presupuesto y ejecución de gasto", resourceId: r.resource_id },
        };
      }),
      proyectosTerritoriales: proyectosTerritoriales.map((proyecto) => ({
        entidadResponsable: proyecto.entidad_responsable,
        cui: proyecto.cui,
        actividad: proyecto.actividad_literal,
        piaLegal: proyecto.pia_legal === null ? null : Number(proyecto.pia_legal),
        pim: proyecto.pim === null ? null : Number(proyecto.pim),
        devengado: proyecto.devengado === null ? null : Number(proyecto.devengado),
        pimCobertura: proyecto.estado_pim,
        distritoBeneficiado: (proyecto.distritos as Array<{ distrito: string }>).map((distrito) => distrito.distrito),
        distritoBeneficiadoEstado: "PUBLICADO_EN_FUENTE_DE_PROYECTO",
        alertaConsistenciaTerritorial: proyecto.alerta_consistencia_territorial,
        fechaObservacion: proyecto.observed_at,
        fuentes: proyecto.fuentes,
      })),
    });
  })
);
