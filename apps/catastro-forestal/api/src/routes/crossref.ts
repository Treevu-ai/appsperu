import { Router } from "express";
import { z } from "zod";
import { pool } from "../db/pool.js";
import { ceplanGeoPool, catastroMineroPool } from "../db/external-pools.js";
import { asyncHandler } from "../lib/async-handler.js";
import { parseQuery } from "../lib/validate-query.js";

export const crossrefRouter = Router();

/**
 * Ticket CFM-01 (docs/BACKLOG_Conflicto_Uso_Suelo_Forestal_Minero_v1.md). Spike real en
 * docs/spike-conflicto-uso-suelo-forestal-minero-2026-09.md:
 * - Este conector usa `modalidad_concesiones_forestales` (1,793 filas), la capa más cercana a un
 *   "título habilitante" real de las 10 de SERFOR -- no todas las capas son título, algunas son
 *   zonificación (`ordenamiento_*`) sin titular.
 * - `nom_dep`/`nom_pro`/`nom_dis` son códigos UBIGEO (no nombres) en 9 de las 10 capas, incluida
 *   `modalidad_concesiones_forestales` -- se traducen vía `territories` de ceplan-geo (join
 *   exacto por `ubigeo`, 1,874 distritos), no por texto libre.
 * - `SITUAC` no tiene significado documentado por SERFOR (código crudo sin diccionario de datos
 *   público) -- NO se usa para filtrar vigencia. Vigencia real se calcula con `fec_ter` (fecha de
 *   término), mismo criterio temporal que `inhabilitaciones` en proveedores-sancionados.
 * - `catastro_minero_derechos.estado = 'T'` (D.M. Titulado D.L. 708) es el estado que más se
 *   acerca a "derecho minero activo" -- verificado en vivo, 38,239 de 66,870 filas nacionales.
 */
const CrossrefQuerySchema = z.object({
  departamento: z.string().min(1).default("MADRE DE DIOS"),
});

interface ConcesionForestal {
  distrito: string;
  provincia: string;
  departamento: string;
  totalConcesiones: number;
  superficieHa: number;
}

interface DerechoMinero {
  cantidad: number;
  hectareas: number;
}

crossrefRouter.get(
  "/conflicto-uso-suelo",
  asyncHandler(async (req, res) => {
    const parsed = parseQuery(CrossrefQuerySchema, req.query, res);
    if (!parsed) return;
    const departamento = parsed.departamento.toUpperCase().trim();

    if (!ceplanGeoPool) {
      res.json({ estado: "ENRIQUECIMIENTO_NO_CONFIGURADO", departamento, distritos: [] });
      return;
    }

    const { rows: forestalRows } = await pool.query<{
      nom_dis: string;
      total: string;
      superficie: string | null;
    }>(
      `SELECT nom_dis,
              COUNT(*) AS total,
              SUM(COALESCE(sup_apr, sup_sig, 0)) AS superficie
       FROM catastro_forestal_titulos
       WHERE capa = 'modalidad_concesiones_forestales'
         AND (fec_ter IS NULL OR fec_ter > CURRENT_DATE)
       GROUP BY nom_dis`
    );

    if (forestalRows.length === 0) {
      res.json({ departamento, distritos: [] });
      return;
    }

    let concesionesPorDistrito = new Map<string, ConcesionForestal>();
    try {
      const ubigeos = forestalRows.map((r) => r.nom_dis);
      const { rows: territoryRows } = await ceplanGeoPool.query<{
        ubigeo: string;
        departamento: string;
        provincia: string;
        distrito: string;
      }>(`SELECT ubigeo, departamento, provincia, distrito FROM territories WHERE ubigeo = ANY($1)`, [ubigeos]);

      const territorioPorUbigeo = new Map(territoryRows.map((t) => [t.ubigeo, t]));
      for (const r of forestalRows) {
        const territorio = territorioPorUbigeo.get(r.nom_dis);
        if (!territorio || territorio.departamento !== departamento) continue;
        concesionesPorDistrito.set(territorio.distrito, {
          distrito: territorio.distrito,
          provincia: territorio.provincia,
          departamento: territorio.departamento,
          totalConcesiones: Number(r.total),
          superficieHa: r.superficie === null ? 0 : Math.round(Number(r.superficie) * 100) / 100,
        });
      }
    } catch (err) {
      console.error("No se pudo traducir UBIGEO contra ceplan-geo (enriquecimiento opcional):", err instanceof Error ? err.message : err);
      res.json({ estado: "ENRIQUECIMIENTO_NO_DISPONIBLE", departamento, distritos: [] });
      return;
    }

    let mineroPorDistrito = new Map<string, DerechoMinero>();
    if (catastroMineroPool && concesionesPorDistrito.size > 0) {
      try {
        const distritos = [...concesionesPorDistrito.keys()];
        const { rows: mineroRows } = await catastroMineroPool.query<{
          distrito: string;
          cantidad: string;
          hectareas: string | null;
        }>(
          `SELECT distrito, COUNT(*) AS cantidad, SUM(hectareas) AS hectareas
           FROM catastro_minero_derechos
           WHERE departamento = $1 AND estado = 'T' AND distrito = ANY($2)
           GROUP BY distrito`,
          [departamento, distritos]
        );
        mineroPorDistrito = new Map(
          mineroRows.map((r) => [
            r.distrito,
            { cantidad: Number(r.cantidad), hectareas: r.hectareas === null ? 0 : Math.round(Number(r.hectareas) * 100) / 100 },
          ])
        );
      } catch (err) {
        console.error("No se pudo cruzar contra catastro-minero (enriquecimiento opcional):", err instanceof Error ? err.message : err);
      }
    }

    const distritos = [...concesionesPorDistrito.values()]
      .map((c) => {
        const minero = mineroPorDistrito.get(c.distrito) ?? null;
        return {
          distrito: c.distrito,
          provincia: c.provincia,
          departamento: c.departamento,
          concesionForestal: { totalConcesiones: c.totalConcesiones, superficieHa: c.superficieHa },
          derechoMinero: minero,
          hayConflictoUsoSuelo: minero !== null && minero.cantidad > 0,
        };
      })
      .sort((a, b) => (b.derechoMinero?.cantidad ?? 0) - (a.derechoMinero?.cantidad ?? 0));

    res.json({
      departamento,
      matcher: "ubigeo_exacto_via_territories",
      restriccion:
        "Coincidencia territorial por distrito entre concesiones forestales vigentes (SERFOR) y derechos mineros titulados (INGEMMET, estado T) -- no implica superposición de polígonos reales (ninguna de las dos fuentes trae geometría en este conector), solo que ambos usos de suelo activos coexisten en el mismo distrito. No implica ilegalidad -- requiere revisión humana, mismo estándar que el resto del catálogo.",
      totalDistritos: distritos.length,
      distritos,
    });
  })
);
