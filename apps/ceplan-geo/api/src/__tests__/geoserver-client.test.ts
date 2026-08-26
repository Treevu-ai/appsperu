import { describe, expect, it, vi } from "vitest";
import {
  buildWfsUrl,
  GeoserverClient,
  parseCapabilitiesLayers,
  sha256Hex,
} from "../ingest/geoserver-client.js";

describe("geoserver-client", () => {
  it("builds a WFS GetFeature URL with pagination", () => {
    const url = buildWfsUrl("https://geo.ceplan.gob.pe/geoserver/geoceplan", {
      service: "WFS",
      version: "2.0.0",
      request: "GetFeature",
      typeName: "geoceplan:cb_limdistx",
      outputFormat: "application/json",
      startIndex: 500,
      count: 500,
    });

    expect(url).toContain("typeName=geoceplan%3Acb_limdistx");
    expect(url).toContain("startIndex=500");
    expect(url).toContain("count=500");
  });

  it("parses layer names from GetCapabilities XML", () => {
    const xml = `
      <FeatureTypeList>
        <FeatureType>
          <Name>geoceplan:cb_limdistx</Name>
          <Title>cb_limdistx</Title>
        </FeatureType>
        <FeatureType>
          <Name>geoceplan:cn_aeropuertosx</Name>
          <Title>cn_aeropuertosx</Title>
        </FeatureType>
      </FeatureTypeList>
    `;

    const layers = parseCapabilitiesLayers(xml);
    expect(layers).toHaveLength(2);
    expect(layers[0].layerName).toBe("geoceplan:cb_limdistx");
    expect(layers[1].layerTitle).toBe("cn_aeropuertosx");
  });

  it("paginates features until a short page is returned", async () => {
    let call = 0;
    const fetchImpl = vi.fn(async () => {
      call += 1;
      const features =
        call === 1
          ? [{ type: "Feature", id: "a", geometry: { type: "Point", coordinates: [0, 0] }, properties: {} }]
          : [];
      return new Response(JSON.stringify({ type: "FeatureCollection", features }), { status: 200 });
    });

    const client = new GeoserverClient({
      baseUrl: "https://example.test/geoserver/geoceplan",
      pageSize: 500,
      rateLimitDelayMs: 0,
      fetchImpl,
    });

    const pages: number[] = [];
    for await (const { page } of client.fetchAllFeatures("geoceplan:cb_limdistx")) {
      pages.push(page.features.length);
    }

    expect(pages).toEqual([1]);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("computes stable checksums", () => {
    expect(sha256Hex("hola")).toBe(
      "b221d9dbb083a7f33428d7c2a3c3198ae925614d70210e28716ccaa7cd4ddb79"
    );
  });
});