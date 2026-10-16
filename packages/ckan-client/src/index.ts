/**
 * Resolución de recursos de un dataset CKAN/DKAN (`datosabiertos.gob.pe`) vía
 * `package_show`. Consolidado de dos copias casi idénticas (~30 líneas cada
 * una, solo el nombre del dataset y el mensaje de error diferían) que
 * existían en `apps/servicios-salud/api/src/ingest/renipress-connector.ts` y
 * `apps/programas-sociales/api/src/ingest/infomidis-connector.ts` —
 * introducidas por el mismo PR que las agregó (#79), no un patrón heredado.
 *
 * Deliberadamente NO incluye la lógica de "elegir el recurso más reciente":
 * cada dataset resuelve eso de forma distinta (RENIPRESS por fecha en el
 * nombre del archivo, INFOMIDIS por el timestamp `created` de CKAN) — esa
 * parte sigue viviendo en el `*-parse.ts` de cada app, sin forzar una
 * abstracción común donde el comportamiento real difiere.
 */

export interface CkanResource {
  id: string;
  name: string;
  format: string;
  url: string;
  created?: string;
  last_modified?: string;
}

interface CkanPackageShowResult {
  resources?: CkanResource[];
}

interface CkanPackageShowResponse {
  success: boolean;
  result: CkanPackageShowResult | CkanPackageShowResult[];
}

export interface FetchCkanResourcesOptions {
  ckanBase: string;
  datasetSlug: string;
  userAgent: string;
}

/**
 * Requiere un `userAgent` explícito de navegador — confirmado en vivo
 * (ADR-0018/ADR-0021) que el WAF (CloudWAF) de `datosabiertos.gob.pe`
 * devuelve HTTP 418 al user-agent por defecto de `fetch`.
 */
export async function fetchCkanResources(options: FetchCkanResourcesOptions): Promise<CkanResource[]> {
  const { ckanBase, datasetSlug, userAgent } = options;
  const url = `${ckanBase}/api/3/action/package_show?id=${encodeURIComponent(datasetSlug)}`;
  const res = await fetch(url, { headers: { "User-Agent": userAgent, Accept: "application/json" } });
  if (!res.ok) {
    throw new Error(`CKAN package_show devolvió ${res.status} para el dataset "${datasetSlug}".`);
  }

  const data = (await res.json()) as CkanPackageShowResponse;
  if (!data.success) {
    throw new Error(`CKAN package_show no tuvo éxito para el dataset "${datasetSlug}".`);
  }

  const result = Array.isArray(data.result) ? data.result[0] : data.result;
  if (!result) {
    throw new Error(`CKAN package_show devolvió un resultado vacío para el dataset "${datasetSlug}".`);
  }

  return result.resources ?? [];
}

export interface CkanPackageSummary {
  id: string;
  name: string;
  title: string;
  organization?: string;
  notes?: string;
  metadata_modified?: string;
  resourceCount: number;
}

interface CkanPackageSearchHit {
  id?: string;
  name?: string;
  title?: string;
  notes?: string;
  metadata_modified?: string;
  organization?: { title?: string; name?: string } | null;
  resources?: unknown[];
}

interface CkanPackageSearchResponse {
  success: boolean;
  result?: { count?: number; results?: CkanPackageSearchHit[] };
}

export interface SearchCkanPackagesOptions {
  ckanBase: string;
  query: string;
  userAgent: string;
  rows?: number;
  start?: number;
  organization?: string;
}

export interface SearchCkanPackagesResult {
  count: number;
  packages: CkanPackageSummary[];
}

/**
 * Búsqueda de catálogo (`package_search`). Misma restricción de User-Agent
 * que `fetchCkanResources`: el WAF de datosabiertos.gob.pe responde 418 al
 * user-agent por defecto de `fetch`.
 */
export async function searchCkanPackages(options: SearchCkanPackagesOptions): Promise<SearchCkanPackagesResult> {
  const { ckanBase, query, userAgent, organization } = options;
  const rows = options.rows ?? 20;
  const start = options.start ?? 0;
  if (!Number.isInteger(rows) || rows < 1 || rows > 100) {
    throw new Error("rows debe ser un entero entre 1 y 100.");
  }
  if (!Number.isInteger(start) || start < 0) {
    throw new Error("start debe ser un entero >= 0.");
  }

  const params = new URLSearchParams({ q: query, rows: String(rows), start: String(start) });
  if (organization) params.set("fq", `organization:${organization}`);
  const url = `${ckanBase}/api/3/action/package_search?${params}`;
  const res = await fetch(url, { headers: { "User-Agent": userAgent, Accept: "application/json" } });
  if (!res.ok) {
    throw new Error(`CKAN package_search devolvió ${res.status} para la consulta "${query}".`);
  }

  const data = (await res.json()) as CkanPackageSearchResponse;
  if (!data.success || !data.result) {
    throw new Error(`CKAN package_search no tuvo éxito para la consulta "${query}".`);
  }

  const packages = (data.result.results ?? [])
    .filter((hit): hit is CkanPackageSearchHit & { id: string; name: string } => Boolean(hit.id && hit.name))
    .map((hit) => ({
      id: hit.id,
      name: hit.name,
      title: hit.title || hit.name,
      organization: hit.organization?.title ?? hit.organization?.name,
      notes: hit.notes,
      metadata_modified: hit.metadata_modified,
      resourceCount: hit.resources?.length ?? 0,
    }));

  return { count: data.result.count ?? packages.length, packages };
}
