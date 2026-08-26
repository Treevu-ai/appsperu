import { pathToFileURL } from "node:url";
import { GeoserverClient } from "../ingest/geoserver-client.js";

/** Nombres documentados en PRD v1 vs nombres reales en GetCapabilities (2026-08-26). */
export const SPIKE_LAYER_SPECS = [
  {
    documentedName: "cb_redhidrica",
    candidates: ["geoceplan:cb_redhidricax", "geoceplan:cb_redhidricaprinx"],
    purpose: "Red hídrica — contexto riego/agro",
  },
  {
    documentedName: "cb_proyectos",
    candidates: [
      "geoceplan:ip_pryedux",
      "geoceplan:ip_pryturx",
      "geoceplan:ip_prysecagr",
      "geoceplan:ap_proyecminerox",
    ],
    purpose: "Proyectos de inversión sectorial CEPLAN (no existe capa única cb_proyectos)",
  },
] as const;

export type LayerSpikeResult = {
  documentedName: string;
  layerName: string;
  ok: boolean;
  numberMatched: number | null;
  firstPage500Count: number | null;
  firstPage500Ms: number | null;
  geometryType: string | null;
  sampleProperties: string[];
  purpose: string;
  error?: string;
  decision: "AUTOMATIZABLE" | "MVP_ACOTADO" | "POSPONER";
  estimatedPagesAt500: number | null;
};

export function recommendDecision(result: Pick<LayerSpikeResult, "ok" | "numberMatched">): LayerSpikeResult["decision"] {
  if (!result.ok || result.numberMatched === null) return "POSPONER";
  if (result.numberMatched <= 50_000) return "AUTOMATIZABLE";
  if (result.numberMatched <= 200_000) return "MVP_ACOTADO";
  return "POSPONER";
}

export async function probeLayer(
  client: GeoserverClient,
  spec: (typeof SPIKE_LAYER_SPECS)[number]
): Promise<LayerSpikeResult[]> {
  const results: LayerSpikeResult[] = [];

  for (const layerName of spec.candidates) {
    const base: LayerSpikeResult = {
      documentedName: spec.documentedName,
      layerName,
      ok: false,
      numberMatched: null,
      firstPage500Count: null,
      firstPage500Ms: null,
      geometryType: null,
      sampleProperties: [],
      purpose: spec.purpose,
      decision: "POSPONER",
      estimatedPagesAt500: null,
    };

    try {
      const samplePage = await client.fetchFeaturePage(layerName, 0, 1);
      const sample = samplePage.features[0];
      base.ok = true;
      base.numberMatched = samplePage.numberMatched ?? samplePage.totalFeatures ?? null;
      base.geometryType = sample?.geometry?.type ?? null;
      base.sampleProperties = Object.keys(sample?.properties ?? {});

      const t0 = Date.now();
      const firstPage = await client.fetchFeaturePage(layerName, 0, 500);
      base.firstPage500Count = firstPage.features.length;
      base.firstPage500Ms = Date.now() - t0;
      if (base.numberMatched === null) {
        base.numberMatched = firstPage.numberMatched ?? firstPage.totalFeatures ?? null;
      }
      base.decision = recommendDecision(base);
      base.estimatedPagesAt500 = base.numberMatched ? Math.ceil(base.numberMatched / 500) : null;
    } catch (error) {
      base.error = error instanceof Error ? error.message : String(error);
      base.decision = "POSPONER";
    }

    results.push(base);
  }

  return results;
}

export async function spikeLayers(client = new GeoserverClient()): Promise<LayerSpikeResult[]> {
  const results: LayerSpikeResult[] = [];
  for (const spec of SPIKE_LAYER_SPECS) {
    results.push(...(await probeLayer(client, spec)));
  }
  return results;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  spikeLayers()
    .then((layers) => {
      console.log(
        JSON.stringify(
          {
            generatedAt: new Date().toISOString(),
            layers,
            summary: {
              automatable: layers.filter((row) => row.decision === "AUTOMATIZABLE").map((row) => row.layerName),
              posponer: layers.filter((row) => row.decision === "POSPONER").map((row) => row.layerName),
            },
          },
          null,
          2
        )
      );
    })
    .catch((err) => {
      console.error("Spike falló:", err);
      process.exit(1);
    });
}
