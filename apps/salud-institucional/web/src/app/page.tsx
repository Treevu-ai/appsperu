import { ScoreTable } from "@/components/ScoreTable";
import { getScore } from "@/lib/api";

// Datos en vivo por request — esta app no tiene base propia, cruza 5 bases
// en cada llamada. Nunca pre-renderizar (mismo gotcha ya documentado en
// identidad-fiscal/web).
export const dynamic = "force-dynamic";

const DEFAULT_DEPARTAMENTO = "LA LIBERTAD";

interface PageProps {
  searchParams: Promise<{ departamento?: string }>;
}

export default async function SaludInstitucionalPage({ searchParams }: PageProps) {
  const resolvedSearchParams = await searchParams;
  const departamento = resolvedSearchParams.departamento ?? DEFAULT_DEPARTAMENTO;
  const { resultados, anioFiscal } = await getScore(departamento);

  const conScore = resultados.filter((r) => r.scoreCompuesto !== null);
  const promedio = conScore.length
    ? conScore.reduce((sum, r) => sum + (r.scoreCompuesto ?? 0), 0) / conScore.length
    : null;
  const conCincoFuentes = resultados.filter((r) => r.componentesUsados === 5).length;

  return (
    <main>
      <p className="eyebrow">Follow the Sol · Score de salud institucional</p>
      <h1>Salud institucional por entidad</h1>
      <p className="lede">
        Un solo índice que cruza 5 señales ya verificadas por separado en el resto del proyecto:
        ejecución presupuestal (radar-ejecucion), obras no paralizadas (infobras), inversiones sin
        sobrecosto (radar-inversiones), concentración de proveedores (compras-publicas) y salud
        tributaria de esos proveedores (identidad-fiscal). Año fiscal {anioFiscal}, {departamento}.
      </p>

      <div className="stat-row">
        <div className="stat-card">
          <div className="stat-label">Entidades</div>
          <div className="stat-value">{resultados.length}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Score promedio</div>
          <div className="stat-value">{promedio === null ? "—" : promedio.toFixed(1)}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Con las 5 fuentes</div>
          <div className="stat-value">{conCincoFuentes}</div>
        </div>
      </div>

      <ScoreTable rows={resultados} />

      <p className="source-footnote">
        Cada componente se omite del promedio si la fuente no tiene dato para esa entidad — nunca
        se imputa 0 ni 100 por ausencia. Un score con menos de 5 fuentes disponibles (columna
        &quot;# fuentes&quot;) es menos comparable que uno completo. Pesos iguales entre
        componentes, sin calibración empírica — ver{" "}
        <code>docs/data-contracts/salud-institucional-score.md</code> para el detalle completo y
        las limitaciones.
      </p>
    </main>
  );
}
