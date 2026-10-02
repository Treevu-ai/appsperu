// StatsPanel — métricas globales del catálogo

import { NumberWithMetadata, metaNumber } from "../NumberWithMetadata.js";
import { CATALOG_COBERTURA, CATALOG_FUENTE, type CatalogSummary } from "../../lib/catalog-types.js";

function pct(n: number) {
  return `${(n * 100).toFixed(0)}%`;
}

export function StatsPanel({ stats }: { stats: CatalogSummary }) {
  const orgs = (stats.top_orgs || []).slice(0, 8);
  const formats = (stats.top_formats || []).slice(0, 6);
  const maxOrg = Math.max(1, ...orgs.map((o) => o.count));
  const maxFmt = Math.max(1, ...formats.map((f) => f.count));
  const meta = (value: number) => metaNumber(value, CATALOG_FUENTE, stats.generated_at, CATALOG_COBERTURA);

  return (
    <section className="relative max-w-5xl mx-auto px-6 pb-10">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="card">
          <p className="text-xs text-muted font-mono">DATASETS</p>
          <p className="text-fg font-semibold text-2xl md:text-3xl mt-1">
            <NumberWithMetadata data={meta(stats.total_datasets)} />
          </p>
          <p className="text-xs text-muted-soft mt-1">en el catálogo PNDA</p>
        </div>
        <div className="card">
          <p className="text-xs text-muted font-mono">RECURSOS VERIFICADOS</p>
          <p className="text-fg font-semibold text-2xl md:text-3xl mt-1">
            <NumberWithMetadata data={meta(stats.resources_checked)} />
          </p>
          <p className="text-xs text-muted-soft mt-1">con HEAD request</p>
        </div>
        <div className="card">
          <p className="text-xs text-muted font-mono">URLS VIVAS</p>
          <p className="text-accent font-semibold text-2xl md:text-3xl mt-1">
            <NumberWithMetadata data={meta(stats.live_pct / 100)} format={pct} />
          </p>
          <p className="text-xs text-muted-soft mt-1">de los recursos</p>
        </div>
        <div className="card">
          <p className="text-xs text-muted font-mono">URLS MUERTAS</p>
          <p className="text-warn font-semibold text-2xl md:text-3xl mt-1">
            <NumberWithMetadata data={meta(stats.dead_count)} />
          </p>
          <p className="text-xs text-muted-soft mt-1">a descartar</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-3">
        <div className="card">
          <p className="text-xs text-muted font-mono mb-3">TOP ORGANIZACIONES</p>
          {orgs[0]?.title === "Sin clasificar" ? (
            <p className="text-xs text-muted-soft mb-2">
              El {pct(orgs[0].count / (stats.total_datasets || 1))} del catálogo no tiene ministerio clasificado
              automáticamente (sin prefijo de título ni tag reconocible) — ver{" "}
              <code className="mono-num">tools/ckan-indexer/make_curated.py</code>.
            </p>
          ) : null}
          <ul className="space-y-1.5">
            {orgs.map((o) => (
              <li key={o.title} className="text-sm">
                <div className="flex justify-between items-baseline gap-2">
                  <span className="text-fg-soft truncate" title={o.title}>
                    {o.title}
                  </span>
                  <span className="text-muted font-mono text-xs shrink-0">
                    <NumberWithMetadata data={meta(o.count)} />
                  </span>
                </div>
                <div className="h-1 bg-ink-800 rounded overflow-hidden mt-1">
                  <div className="h-full bg-accent/60" style={{ width: `${(o.count / maxOrg) * 100}%` }} />
                </div>
              </li>
            ))}
          </ul>
        </div>

        <div className="card">
          <p className="text-xs text-muted font-mono mb-3">FORMATOS</p>
          <ul className="space-y-1.5">
            {formats.map((f) => (
              <li key={f.format} className="text-sm">
                <div className="flex justify-between items-baseline gap-2">
                  <span className="text-fg-soft">{f.format || "?"}</span>
                  <span className="text-muted font-mono text-xs">
                    <NumberWithMetadata data={meta(f.count)} />
                  </span>
                </div>
                <div className="h-1 bg-ink-800 rounded overflow-hidden mt-1">
                  <div className="h-full bg-accent/40" style={{ width: `${(f.count / maxFmt) * 100}%` }} />
                </div>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}
