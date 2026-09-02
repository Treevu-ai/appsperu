// CatalogoHero — Lede de la página /catalogo

import { NumberWithMetadata, metaNumber } from "../NumberWithMetadata.js";
import { CATALOG_COBERTURA, CATALOG_FUENTE } from "../../lib/catalog-types.js";

export function CatalogoHero({
  totalDatasets,
  generatedAt,
  livePct,
}: {
  totalDatasets: number;
  generatedAt: string;
  livePct: number;
}) {
  return (
    <section className="relative max-w-5xl mx-auto px-6 pt-12 pb-8 md:pt-16 md:pb-12">
      <p className="text-xs font-mono text-accent uppercase tracking-[0.18em] mb-4">
        DESCUBRIMIENTO · CATÁLOGO NACIONAL
      </p>
      <h1 className="text-fg font-semibold text-2xl md:text-4xl leading-tight tracking-tight">
        <NumberWithMetadata data={metaNumber(totalDatasets, CATALOG_FUENTE, generatedAt, CATALOG_COBERTURA)} /> datasets
        abiertos del Estado peruano, en un solo lugar.
      </h1>
      <p className="mt-4 text-fg-soft leading-relaxed text-sm md:text-base max-w-3xl">
        Este catálogo indexa la{" "}
        <a className="text-accent hover:underline" href="https://www.datosabiertos.gob.pe" target="_blank" rel="noopener">
          Plataforma Nacional de Datos Abiertos
        </a>{" "}
        y la cruza con los ministerios y entidades que ya están en Rastro. Cada dataset lleva fuente, fecha de
        actualización y un indicador de accesibilidad (URL viva, muerta o con error de red).
      </p>
      <div className="mt-6 flex flex-wrap gap-3 text-xs font-mono text-muted">
        <span className="px-2 py-1 rounded border border-line">
          ●{" "}
          <NumberWithMetadata
            data={metaNumber(livePct, CATALOG_FUENTE, generatedAt, CATALOG_COBERTURA)}
            format={(n) => n.toFixed(0)}
            suffix="% URLs vivas"
          />
        </span>
        <span className="px-2 py-1 rounded border border-line">
          Índice generado {new Date(generatedAt).toLocaleDateString("es-PE", { year: "numeric", month: "short", day: "numeric" })}
        </span>
        <a
          className="px-2 py-1 rounded border border-line text-fg-soft hover:text-accent hover:border-accent/40 transition"
          href="https://www.datosabiertos.gob.pe"
          target="_blank"
          rel="noopener"
        >
          ↗ Fuente original (PNDA)
        </a>
      </div>
    </section>
  );
}
