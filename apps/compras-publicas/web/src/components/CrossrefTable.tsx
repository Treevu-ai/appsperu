import type { CrossrefEntry } from "@/lib/api";
import { formatSoles } from "@/lib/format";

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
          <th>Entidad (MEF)</th>
          <th>Entidad (OECE)</th>
          <th>Confianza</th>
          <th>Devengado (presupuesto)</th>
          <th>Compras (procesos)</th>
          <th>Compras (valor)</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={`${row.mefEntityCode}-${row.oeceBuyerId}`}>
            <td>{row.mefNombre}</td>
            <td>{row.oeceBuyerName}</td>
            <td>
              <span className={`signal-chip ${row.confidence === "confirmada" ? "confirmada" : "candidata"}`}>
                {row.confidence} · {Math.round(row.score * 100)}%
              </span>
            </td>
            <td>{formatSoles(row.devengado)}</td>
            <td>{row.comprasProcesos}</td>
            <td>{formatSoles(row.comprasValorTotal)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
