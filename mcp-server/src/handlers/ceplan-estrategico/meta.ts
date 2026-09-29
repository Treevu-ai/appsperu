import type { NeonRow } from "../../db/neon-pool.js";
import type { ToolHandlerContext, HandlerResult } from "../registry.js";

export interface ProbeTarget {
  id: string;
  url: string;
  reachable: boolean;
  httpStatus: number | null;
  contentType: string | null;
  bodyBytes: number;
  notes: string[];
}

const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36";

/**
 * Copiado de `apps/ceplan-estrategico/api/src/lib/aplicativo-probe.ts::probeUrl`.
 * Sondea en vivo una URL externa (no una base Neon) — se mantiene igual que
 * el origen porque es lo que el endpoint reporta.
 */
async function probeUrl(id: string, url: string, notes: string[] = []): Promise<ProbeTarget> {
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": USER_AGENT, Accept: "text/html,application/json,*/*" },
      redirect: "follow",
      signal: AbortSignal.timeout(15_000),
    });
    const body = await res.text();
    return {
      id,
      url,
      reachable: res.ok,
      httpStatus: res.status,
      contentType: res.headers.get("content-type"),
      bodyBytes: body.length,
      notes,
    };
  } catch (error) {
    return {
      id,
      url,
      reachable: false,
      httpStatus: null,
      contentType: null,
      bodyBytes: 0,
      notes: [...notes, error instanceof Error ? error.message : String(error)],
    };
  }
}

/**
 * Copiado de `apps/ceplan-estrategico/api/src/lib/aplicativo-probe.ts::probeAplicativoCeplan`.
 */
async function probeAplicativoCeplan() {
  const observaJson =
    "https://observaperu.ceplan.gob.pe/assets/data/seguimiento-estrategico/indicadores_priorizados_gestion_estrategica_estado.json";

  const targets = await Promise.all([
    probeUrl("aplicativo", "https://aplicativo.ceplan.gob.pe/", ["Aplicativo CEPLAN V.01 — única vía conocida para PEI/POI per-pliego."]),
    probeUrl("pulso", "https://pulso.sinaplan.gob.pe/", ["Dashboard Pulso SINAPLAN — sin API documentada; depende del aplicativo."]),
    probeUrl("observaperu-json", observaJson, ["Fuente actual ingerida — agregado por nivel de gobierno, no per-entidad."]),
  ]);

  const aplicativo = targets.find((t) => t.id === "aplicativo");
  const observa = targets.find((t) => t.id === "observaperu-json");

  let conclusion =
    "Sin API per-entidad pública confirmada. ObservaPerú sigue siendo la única fuente ingerible (agregados GN/GR/MP/MD).";
  if (aplicativo?.reachable && aplicativo.bodyBytes < 512) {
    conclusion +=
      " aplicativo.ceplan.gob.pe responde HTTP pero sin contenido útil (probable SPA vacía o bloqueada) — reverse engineering pendiente.";
  } else if (!aplicativo?.reachable) {
    conclusion += " aplicativo.ceplan.gob.pe no alcanzable desde este entorno.";
  }
  if (observa?.reachable && observa.contentType?.includes("json")) {
    conclusion += " ObservaPerú JSON accesible.";
  }

  return {
    checkedAt: new Date().toISOString(),
    perEntityAvailable: false as const,
    conclusion,
    targets,
  };
}

/**
 * Handler para `ceplan_estrategico_meta_aplicativo` — GET /api/meta/aplicativo.
 * Idéntico a `apps/ceplan-estrategico/api/src/routes/meta.ts`.
 */
export async function aplicativo(ctx: ToolHandlerContext): Promise<HandlerResult> {
  const { db } = ctx;
  const probe = await probeAplicativoCeplan();
  const [indicators, objectives, actions, poiActivities, physicalTargets] = await Promise.all([
    db.query<NeonRow & { count: string }>(`SELECT COUNT(*)::text AS count FROM strategic_indicators`),
    db.query<NeonRow & { count: string }>(`SELECT COUNT(*)::text AS count FROM strategic_objectives`),
    db.query<NeonRow & { count: string }>(`SELECT COUNT(*)::text AS count FROM strategic_actions`),
    db.query<NeonRow & { count: string }>(`SELECT COUNT(*)::text AS count FROM poi_activities`),
    db.query<NeonRow & { count: string }>(`SELECT COUNT(*)::text AS count FROM physical_targets`),
  ]);

  return {
    status: 200,
    body: {
      ...probe,
      tablas: {
        strategic_indicators: Number(indicators.rows[0]?.count ?? 0),
        strategic_objectives: Number(objectives.rows[0]?.count ?? 0),
        strategic_actions: Number(actions.rows[0]?.count ?? 0),
        poi_activities: Number(poiActivities.rows[0]?.count ?? 0),
        physical_targets: Number(physicalTargets.rows[0]?.count ?? 0),
      },
    },
  };
}
