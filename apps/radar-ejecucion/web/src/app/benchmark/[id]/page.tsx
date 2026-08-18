import { getBenchmark } from "@/lib/api";
import { formatPct } from "@/lib/format";
import { isBelowReviewThreshold } from "@/lib/signals";

interface PageProps {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ anio?: string }>;
}

export default async function BenchmarkPage({ params, searchParams }: PageProps) {
  const { id } = await params;
  const { anio } = await searchParams;
  const benchmark = await getBenchmark(id, anio);

  return (
    <main>
      <p className="eyebrow">Follow the Sol · Benchmark territorial</p>
      <h1>{id}</h1>
      <p className="lede">Comparación contra su cohorte: {benchmark.criterios}.</p>

      {benchmark.status === "datos_insuficientes" ? (
        <div className="insufficient-notice" data-testid="benchmark-insufficient">
          <span className="signal-chip neutral">Datos insuficientes</span>
          <p>
            La cohorte tiene {benchmark.n} entidad(es); se requieren al menos{" "}
            {benchmark.minRequerido} para publicar un comparativo confiable. No se muestra un
            número para no sugerir una precisión que los datos no respaldan.
          </p>
        </div>
      ) : (
        <>
          {isBelowReviewThreshold(benchmark.percentil) && (
            <p>
              <span className="signal-chip amber">Requiere revisión</span>
            </p>
          )}
          <dl className="benchmark-result" data-testid="benchmark-result">
            <div>
              <dt>Percentil de avance</dt>
              <dd>{benchmark.percentil}</dd>
            </div>
            <div>
              <dt>Mediana del grupo</dt>
              <dd>{formatPct(benchmark.medianaAvancePct)}</dd>
            </div>
            <div>
              <dt>Tamaño de la cohorte (n)</dt>
              <dd>{benchmark.n}</dd>
            </div>
          </dl>
          <p className="lede">{benchmark.exclusiones}</p>
        </>
      )}

      <footer className="source-footnote">Fecha de corte: {benchmark.fechaCorte}</footer>
    </main>
  );
}
