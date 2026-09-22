import { Router } from "express";
import { z } from "zod";
import { pool } from "../db/pool.js";
import { inversionesPool, infobrasPool } from "../db/external-pools.js";
import { asyncHandler } from "../lib/async-handler.js";
import { parseQuery } from "../lib/validate-query.js";

export const crossrefRouter = Router();

/**
 * Ticket PRV-02 (docs/BACKLOG_Preparacion_Riesgo_Fenomeno_Nino_v1.md). Spike real en
 * docs/spike-preparacion-riesgo-nino-2026-09.md:
 * - `peligro` fijo verificado en vivo (LLUVIA INTENSA/INUNDACION/HUAYCO/DESLIZAMIENTO/EROSION),
 *   ampliable por query param.
 * - `investments.funcion` NO sirve para filtrar prevención/GRD (ningún valor real lo cubre) --
 *   se filtra por `nombre` con keywords, explícitamente no exhaustivo.
 * - No se usa el `GET /api/crossref` HTTP de `infobras`: ese endpoint agrega por CUI a nivel
 *   departamental y no expone `distrito`, que es el anclaje territorial de este cruce. Se lee
 *   directo de las dos bases externas (mismo patrón que infracciones-ambientales -> comprasPool).
 */
const PELIGROS_NINIO_DEFAULT = ["LLUVIA INTENSA", "INUNDACION", "HUAYCO", "DESLIZAMIENTO", "EROSION"];

const KEYWORDS_PREVENCION = ["defensa riberen", "defensa ribere", "descolmat", "drenaje pluvial", "encauzamiento"];

const QuerySchema = z.object({
  departamento: z.string().min(1).default("LA LIBERTAD"),
  peligros: z
    .string()
    .min(1)
    .optional()
    .describe("Lista separada por comas, ej. LLUVIA INTENSA,INUNDACION. Default: set verificado en el spike PRV-01."),
});

interface EmergenciaAgregada {
  distrito: string;
  totalEmergencias: number;
  damnificados: number;
  viviendasDestruidas: number;
  ultimaFecha: string | null;
}

interface ProyectoPrevencion {
  cui: string;
  distrito: string | null;
  nombre: string | null;
  estado: string | null;
  montoViable: number | null;
  costoActualizado: number | null;
  obrasInfobras: number;
  obrasParalizadas: number;
  avanceFisicoRealPromedio: number | null;
}

crossrefRouter.get(
  "/preparacion-riesgo",
  asyncHandler(async (req, res) => {
    const parsed = parseQuery(QuerySchema, req.query, res);
    if (!parsed) return;
    const departamento = parsed.departamento.toUpperCase().trim();
    const peligros = parsed.peligros
      ? parsed.peligros.split(",").map((p) => p.trim().toUpperCase()).filter(Boolean)
      : PELIGROS_NINIO_DEFAULT;

    if (!inversionesPool) {
      res.json({ estado: "ENRIQUECIMIENTO_NO_CONFIGURADO", departamento, distritos: [] });
      return;
    }

    const { rows: emergenciaRows } = await pool.query<{
      distrito: string;
      total_emergencias: string;
      damnificados: string;
      viviendas_destruidas: string;
      ultima_fecha: string | null;
    }>(
      `SELECT distrito,
              COUNT(*) AS total_emergencias,
              COALESCE(SUM(damnificados), 0) AS damnificados,
              COALESCE(SUM(viviendas_destruidas), 0) AS viviendas_destruidas,
              MAX(fecha_emergencia) AS ultima_fecha
       FROM indeci_emergencias
       WHERE departamento = $1 AND peligro = ANY($2)
       GROUP BY distrito
       ORDER BY total_emergencias DESC`,
      [departamento, peligros]
    );

    const emergenciasPorDistrito = new Map<string, EmergenciaAgregada>(
      emergenciaRows.map((r) => [
        r.distrito,
        {
          distrito: r.distrito,
          totalEmergencias: Number(r.total_emergencias),
          damnificados: Number(r.damnificados),
          viviendasDestruidas: Number(r.viviendas_destruidas),
          ultimaFecha: r.ultima_fecha,
        },
      ])
    );

    let proyectosPorDistrito = new Map<string, ProyectoPrevencion[]>();
    try {
      const keywordConditions = KEYWORDS_PREVENCION.map((_, i) => `nombre ILIKE $${i + 2}`).join(" OR ");
      const { rows: investmentRows } = await inversionesPool.query<{
        cui: string;
        distrito: string | null;
        nombre: string | null;
        estado: string | null;
        monto_viable: string | null;
        costo_actualizado: string | null;
      }>(
        `SELECT cui, distrito, nombre, estado, monto_viable, costo_actualizado
         FROM investments
         WHERE departamento = $1 AND (${keywordConditions})`,
        [departamento, ...KEYWORDS_PREVENCION.map((k) => `%${k}%`)]
      );

      let obrasPorCui = new Map<string, { obras: number; obrasParalizadas: number; avanceFisicoRealPromedio: number | null }>();
      if (infobrasPool && investmentRows.length > 0) {
        try {
          const cuis = investmentRows.map((r) => r.cui);
          const { rows: obraRows } = await infobrasPool.query<{
            cui: string;
            obras: string;
            obras_paralizadas: string;
            avance_fisico_real_promedio: string | null;
          }>(
            `SELECT cui,
                    COUNT(*) AS obras,
                    COUNT(*) FILTER (WHERE existe_paralizacion) AS obras_paralizadas,
                    AVG(avance_fisico_real_pct) AS avance_fisico_real_promedio
             FROM public_works
             WHERE cui = ANY($1)
             GROUP BY cui`,
            [cuis]
          );
          obrasPorCui = new Map(
            obraRows.map((r) => [
              r.cui,
              {
                obras: Number(r.obras),
                obrasParalizadas: Number(r.obras_paralizadas),
                avanceFisicoRealPromedio:
                  r.avance_fisico_real_promedio === null ? null : Math.round(Number(r.avance_fisico_real_promedio) * 100) / 100,
              },
            ])
          );
        } catch (err) {
          console.error("No se pudo cruzar contra infobras (enriquecimiento opcional):", err instanceof Error ? err.message : err);
        }
      }

      proyectosPorDistrito = new Map();
      for (const r of investmentRows) {
        if (!r.distrito) continue;
        const obra = obrasPorCui.get(r.cui) ?? { obras: 0, obrasParalizadas: 0, avanceFisicoRealPromedio: null };
        const proyecto: ProyectoPrevencion = {
          cui: r.cui,
          distrito: r.distrito,
          nombre: r.nombre,
          estado: r.estado,
          montoViable: r.monto_viable === null ? null : Number(r.monto_viable),
          costoActualizado: r.costo_actualizado === null ? null : Number(r.costo_actualizado),
          obrasInfobras: obra.obras,
          obrasParalizadas: obra.obrasParalizadas,
          avanceFisicoRealPromedio: obra.avanceFisicoRealPromedio,
        };
        if (!proyectosPorDistrito.has(r.distrito)) proyectosPorDistrito.set(r.distrito, []);
        proyectosPorDistrito.get(r.distrito)!.push(proyecto);
      }
    } catch (err) {
      console.error("No se pudo cruzar contra radar-inversiones (enriquecimiento opcional):", err instanceof Error ? err.message : err);
      res.json({ estado: "ENRIQUECIMIENTO_NO_DISPONIBLE", departamento, distritos: [] });
      return;
    }

    const todosLosDistritos = new Set<string>([...emergenciasPorDistrito.keys(), ...proyectosPorDistrito.keys()]);

    const distritos = [...todosLosDistritos]
      .map((distrito) => {
        const emergencias = emergenciasPorDistrito.get(distrito) ?? null;
        const proyectosPrevencion = proyectosPorDistrito.get(distrito) ?? [];
        return {
          distrito,
          historialEmergencias: emergencias,
          proyectosPrevencion,
          sinProyectosPrevencion: proyectosPrevencion.length === 0,
        };
      })
      .sort((a, b) => (b.historialEmergencias?.totalEmergencias ?? 0) - (a.historialEmergencias?.totalEmergencias ?? 0));

    res.json({
      departamento,
      peligrosConsultados: peligros,
      matcher: "territorial_texto_distrito",
      exhaustivo: false,
      restriccion:
        "Coincidencia territorial (mismo nombre de distrito) y de texto libre en el nombre del proyecto de inversión -- no implica causalidad ni que la lista de proyectos de prevención sea exhaustiva (el filtro por nombre puede tener falsos negativos). Requiere revisión humana, mismo estándar que el resto del catálogo.",
      totalDistritos: distritos.length,
      distritos,
    });
  })
);
