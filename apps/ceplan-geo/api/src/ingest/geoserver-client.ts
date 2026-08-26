import { createHash } from "node:crypto";

export type GeoJsonFeature = {
  type: "Feature";
  id?: string | number;
  geometry: { type: string; coordinates: unknown };
  properties: Record<string, unknown> | null;
};

export type GeoJsonFeatureCollection = {
  type: "FeatureCollection";
  features: GeoJsonFeature[];
  numberMatched?: number;
  numberReturned?: number;
  totalFeatures?: number;
};

export type WfsLayerSummary = {
  layerName: string;
  layerTitle: string | null;
  geometryType: string | null;
};

export type GeoserverClientOptions = {
  baseUrl?: string;
  timeoutMs?: number;
  pageSize?: number;
  rateLimitDelayMs?: number;
  fetchImpl?: typeof fetch;
};

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function sha256Hex(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}

export function buildWfsUrl(
  baseUrl: string,
  params: Record<string, string | number | undefined>
): string {
  const url = new URL(`${baseUrl.replace(/\/$/, "")}/wfs`);
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined) url.searchParams.set(key, String(value));
  }
  return url.toString();
}

export function parseCapabilitiesLayers(xml: string): WfsLayerSummary[] {
  const layers: WfsLayerSummary[] = [];
  const featureTypeBlocks = xml.match(/<FeatureType[\s\S]*?<\/FeatureType>/g) ?? [];

  for (const block of featureTypeBlocks) {
    const name = block.match(/<Name>([^<]+)<\/Name>/)?.[1]?.trim();
    if (!name) continue;
    const title = block.match(/<Title>([^<]*)<\/Title>/)?.[1]?.trim() ?? null;
    const geometryType =
      block.match(/<wfs:DefaultCRS>[\s\S]*?<\/wfs:DefaultCRS>/)?.[0] ??
      block.match(/<ows:WGS84BoundingBox>/)?.[0]
        ? "Geometry"
        : null;
    layers.push({
      layerName: name,
      layerTitle: title,
      geometryType: geometryType ? "Geometry" : null,
    });
  }

  return layers;
}

export class GeoserverClient {
  private readonly baseUrl: string;
  private readonly timeoutMs: number;
  private readonly pageSize: number;
  private readonly rateLimitDelayMs: number;
  private readonly fetchImpl: typeof fetch;

  constructor(options: GeoserverClientOptions = {}) {
    this.baseUrl = options.baseUrl ?? process.env.GEOSERVER_BASE_URL ?? "https://geo.ceplan.gob.pe/geoserver/geoceplan";
    this.timeoutMs = options.timeoutMs ?? Number(process.env.GEOSERVER_REQUEST_TIMEOUT_MS ?? 60_000);
    this.pageSize = options.pageSize ?? Number(process.env.GEOSERVER_PAGE_SIZE ?? 500);
    this.rateLimitDelayMs = options.rateLimitDelayMs ?? Number(process.env.GEOSERVER_RATE_LIMIT_DELAY_MS ?? 300);
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  getCapabilitiesUrl(): string {
    return buildWfsUrl(this.baseUrl, {
      service: "WFS",
      version: "2.0.0",
      request: "GetCapabilities",
    });
  }

  getFeatureUrl(typeName: string, startIndex = 0, count = this.pageSize): string {
    return buildWfsUrl(this.baseUrl, {
      service: "WFS",
      version: "2.0.0",
      request: "GetFeature",
      typeName,
      outputFormat: "application/json",
      startIndex,
      count,
    });
  }

  async fetchText(url: string, attempt = 1): Promise<string> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const response = await this.fetchImpl(url, { signal: controller.signal });
      if (!response.ok) {
        if (response.status >= 500 && attempt < 4) {
          await sleep(this.rateLimitDelayMs * attempt);
          return this.fetchText(url, attempt + 1);
        }
        throw new Error(`WFS respondió ${response.status} para ${url}`);
      }
      return await response.text();
    } finally {
      clearTimeout(timer);
    }
  }

  async fetchCapabilities(): Promise<{ xml: string; layers: WfsLayerSummary[] }> {
    const xml = await this.fetchText(this.getCapabilitiesUrl());
    return { xml, layers: parseCapabilitiesLayers(xml) };
  }

  async fetchFeaturePage(typeName: string, startIndex = 0, count = this.pageSize): Promise<GeoJsonFeatureCollection> {
    const url = this.getFeatureUrl(typeName, startIndex, count);
    const body = await this.fetchText(url);
    const parsed = JSON.parse(body) as GeoJsonFeatureCollection;
    if (parsed.type !== "FeatureCollection" || !Array.isArray(parsed.features)) {
      throw new Error(`Respuesta GeoJSON inválida para ${typeName}`);
    }
    if (this.rateLimitDelayMs > 0) await sleep(this.rateLimitDelayMs);
    return parsed;
  }

  async *fetchAllFeatures(typeName: string): AsyncGenerator<{ page: GeoJsonFeatureCollection; url: string; startIndex: number }> {
    let startIndex = 0;
    while (true) {
      const url = this.getFeatureUrl(typeName, startIndex, this.pageSize);
      const page = await this.fetchFeaturePage(typeName, startIndex, this.pageSize);
      yield { page, url, startIndex };
      if (page.features.length === 0 || page.features.length < this.pageSize) break;
      startIndex += this.pageSize;
    }
  }
}
