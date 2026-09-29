import type { NeonRow } from "../../db/neon-pool.js";
import { getPoolForApp, type NeonEnv } from "../../db/neon-env.js";
import type { ToolHandlerContext, HandlerResult } from "../registry.js";

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

interface ForestalRow extends NeonRow {
  nom_dis: string;
  total: string;
  superficie: string | null;
}

interface TerritoryRow extends NeonRow {
  ubigeo: string;
  departamento: string;
  provincia: string;
  distrito: string;
}

interface MineroRow extends NeonRow {
  distrito: string;
  cantidad: string;
  hectareas: string | null;
}

/**
 * Handler para `catastro_forestal_conflicto_uso_suelo` — GET /api/crossref/conflicto-uso-suelo.
 *
 * SQL idéntico a `apps/catastro-forestal/api/src/routes/crossref.ts`.
 * `ceplanGeoPool`/`catastroMineroPool` de la ruta Express (bases `ceplan-geo`,
 * `catastro-minero`) se resuelven acá vía `getPoolForApp(env, ...)` — cruce
 * entre bases distintas, no se puede resolver en un solo SQL (ver docblock
 * de `ToolHandlerContext.env`).
 */
export async function conflictoUsoSuelo(ctx: ToolHandlerContext): Promise<HandlerResult> {
  const { db, args, env } = ctx;

  const departamento = ((args.departamento as string | undefined) ?? "MADRE DE DIOS").toUpperCase().trim();

  const ceplanGeoPool = getPoolForApp(env as NeonEnv, "ceplan-geo");
  const catastroMineroPool = getPoolForApp(env as NeonEnv, "catastro-minero");

  if (!ceplanGeoPool) {
    return { status: 200, body: { estado: "ENRIQUECIMIENTO_NO_CONFIGURADO", departamento, distritos: [] } };
  }

  const { rows: forestalRows } = await db.query<ForestalRow>(
    `SELECT nom_dis,
            COUNT(*) AS total,
            SUM(COALESCE(sup_apr, sup_sig, 0)) AS superficie
     FROM catastro_forestal_titulos
     WHERE capa = 'modalidad_concesiones_forestales'
       AND (fec_ter IS NULL OR fec_ter > CURRENT_DATE)
     GROUP BY nom_dis`
  );

  if (forestalRows.length === 0) {
    return { status: 200, body: { departamento, distritos: [] } };
  }

  let concesionesPorDistrito = new Map<string, ConcesionForestal>();
  try {
    const ubigeos = forestalRows.map((r) => r.nom_dis);
    const { rows: territoryRows } = await ceplanGeoPool.query<TerritoryRow>(
      `SELECT ubigeo, departamento, provincia, distrito FROM territories WHERE ubigeo = ANY($1)`,
      [ubigeos]
    );

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
    return { status: 200, body: { estado: "ENRIQUECIMIENTO_NO_DISPONIBLE", departamento, distritos: [] } };
  }

  let mineroPorDistrito = new Map<string, DerechoMinero>();
  if (catastroMineroPool && concesionesPorDistrito.size > 0) {
    try {
      const distritos = [...concesionesPorDistrito.keys()];
      const { rows: mineroRows } = await catastroMineroPool.query<MineroRow>(
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

  return {
    status: 200,
    body: {
      departamento,
      matcher: "ubigeo_exacto_via_territories",
      restriccion:
        "Coincidencia territorial por distrito entre concesiones forestales vigentes (SERFOR) y derechos mineros titulados (INGEMMET, estado T) -- no implica superposición de polígonos reales (ninguna de las dos fuentes trae geometría en este conector), solo que ambos usos de suelo activos coexisten en el mismo distrito. No implica ilegalidad -- requiere revisión humana, mismo estándar que el resto del catálogo.",
      totalDistritos: distritos.length,
      distritos,
    },
  };
}
