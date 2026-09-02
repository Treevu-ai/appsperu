// /catalogo — Catálogo de datos abiertos del Estado peruano
// Indexado desde la Plataforma Nacional de Datos Abiertos (PNDA).
// StatsPanel + MinisterioFilter + DatasetList con búsqueda.

import summaryRaw from "../data/catalog-summary.json";
import curatedRaw from "../data/catalog-curated.json";
import { CatalogoHero } from "../components/catalog/CatalogoHero.js";
import { StatsPanel } from "../components/catalog/StatsPanel.js";
import { DatasetList } from "../components/catalog/DatasetList.js";
import { NumberWithMetadata, metaNumber } from "../components/NumberWithMetadata.js";
import { CATALOG_COBERTURA, CATALOG_FUENTE, type CatalogCurated, type CatalogSummary } from "../lib/catalog-types.js";

export function Catalogo() {
  const stats = summaryRaw as CatalogSummary;
  const curated = curatedRaw as CatalogCurated;

  return (
    <div>
      <CatalogoHero totalDatasets={stats.total_datasets} generatedAt={stats.generated_at} livePct={stats.live_pct || 0} />
      <StatsPanel stats={stats} />

      <section className="relative max-w-5xl mx-auto px-6 pt-4 pb-2">
        <p className="text-xs font-mono text-accent uppercase tracking-[0.18em] mb-2">
          SELECCIÓN CURADA · {curated.count} datasets relevantes para Rastro
        </p>
        <p className="text-fg-soft text-sm max-w-3xl leading-relaxed">
          Estos son los datasets de ministerios y entidades que ya están en el radar de Rastro
          (inversión pública, contraloría, economía, planeamiento), de un catálogo indexado de{" "}
          <NumberWithMetadata data={metaNumber(stats.total_datasets, CATALOG_FUENTE, stats.generated_at, CATALOG_COBERTURA)} />{" "}
          datasets del Portal Nacional de Datos Abiertos.
        </p>
      </section>

      <DatasetList datasets={curated.datasets} />

      <section className="relative max-w-5xl mx-auto px-6 pb-16 text-xs text-muted-soft">
        <p>
          Catálogo generado desde{" "}
          <a
            className="text-fg-soft hover:text-accent underline-offset-2 hover:underline"
            href="https://www.datosabiertos.gob.pe"
            target="_blank"
            rel="noopener"
          >
            datosabiertos.gob.pe
          </a>{" "}
          (CKAN/DKAN) con{" "}
          <a
            className="text-fg-soft hover:text-accent underline-offset-2 hover:underline"
            href="https://github.com/Treevu-ai/appsperu/tree/master/tools/ckan-indexer"
            target="_blank"
            rel="noopener"
          >
            tools/ckan-indexer
          </a>
          . Este panel muestra una selección curada de {curated.count} datasets; el índice completo (
          <NumberWithMetadata data={metaNumber(stats.total_datasets, CATALOG_FUENTE, stats.generated_at, CATALOG_COBERTURA)} />{" "}
          datasets, JSON y CSV) vive en el repositorio bajo{" "}
          <code className="mono-num text-fg-soft">docs/inventario-fuentes/</code> y no se publica todavía como
          descarga directa desde este sitio. Cobertura y frecuencia de actualización declaradas por cada entidad
          pública; los íconos de estado (viva/muerta) son verificaciones HEAD del momento del índice y pueden variar.
        </p>
      </section>
    </div>
  );
}
