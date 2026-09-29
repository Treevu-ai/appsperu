import type { NeonRow } from "../../db/neon-pool.js";
import { getPoolForApp, type NeonEnv } from "../../db/neon-env.js";
import type { ToolHandlerContext, HandlerResult } from "../registry.js";

/**
 * Handler para `emergencias_indeci_preparacion_riesgo` — GET /api/crossref/preparacion-riesgo.
 *
 * SQL idéntico a `apps/emergencias-indeci/api/src/routes/crossref.ts`.
 * `inversionesPool`/`infobrasPool`/`comprasPool` de la ruta Express (bases
 * `radar-inversiones`, `infobras`, `compras-publicas`) se resuelven acá vía
 * `getPoolForApp(env, ...)` — cruce entre bases distintas, no se puede
 * resolver en un solo SQL (ver docblock de `ToolHandlerContext.env`).
 */

const PELIGROS_NINIO_DEFAULT = ["LLUVIA INTENSA", "INUNDACION", "HUAYCO", "DESLIZAMIENTO", "EROSION"];

const KEYWORDS_PREVENCION = ["defensa riberen", "defensa ribere", "descolmat", "drenaje pluvial", "encauzamiento"];

const DISTRITO_SENTINEL_MULTIDISTRITO = "- TODOS -";

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
  obrasInfobras: number | null;
  obrasParalizadas: number | null;
  avanceFisicoRealPromedio: number | null;
}

interface EmergenciaRow extends NeonRow {
  distrito: string;
  total_emergencias: string;
  damnificados: string;
  viviendas_destruidas: string;
  ultima_fecha: string | null;
}

interface SeaceRow extends NeonRow {
  total_procesos: string;
  procesos_prevencion: string;
}

interface InvestmentRow extends NeonRow {
  cui: string;
  distrito: string | null;
  nombre: string | null;
  estado: string | null;
  monto_viable: string | null;
  costo_actualizado: string | null;
}

interface ObraRow extends NeonRow {
  cui: string;
  obras: string;
  obras_paralizadas: string;
  avance_fisico_real_promedio: string | null;
}

export async function preparacionRiesgo(ctx: ToolHandlerContext): Promise<HandlerResult> {
  const { db, args, env } = ctx;

  const departamento = ((args.departamento as string | undefined) ?? "LA LIBERTAD").toUpperCase().trim();
  const peligros = args.peligros
    ? (args.peligros as string).split(",").map((p) => p.trim().toUpperCase()).filter(Boolean)
    : PELIGROS_NINIO_DEFAULT;

  const inversionesPool = getPoolForApp(env as NeonEnv, "radar-inversiones");
  const infobrasPool = getPoolForApp(env as NeonEnv, "infobras");
  const comprasPool = getPoolForApp(env as NeonEnv, "compras-publicas");

  if (!inversionesPool) {
    return { status: 200, body: { estado: "ENRIQUECIMIENTO_NO_CONFIGURADO", departamento, distritos: [] } };
  }

  const { rows: emergenciaRows } = await db.query<EmergenciaRow>(
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
  let proyectosSinDistritoAsignado: ProyectoPrevencion[] = [];
  let infobrasEstado: "OK" | "NO_CONFIGURADO" | "NO_DISPONIBLE" = infobrasPool ? "OK" : "NO_CONFIGURADO";

  let seaceEstado: "OK" | "NO_CONFIGURADO" | "NO_DISPONIBLE" = comprasPool ? "OK" : "NO_CONFIGURADO";
  let seace: { totalProcesos: number; procesosPrevencionPorTitulo: number } | null = null;
  if (comprasPool) {
    try {
      const seaceKeywordConditions = KEYWORDS_PREVENCION.map((_, i) => `titulo ILIKE $${i + 2}`).join(" OR ");
      const { rows: seaceRows } = await comprasPool.query<SeaceRow>(
        `SELECT COUNT(*) AS total_procesos,
                COUNT(*) FILTER (WHERE ${seaceKeywordConditions}) AS procesos_prevencion
         FROM procurement_processes
         WHERE departamento = $1`,
        [departamento, ...KEYWORDS_PREVENCION.map((k) => `%${k}%`)]
      );
      seace = {
        totalProcesos: Number(seaceRows[0]?.total_procesos ?? 0),
        procesosPrevencionPorTitulo: Number(seaceRows[0]?.procesos_prevencion ?? 0),
      };
    } catch (err) {
      console.error("No se pudo cruzar contra compras-publicas (enriquecimiento opcional):", err instanceof Error ? err.message : err);
      seaceEstado = "NO_DISPONIBLE";
    }
  }

  try {
    const keywordConditions = KEYWORDS_PREVENCION.map((_, i) => `nombre ILIKE $${i + 2}`).join(" OR ");
    const { rows: investmentRows } = await inversionesPool.query<InvestmentRow>(
      `SELECT cui, distrito, nombre, estado, monto_viable, costo_actualizado
       FROM investments
       WHERE departamento = $1 AND (${keywordConditions})`,
      [departamento, ...KEYWORDS_PREVENCION.map((k) => `%${k}%`)]
    );

    let obrasPorCui = new Map<string, { obras: number; obrasParalizadas: number; avanceFisicoRealPromedio: number | null }>();
    if (infobrasPool && investmentRows.length > 0) {
      try {
        const cuis = investmentRows.map((r) => r.cui);
        const { rows: obraRows } = await infobrasPool.query<ObraRow>(
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
        infobrasEstado = "NO_DISPONIBLE";
      }
    }

    proyectosPorDistrito = new Map();
    for (const r of investmentRows) {
      const obra = obrasPorCui.get(r.cui);
      const infobrasConfiable = infobrasEstado === "OK";
      const proyecto: ProyectoPrevencion = {
        cui: r.cui,
        distrito: r.distrito,
        nombre: r.nombre,
        estado: r.estado,
        montoViable: r.monto_viable === null ? null : Number(r.monto_viable),
        costoActualizado: r.costo_actualizado === null ? null : Number(r.costo_actualizado),
        obrasInfobras: infobrasConfiable ? obra?.obras ?? 0 : null,
        obrasParalizadas: infobrasConfiable ? obra?.obrasParalizadas ?? 0 : null,
        avanceFisicoRealPromedio: infobrasConfiable ? obra?.avanceFisicoRealPromedio ?? null : null,
      };
      if (!r.distrito) {
        proyectosSinDistritoAsignado.push(proyecto);
        continue;
      }
      if (r.distrito === DISTRITO_SENTINEL_MULTIDISTRITO) {
        proyectosSinDistritoAsignado.push(proyecto);
        continue;
      }
      if (!proyectosPorDistrito.has(r.distrito)) proyectosPorDistrito.set(r.distrito, []);
      proyectosPorDistrito.get(r.distrito)!.push(proyecto);
    }
  } catch (err) {
    console.error("No se pudo cruzar contra radar-inversiones (enriquecimiento opcional):", err instanceof Error ? err.message : err);
    return { status: 200, body: { estado: "ENRIQUECIMIENTO_NO_DISPONIBLE", departamento, distritos: [] } };
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

  return {
    status: 200,
    body: {
      departamento,
      peligrosConsultados: peligros,
      matcherTerritorial: "territorial_texto_distrito",
      matcherProyectos: "nombre_keyword",
      matcherSeace: "titulo_keyword",
      exhaustivo: false,
      infobrasEstado,
      seaceEstado,
      seace,
      restriccion:
        "Coincidencia territorial (mismo nombre de distrito) y de texto libre en el nombre del proyecto de inversión -- no implica causalidad. La ausencia de proyectos en un distrito significa que el filtro por nombre no detectó ninguno, no que el distrito no tenga proyectos de prevención reales (el filtro puede tener falsos negativos). El cruce SEACE (`seace`) es agregado departamental sobre `procurement_processes.titulo`, misma limitación de texto libre no exhaustivo, y solo cubre la ventana de datos ingerida (no la historia completa de contrataciones). Requiere revisión humana, mismo estándar que el resto del catálogo.",
      totalDistritos: distritos.length,
      distritos,
      proyectosSinDistritoAsignado,
    },
  };
}
