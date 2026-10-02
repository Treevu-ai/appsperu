// DatasetCard — una tarjeta por dataset del catálogo

import type { CatalogDataset } from "../../lib/catalog-types.js";

export function DatasetCard({ ds }: { ds: CatalogDataset }) {
  const orgTitle = ds.organization?.title || "Sin organización";
  const formats = Array.from(new Set(ds.resources.map((r) => r.format).filter(Boolean)));
  const firstRes = ds.resources[0];
  const rastroRelated = isRastroRelevant(ds);
  const hasData = formats.length > 0;

  return (
    <article className="card relative">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="text-xs text-muted font-mono">{orgTitle}</p>
            {rastroRelated && (
              <span
                className="text-[10px] px-1.5 py-0.5 rounded bg-accent/15 text-accent border border-accent/30"
                title="Relevante para inversión pública"
              >
                RASTRO
              </span>
            )}
          </div>
          <h3 className="text-fg font-semibold mt-1 leading-snug">
            {ds.url ? (
              <a
                href={ds.url}
                target="_blank"
                rel="noopener"
                className="hover:text-accent underline-offset-2 hover:underline"
              >
                {ds.title}
              </a>
            ) : (
              ds.title
            )}
          </h3>
        </div>
      </div>

      {ds.notes && (
        <p className="text-sm text-fg-soft mt-2 line-clamp-2">{ds.notes}</p>
      )}

      <div className="flex flex-wrap items-center gap-2 mt-3 text-[11px] font-mono text-muted">
        <span className="px-1.5 py-0.5 rounded border border-line">
          {ds.num_resources} recurso{ds.num_resources === 1 ? "" : "s"}
        </span>
        {formats.slice(0, 4).map((f) => (
          <span key={f} className="px-1.5 py-0.5 rounded border border-line">
            {f}
          </span>
        ))}
        {ds.modified && (
          <span className="text-muted-soft">
            · act. {formatDate(ds.modified)}
          </span>
        )}
        {hasData && firstRes && (
          <a
            href={firstRes.url}
            target="_blank"
            rel="noopener"
            className="ml-auto text-accent hover:underline"
          >
            ↓ recurso principal
          </a>
        )}
      </div>
    </article>
  );
}

function isRastroRelevant(ds: CatalogDataset): boolean {
  const orgName = (ds.organization?.name || ds.organization?.title || "").toLowerCase();
  const tags = ds.tags.map((t) => t.toLowerCase());
  const rastroOrgs = [
    "economia", "contralor", "invierte", "ceplan", "osce", "sunat",
    "bcrp", "mef", "inversion", "compras", "proveedor",
  ];
  if (rastroOrgs.some((k) => orgName.includes(k))) return true;
  if (tags.some((t) => rastroOrgs.some((k) => t.includes(k)))) return true;
  return false;
}

function formatDate(s: string): string {
  // DKAN dates look like "Vie, 06/12/2026 - 10:22" or ISO.
  const d = new Date(s);
  if (!isNaN(d.getTime())) {
    return d.toLocaleDateString("es-PE", { year: "numeric", month: "short" });
  }
  // Best-effort: grab first 4-digit year
  const m = s.match(/(\d{4})/);
  return m ? m[1] : s.slice(0, 10);
}
