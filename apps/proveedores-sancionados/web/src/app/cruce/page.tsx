import { CrossrefTable } from "@/components/CrossrefTable";
import { getCrossref } from "@/lib/api";

export const dynamic = "force-dynamic";

const DEFAULT_DEPARTAMENTO = "LA LIBERTAD";

interface PageProps {
  searchParams: Promise<{ departamento?: string }>;
}

export default async function CrucePage({ searchParams }: PageProps) {
  const resolvedSearchParams = await searchParams;
  const departamento = resolvedSearchParams.departamento ?? DEFAULT_DEPARTAMENTO;
  const { resultados } = await getCrossref(departamento);

  const vigentes = resultados.filter((r) => r.tieneInhabilitacionVigente).length;
  const historicas = resultados.filter((r) => !r.tieneInhabilitacionVigente && r.inhabilitacionesEncontradas > 0).length;

  return (
    <main>
      <p className="eyebrow">Follow the Sol · Cruce con compras públicas</p>
      <h1>Adjudicaciones × sanciones del Tribunal</h1>
      <p className="lede">
        Cruce por RUC exacto entre adjudicaciones reales de compras-publicas y el registro de
        sanciones del Tribunal de Contrataciones. &quot;Vigente hoy&quot; no significa que la
        inhabilitación estuviera activa al momento de la adjudicación — verifica las fechas antes
        de asumir una violación en curso.
      </p>

      <div className="stat-row">
        <div className="stat-card">
          <div className="stat-label">Adjudicaciones cruzadas</div>
          <div className="stat-value">{resultados.length}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Con inhabilitación vigente hoy</div>
          <div className="stat-value">{vigentes}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Con sanción histórica (no vigente)</div>
          <div className="stat-value">{historicas}</div>
        </div>
      </div>

      <CrossrefTable rows={resultados} />

      <p className="source-footnote">
        Fuentes: RNP/OECE (Tribunal de Contrataciones), OSCE/OCDS (compras-publicas), SUNAT
        (identidad-fiscal). Ver <code>docs/data-contracts/proveedores-sancionados.md</code>.
      </p>
    </main>
  );
}
