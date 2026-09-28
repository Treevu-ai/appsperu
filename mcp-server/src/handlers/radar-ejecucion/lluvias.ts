import type { NeonPool, NeonRow } from "../../db/neon-pool.js";
import type { ToolHandlerContext, HandlerResult } from "../registry.js";

interface LluviaRow extends NeonRow {
  entity_code: string;
  entidad_responsable: string;
  proyecto_nombre: string;
  programa_ppto_nombre: string | null;
  anio_fiscal: number;
  pia: number | string;
  pim: number | string;
  devengado: number | string;
  meta_departamento: string | null;
  fecha_corte: string;
  resource_id: number;
  departamento_ejecutora: string | null;
  provincia_ejecutora: string | null;
  distrito_ejecutora: string | null;
}

interface ProyectoTerritorialRow extends NeonRow {
  cui: string;
  actividad_literal: string;
  entidad_responsable: string;
  departamento: string;
  pia_legal: number | string | null;
  pim: number | string | null;
  devengado: number | string | null;
  estado_pim: string;
  alerta_consistencia_territorial: string | null;
  observed_at: string | Date | null;
  distritos: Array<{ distrito: string; estado: string }>;
  fuentes: Array<{ etiqueta: string; url: string; detalle: string }>;
}

/**
 * Handler para `radar_ejecucion_lluvias_seguimiento` — GET /api/lluvias/seguimiento
 * Tablero terminal de seguimiento ante lluvias: actividad MEF con PIA/PIM/devengado
 * y, en una sección separada, proyectos territoriales con CUI verificado.
 * No une ambas secciones por similitud de nombre ni inventa PIM, CUI o distrito beneficiado.
 */
export async function seguimiento(ctx: ToolHandlerContext): Promise<HandlerResult> {
  const { db, args } = ctx;

  const departamento = ((args.departamento as string | undefined) ?? "LA LIBERTAD").toUpperCase();
  const conditions: string[] = [
    "(p.meta_departamento = $1 OR (p.meta_departamento IS NULL AND t.departamento = $1))",
  ];
  const params: unknown[] = [departamento];

  if (args.anio) {
    params.push(Number(args.anio));
    conditions.push(`p.anio_fiscal = $${params.length}`);
  }
  if (args.busqueda) {
    params.push(`%${(args.busqueda as string).toUpperCase()}%`);
    conditions.push(
      `(UPPER(p.proyecto_nombre) LIKE $${params.length} OR UPPER(COALESCE(p.programa_ppto_nombre, '')) LIKE $${params.length})`
    );
  }

  const { rows } = await db.query<LluviaRow>(
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
  if (args.busqueda) {
    evidenceParams.push(`%${(args.busqueda as string).toUpperCase()}%`);
    evidenceWhere += ` AND UPPER(p.actividad_literal) LIKE $${evidenceParams.length}`;
  }
  const { rows: proyectosTerritoriales } = await db.query<ProyectoTerritorialRow>(
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
    evidenceParams
  );

  return {
    status: 200,
    body: {
      tablero: "seguimiento_lluvias",
      filtros: { departamento, anio: args.anio ? Number(args.anio) : null, busqueda: args.busqueda ?? null },
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
    },
  };
}