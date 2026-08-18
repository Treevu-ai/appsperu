import { CrossrefTable } from "@/components/CrossrefTable";
import { getCrossref } from "@/lib/api";

const DEFAULT_DEPARTAMENTO = "LA LIBERTAD";

interface PageProps {
  searchParams: Promise<{ departamento?: string }>;
}

export default async function CrucePage({ searchParams }: PageProps) {
  const resolvedSearchParams = await searchParams;
  const departamento = resolvedSearchParams.departamento ?? DEFAULT_DEPARTAMENTO;
  const { resultados } = await getCrossref(departamento);

  const conMatch = resultados.filter((r) => r.enPresupuesto).length;
  const totalMontoViable = resultados.reduce((sum, r) => sum + r.montoViableTotal, 0);
  const totalDevengado = resultados.reduce((sum, r) => sum + r.devengado, 0);

  return (
    <main>
      <p className="eyebrow">Follow the Sol · Cruce de fuentes</p>
      <h1>Inversiones × Presupuesto</h1>
      <p className="lede">
        Cruce por <strong>SEC_EJEC</strong> — a diferencia del cruce de compras públicas, acá
        hay una clave exacta compartida entre Invierte.pe y el presupuesto del MEF, así que no
        hace falta matching difuso: cada fila con match es 100% exacta por ID.
      </p>

      <div className="stat-row">
        <div className="stat-card">
          <div className="stat-label">Entidades cruzadas</div>
          <div className="stat-value">{resultados.length}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Con match en presupuesto</div>
          <div className="stat-value">{conMatch}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Monto viable total</div>
          <div className="stat-value">S/ {(totalMontoViable / 1_000_000).toFixed(0)}M</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Devengado total</div>
          <div className="stat-value">S/ {(totalDevengado / 1_000_000).toFixed(0)}M</div>
        </div>
      </div>

      <CrossrefTable rows={resultados} />
    </main>
  );
}
