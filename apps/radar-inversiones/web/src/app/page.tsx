import { InvestmentTable } from "@/components/InvestmentTable";
import { getInvestmentList } from "@/lib/api";

const DEFAULT_DEPARTAMENTO = "LA LIBERTAD";

interface PageProps {
  searchParams: Promise<{ departamento?: string; estado?: string; situacion?: string; funcion?: string }>;
}

export default async function RadarInversionesPage({ searchParams }: PageProps) {
  const resolvedSearchParams = await searchParams;
  const departamento = resolvedSearchParams.departamento ?? DEFAULT_DEPARTAMENTO;
  const { resultados } = await getInvestmentList({ ...resolvedSearchParams, departamento });

  const totalViable = resultados.reduce((sum, r) => sum + (r.montoViable ?? 0), 0);
  const totalActualizado = resultados.reduce((sum, r) => sum + (r.costoActualizado ?? 0), 0);
  const conSobrecosto = resultados.filter(
    (r) => r.montoViable !== null && r.costoActualizado !== null && r.costoActualizado > r.montoViable
  ).length;

  return (
    <main>
      <p className="eyebrow">Follow the Sol · {departamento}</p>
      <h1>Radar de inversiones</h1>
      <p className="lede">
        Proyectos de inversión pública en {departamento} — CUI, costo inicial vs. actualizado,
        estado y situación. Muestra parcial de Invierte.pe/Banco de Inversiones (MEF).{" "}
        <a href="/cruce">Ver cruce con presupuesto (por SEC_EJEC) →</a>
      </p>

      <div className="stat-row">
        <div className="stat-card">
          <div className="stat-label">Inversiones listadas</div>
          <div className="stat-value">{resultados.length}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Monto viable total</div>
          <div className="stat-value">S/ {(totalViable / 1_000_000).toFixed(0)}M</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Costo actualizado total</div>
          <div className="stat-value">S/ {(totalActualizado / 1_000_000).toFixed(0)}M</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Con variación al alza</div>
          <div className="stat-value">{conSobrecosto}</div>
        </div>
      </div>

      <form className="filters" method="get">
        <input type="hidden" name="departamento" value={departamento} />
        <select name="estado" defaultValue={resolvedSearchParams.estado ?? ""}>
          <option value="">Todos los estados</option>
          <option value="ACTIVO">Activo</option>
          <option value="CERRADO">Cerrado</option>
        </select>
        <input name="funcion" placeholder="Función (ej. Saneamiento)" defaultValue={resolvedSearchParams.funcion ?? ""} />
        <button type="submit">Filtrar</button>
      </form>

      <InvestmentTable rows={resultados} />
    </main>
  );
}
