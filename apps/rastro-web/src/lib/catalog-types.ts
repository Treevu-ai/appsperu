/**
 * Tipos del catálogo de datos abiertos (`/catalogo`), generado por
 * `tools/ckan-indexer/` (indexer + `make_curated.py`) y embebido como JSON
 * estático en `src/data/`. No viene de una de las 14 APIs de appsperu — es
 * un snapshot indexado en el momento del build, no en vivo.
 */

export interface CatalogResource {
  id: string;
  url: string;
  format: string;
  size_kb: number | null;
  description: string;
}

export interface CatalogOrganization {
  id: string | null;
  name: string | null;
  title: string;
}

export interface CatalogDataset {
  name: string;
  title: string;
  notes: string;
  organization: CatalogOrganization | null;
  tags: string[];
  resources: CatalogResource[];
  url: string | null;
  modified: string | null;
  num_resources: number;
}

export interface CatalogCurated {
  generated_at: string;
  count: number;
  datasets: CatalogDataset[];
}

export interface CatalogTopEntry {
  title: string;
  count: number;
}

export interface CatalogFormatEntry {
  format: string;
  count: number;
}

export interface CatalogSummary {
  generated_at: string;
  ckan_base: string;
  total_datasets: number;
  resources_checked: number;
  live_pct: number;
  dead_count: number;
  top_orgs: CatalogTopEntry[];
  top_formats: CatalogFormatEntry[];
}

/**
 * Fuente y cobertura declaradas para todo número de esta página — el
 * indexer cubre 999 de los ~5,000 datasets que el propio README de
 * `tools/ckan-indexer/` estima publicados por el Estado, así que es
 * `PARCIAL` por diseño, no un error de cobertura.
 */
export const CATALOG_FUENTE = "tools/ckan-indexer (PNDA/CKAN, datosabiertos.gob.pe)";
export const CATALOG_COBERTURA = "PARCIAL" as const;
