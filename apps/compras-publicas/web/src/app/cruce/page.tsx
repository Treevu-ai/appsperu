import { CrossrefTable } from "@/components/CrossrefTable";
import { getCrossref, type Confidence } from "@/lib/api";

interface PageProps {
  searchParams: Promise<{ confidence?: Confidence }>;
}

export default async function CrucePage({ searchParams }: PageProps) {
  const resolvedSearchParams = await searchParams;
  const { resultados } = await getCrossref(resolvedSearchParams.confidence);
  const totalDevengado = resultados.reduce((sum, r) => sum + r.devengado, 0);
  const totalCompras = resultados.reduce((sum, r) => sum + r.comprasValorTotal, 0);
  const confirmadas = resultados.filter((r) => r.confidence === "confirmada").length;
  const candidatas = resultados.filter((r) => r.confidence === "candidata").length;

  return (
    <main>
      <p className="eyebrow">Follow the Sol · Cruce de fuentes</p>
      <h1>Presupuesto × Compras públicas</h1>
      <p className="lede">
        Cruce por nombre de entidad entre el presupuesto (MEF) y las compras públicas
        (OECE) — no existe un ID compartido entre ambas fuentes, así que cada fila trae
        su nivel de confianza. &quot;Confirmada&quot; es igualdad exacta de nombre tras
        normalizar; &quot;candidata&quot; es similitud parcial y debería revisarse antes
        de usarse para una conclusión.
      </p>

      <div className="stat-row">
        <div className="stat-card">
          <div className="stat-label">Entidades cruzadas</div>
          <div className="stat-value">{resultados.length}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Confirmadas / candidatas</div>
          <div className="stat-value">
            {confirmadas} / {candidatas}
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Devengado total</div>
          <div className="stat-value">S/ {(totalDevengado / 1_000_000).toFixed(1)}M</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Compras total</div>
          <div className="stat-value">S/ {(totalCompras / 1_000_000).toFixed(1)}M</div>
        </div>
      </div>

      <form className="filters" method="get">
        <select name="confidence" defaultValue={resolvedSearchParams.confidence ?? ""}>
          <option value="">Todas</option>
          <option value="confirmada">Solo confirmadas</option>
          <option value="candidata">Solo candidatas</option>
        </select>
        <button type="submit">Filtrar</button>
      </form>

      <CrossrefTable rows={resultados} />
    </main>
  );
}
