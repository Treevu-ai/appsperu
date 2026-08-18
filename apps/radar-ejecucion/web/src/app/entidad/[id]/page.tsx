import { SourceFootnote } from "@/components/SourceFootnote";
import { getEntity } from "@/lib/api";
import { formatPct, formatSoles } from "@/lib/format";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function FichaEntidadPage({ params }: PageProps) {
  const { id } = await params;
  const entidad = await getEntity(id);
  const latest = entidad.linea_de_tiempo[0];

  return (
    <main>
      <p className="eyebrow">
        {entidad.nivelGobierno.replace(/_/g, " ")} · código {entidad.entityCode}
      </p>
      <h1>{entidad.nombre}</h1>

      {latest && (
        <div className="stat-row">
          <div className="stat-card">
            <div className="stat-label">PIM {latest.anioFiscal}</div>
            <div className="stat-value">S/ {(latest.pim / 1_000_000).toFixed(1)}M</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">Devengado</div>
            <div className="stat-value">S/ {(latest.devengado / 1_000_000).toFixed(1)}M</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">Avance</div>
            <div className="stat-value">{formatPct(latest.avancePct)}</div>
          </div>
        </div>
      )}

      <table data-testid="entity-timeline">
        <thead>
          <tr>
            <th>Función</th>
            <th>Año</th>
            <th>PIA</th>
            <th>PIM</th>
            <th>Devengado</th>
            <th>Avance</th>
          </tr>
        </thead>
        <tbody>
          {entidad.linea_de_tiempo.map((row) => (
            <tr key={`${row.funcion}-${row.anioFiscal}`}>
              <td>{row.funcion}</td>
              <td>{row.anioFiscal}</td>
              <td>{formatSoles(row.pia)}</td>
              <td>{formatSoles(row.pim)}</td>
              <td>{formatSoles(row.devengado)}</td>
              <td>{formatPct(row.avancePct)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {entidad.linea_de_tiempo[0] && (
        <SourceFootnote
          dataset={entidad.linea_de_tiempo[0].fuente.dataset}
          resourceId={entidad.linea_de_tiempo[0].fuente.resourceId}
          fechaCorte={entidad.linea_de_tiempo[0].fechaCorte}
          extraidoEl={entidad.linea_de_tiempo[0].fuente.extraidoEl}
        />
      )}

      <p>
        <a href={`/benchmark/${encodeURIComponent(entidad.entityCode)}`}>
          Ver comparación contra pares →
        </a>
      </p>
    </main>
  );
}
