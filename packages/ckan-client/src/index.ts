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
