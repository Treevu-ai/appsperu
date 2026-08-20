import type { EntidadCrossrefEntry } from "@/lib/api";

export interface EntidadCrossrefTableProps {
  rows: EntidadCrossrefEntry[];
}

export function EntidadCrossrefTable({ rows }: EntidadCrossrefTableProps) {
  if (rows.length === 0) {
    return <p data-testid="entidad-crossref-empty">No hay resultados para estos filtros.</p>;
  }

  return (
    <table data-testid="entidad-crossref-table">
      <thead>
        <tr>
          <th>Entidad (radar-ejecucion)</th>
          <th>RUC</th>
          <th>Razón social en el padrón</th>
          <th>Confianza</th>
          <th>Estatus tributario</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={row.entityCode}>
            <td>{row.nombreEnRadarEjecucion}</td>
            <td>{row.ruc}</td>
            <td>{row.razonSocialEnPadron}</td>
            <td>
              <span className={`signal-chip ${row.confidence === "confirmada" ? "confirmada" : "candidata"}`}>
                {row.confidence} ({row.score.toFixed(2)})
              </span>
            </td>
            <td>
              {row.estadoContribuyente ?? "—"} / {row.condicionDomicilio ?? "—"}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
