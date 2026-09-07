import type { AppKey } from "./apps.js";
import type { ToolSpec } from "./catalog.js";

export interface ToolSearchResult {
  name: string;
  app: AppKey;
  description: string;
  pathParams: string[];
  queryParams: string[];
}

const DEFAULT_LIMIT = 20;

function toResult(tool: ToolSpec): ToolSearchResult {
  return {
    name: tool.name,
    app: tool.app,
    description: tool.description,
    pathParams: tool.pathParams,
    queryParams: Object.keys(tool.querySchema),
  };
}

/**
 * Filtro por palabras clave sobre nombre+app+descripción — no hay ranking semántico ni
 * embeddings. El catálogo real (142 tools) es lo bastante chico para que un match literal
 * alcance; migrar a algo más sofisticado solo si esto deja de ser suficiente en la práctica.
 * `query` vacío + `app` sirve para listar todos los tools de una app sin filtrar por texto.
 */
export function searchTools(catalog: ToolSpec[], query: string, app?: AppKey, limit: number = DEFAULT_LIMIT): ToolSearchResult[] {
  const scoped = app ? catalog.filter((tool) => tool.app === app) : catalog;
  const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);

  const matches =
    words.length === 0
      ? scoped
      : scoped.filter((tool) => {
          const haystack = `${tool.name} ${tool.app} ${tool.description}`.toLowerCase();
          return words.every((word) => haystack.includes(word));
        });

  return matches.slice(0, limit).map(toResult);
}
