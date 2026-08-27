export interface ProbeTarget {
  id: string;
  url: string;
  reachable: boolean;
  httpStatus: number | null;
  contentType: string | null;
  bodyBytes: number;
  notes: string[];
}

export interface AplicativoProbeResult {
  checkedAt: string;
  perEntityAvailable: false;
  conclusion: string;
  targets: ProbeTarget[];
}

const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36";

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
 * Verifica en vivo si existe una vía pública per-entidad (PEI/POI por pliego).
 * Hoy solo ObservaPerú aporta datos agregados por nivel de gobierno; las tablas
 * per-entidad del schema siguen vacías hasta que Aplicativo CEPLAN V.01 exponga
 * un endpoint programático estable.
 */
export async function probeAplicativoCeplan(): Promise<AplicativoProbeResult> {
  const observaJson =
    "https://observaperu.ceplan.gob.pe/assets/data/seguimiento-estrategico/indicadores_priorizados_gestion_estrategica_estado.json";

  const targets = await Promise.all([
    probeUrl("aplicativo", "https://aplicativo.ceplan.gob.pe/", [
      "Aplicativo CEPLAN V.01 — única vía conocida para PEI/POI per-pliego.",
    ]),
    probeUrl("pulso", "https://pulso.sinaplan.gob.pe/", [
      "Dashboard Pulso SINAPLAN — sin API documentada; depende del aplicativo.",
    ]),
    probeUrl("observaperu-json", observaJson, [
      "Fuente actual ingerida — agregado por nivel de gobierno, no per-entidad.",
    ]),
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
    perEntityAvailable: false,
    conclusion,
    targets,
  };
}
