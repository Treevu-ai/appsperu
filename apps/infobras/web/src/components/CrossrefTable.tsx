import type { CrossrefEntry } from "@/lib/api";
import { formatPct, variacionCostoPct } from "@/lib/format";

export interface CrossrefTableProps {
  rows: CrossrefEntry[];
}

export function CrossrefTable({ rows }: CrossrefTableProps) {
  if (rows.length === 0) {
    return <p data-testid="crossref-table-empty">No hay cruces para este filtro.</p>;
  }

  return (
    <table data-testid="crossref-table">
      <thead>
        <tr>
          <th>CUI</th>
          <th>Inversión (Invierte.pe)</th>
          <th>Obras (INFOBRAS)</th>
          <th>Avance físico prom.</th>
          <th>Cost drift</th>
          <th>En inversiones</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => {
          const drift = variacionCostoPct(row.montoViableInversion, row.costoActualizadoInversion);
          return (
            <tr key={row.cui}>
              <td>{row.cui}</td>
              <td>{row.nombreInversion ?? "sin dato"}</td>
              <td>
                {row.obras}
                {row.obrasParalizadas > 0 && (
                  <span className="signal-chip alerta" style={{ marginLeft: 8 }}>
                    {row.obrasParalizadas} paralizada{row.obrasParalizadas > 1 ? "s" : ""}
                  </span>
                )}
              </td>
              <td>{formatPct(row.avanceFisicoRealPromedio)}</td>
              <td>{drift === null ? "sin dato" : `${drift.toFixed(1)}%`}</td>
              <td>
                <span className={`signal-chip ${row.enInversiones ? "confirmada" : "neutral"}`}>
                  {row.enInversiones ? "confirmada" : "sin match"}
                </span>
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
