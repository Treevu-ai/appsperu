import { PublicWorksTable } from "@/components/PublicWorksTable";
import { getPublicWorks, getPublicWorksResumen } from "@/lib/api";

const DEFAULT_DEPARTAMENTO = "LA LIBERTAD";

interface PageProps {
  searchParams: Promise<{ departamento?: string; estado?: string; conParalizacion?: string }>;
}

export default async function InfobrasPage({ searchParams }: PageProps) {
  const resolvedSearchParams = await searchParams;
  const departamento = resolvedSearchParams.departamento ?? DEFAULT_DEPARTAMENTO;
  const conParalizacion = resolvedSearchParams.conParalizacion === "true";

  const [{ resultados }, resumen] = await Promise.all([
    getPublicWorks({ departamento, estado: resolvedSearchParams.estado, conParalizacion }),
    getPublicWorksResumen(departamento),
  ]);

  return (
    <main>
      <p className="eyebrow">Follow the Sol · {departamento}</p>
      <h1>Obras públicas (INFOBRAS)</h1>
      <p className="lede">
        Avance, paralización y desviación de costo de obras públicas, según lo que las propias
        entidades ejecutoras declaran en INFOBRAS (Contraloría). Son señales trazables a un
        campo declarado, no acusaciones — cada obra enlaza a su fuente.{" "}
        <a href="/cruce">Ver cruce con inversiones (Invierte.pe) →</a>
      </p>

      <div className="stat-row">
        <div className="stat-card">
          <div className="stat-label">Obras</div>
          <div className="stat-value">{resumen.totalObras}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Con paralización activa</div>
          <div className="stat-value">{resumen.conParalizacionPct.toFixed(1)}%</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Con avance reportado</div>
          <div className="stat-value">{resumen.conAvanceReportadoPct.toFixed(1)}%</div>
        </div>
      </div>

      <form className="filters" method="get">
        <input type="hidden" name="departamento" value={departamento} />
        <select name="estado" defaultValue={resolvedSearchParams.estado ?? ""}>
          <option value="">Todos los estados</option>
          <option value="En Ejecución">En ejecución</option>
          <option value="Culminada">Culminada</option>
          <option value="Paralizada">Paralizada</option>
        </select>
        <select name="conParalizacion" defaultValue={resolvedSearchParams.conParalizacion ?? ""}>
          <option value="">Con o sin paralización</option>
          <option value="true">Solo con paralización activa</option>
        </select>
        <button type="submit">Filtrar</button>
      </form>

      <PublicWorksTable rows={resultados} />
    </main>
  );
}
