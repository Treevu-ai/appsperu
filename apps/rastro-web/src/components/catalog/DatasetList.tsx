// DatasetList — lista filtrable de datasets

import { useMemo, useState } from "react";
import { DatasetCard } from "./DatasetCard.js";
import { MinistryFilter } from "./MinistryFilter.js";
import type { CatalogDataset } from "../../lib/catalog-types.js";

/**
 * `catalog-curated.json` puede traer el mismo dataset (mismo `name`) más de
 * una vez — confirmado en vivo con "minsa-salud-mental", que aparece 2 veces
 * en el JSON generado por `tools/ckan-indexer/make_curated.py` (hallazgo
 * encontrado escribiendo el test de esta página, no reportado antes).
 * Deduplicar acá es defensivo — evita una key de React repetida y una
 * tarjeta mostrada dos veces — sin tener que tocar el pipeline de Python.
 */
function dedupeByName(datasets: CatalogDataset[]): CatalogDataset[] {
  const seen = new Set<string>();
  return datasets.filter((d) => {
    if (seen.has(d.name)) return false;
    seen.add(d.name);
    return true;
  });
}

export function DatasetList({ datasets: rawDatasets }: { datasets: CatalogDataset[] }) {
  const [selected, setSelected] = useState<string>("all");
  const [query, setQuery] = useState<string>("");
  const datasets = useMemo(() => dedupeByName(rawDatasets), [rawDatasets]);

  // Calcula opciones de filtro
  const orgOptions = useMemo(() => {
    const counts = new Map<string, { title: string; count: number }>();
    for (const d of datasets) {
      const org = d.organization;
      if (!org) continue;
      const key = (org.name || org.title || "sin-organizacion").toLowerCase();
      const title = org.title || org.name || "Sin organización";
      const prev = counts.get(key) || { title, count: 0 };
      counts.set(key, { title: prev.title, count: prev.count + 1 });
    }
    return Array.from(counts.entries())
      .map(([slug, v]) => ({ slug, title: v.title, count: v.count }))
      .sort((a, b) => b.count - a.count);
  }, [datasets]);

  // Filtra
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return datasets.filter((d) => {
      if (selected !== "all") {
        const orgKey = (d.organization?.name || d.organization?.title || "sin-organizacion").toLowerCase();
        if (orgKey !== selected) return false;
      }
      if (q) {
        const haystack = [
          d.title,
          d.notes,
          (d.organization?.title || ""),
          ...(d.tags || []),
        ].join(" ").toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return true;
    });
  }, [datasets, selected, query]);

  return (
    <section className="relative max-w-5xl mx-auto px-6 pb-16">
      <div className="flex flex-col gap-3 mb-5">
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Buscar por título, descripción, tag…"
          className="w-full px-3 py-2 rounded-md bg-ink-900 border border-line text-fg placeholder:text-muted text-sm focus:outline-none focus:border-accent/50"
        />
        <MinistryFilter options={orgOptions} selected={selected} onChange={setSelected} />
      </div>

      <p className="text-xs text-muted font-mono mb-3">
        {filtered.length} de {datasets.length} datasets
      </p>

      {filtered.length === 0 ? (
        <div className="card text-center py-12 text-muted-soft">
          Sin datasets que coincidan con el filtro.
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {filtered.map((d) => (
            <DatasetCard key={d.name} ds={d} />
          ))}
        </div>
      )}
    </section>
  );
}
