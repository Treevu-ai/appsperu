import { describe, expect, it } from "vitest";
import { TOOL_CATALOG } from "../catalog.js";
import { APP_KEYS } from "../apps.js";

describe("MCP catalog", () => {
  it("registers ceplan-geo tools for every public GET /api route", () => {
    const ceplanGeoTools = TOOL_CATALOG.filter((tool) => tool.app === "ceplan-geo");
    expect(ceplanGeoTools).toHaveLength(11);
    expect(ceplanGeoTools.map((tool) => tool.name).sort()).toEqual(
      [
        "ceplan_geo_crossref_ejecucion",
        "ceplan_geo_crossref_inversiones",
        "ceplan_geo_crossref_obras",
        "ceplan_geo_infrastructure",
        "ceplan_geo_infrastructure_near",
        "ceplan_geo_layer_by_id",
        "ceplan_geo_layer_features",
        "ceplan_geo_layers",
        "ceplan_geo_territories",
        "ceplan_geo_territories_bbox",
        "ceplan_geo_territories_summary",
      ].sort()
    );
  });

  it("includes ceplan-geo in app keys with default port 4005", () => {
    expect(APP_KEYS).toContain("ceplan-geo");
  });
});
