import { IndicatorsTable } from "@/components/IndicatorsTable";
import { SourceFootnote } from "@/components/SourceFootnote";
import { getIndicators, type IndicatorRow } from "@/lib/api";

interface PageProps {
  searchParams: Promise<{ nivelGobierno?: string }>;
}

/**
 * La API devuelve toda la serie histórica (2020-2025) por indicador — para el
 * listado principal solo interesa el valor más reciente de cada serie, no
 * cada observación anual.
 */
function latestPerSerie(rows: IndicatorRow[]): IndicatorRow[] {
  const latest = new Map<string, IndicatorRow>();
  for (const row of rows) {
    const key = `${row.indicatorCode}|${row.serieId}`;
    const existing = latest.get(key);
    if (!existing || row.measurementDate > existing.measurementDate) {
      latest.set(key, row);
    }
  }
  return [...latest.values()].sort((a, b) => a.indicatorCode.localeCompare(b.indicatorCode));
}

export default async function CeplanEstrategicoPage({ searchParams }: PageProps) {
  const resolvedSearchParams = await searchParams;
  const { resultados } = await getIndicators({ nivelGobierno: resolvedSearchParams.nivelGobierno });
  const rows = latestPerSerie(resultados);

  return (
    <main>
      <p className="eyebrow">Follow the Sol · Gestión estratégica del Estado</p>
      <h1>CEPLAN Estratégico</h1>
      <p className="lede">
        Indicadores de planeamiento, políticas y ejecución del Estado peruano, según
        ObservaPerú (CEPLAN) — agregados por nivel de gobierno, no por entidad individual:
        es la única granularidad que la fuente publica públicamente hoy.{" "}
        <a href="/cruce">Ver cruce con ejecución presupuestal →</a>
      </p>

      <div className="stat-row">
        <div className="stat-card">
          <div className="stat-label">Series de indicadores</div>
          <div className="stat-value">{rows.length}</div>
        </div>
      </div>

      <form className="filters" method="get">
        <select name="nivelGobierno" defaultValue={resolvedSearchParams.nivelGobierno ?? ""}>
          <option value="">Todos los niveles</option>
          <option value="GN">Gobierno nacional</option>
          <option value="GR">Gobiernos regionales</option>
          <option value="MP">Municipalidades provinciales</option>
          <option value="MD">Municipalidades distritales</option>
          <option value="TOTAL">Total país</option>
        </select>
        <button type="submit">Filtrar</button>
      </form>

      <IndicatorsTable rows={rows} />

      {rows[0] && <SourceFootnote dataset={rows[0].fuente.dataset} />}
    </main>
  );
}
