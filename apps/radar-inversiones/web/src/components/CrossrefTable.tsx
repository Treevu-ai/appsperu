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
          <th>Entidad (SEC_EJEC)</th>
          <th>En presupuesto</th>
          <th>Inversiones</th>
          <th>Monto viable</th>
          <th>Costo actualizado</th>
          <th>Devengado (presupuesto)</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={row.secEjec}>
            <td>
              {row.nombreUep ?? row.secEjec}
              <div style={{ fontSize: 11, color: "var(--ink-faint)" }}>SEC_EJEC {row.secEjec}</div>
            </td>
            <td>
              {row.enPresupuesto ? (
                <span className="signal-chip confirmada">en presupuesto</span>
              ) : (
                <span className="signal-chip neutral">sin match</span>
              )}
            </td>
            <td>{row.inversiones}</td>
            <td>{formatSoles(row.montoViableTotal)}</td>
            <td>{formatSoles(row.costoActualizadoTotal)}</td>
            <td>{formatSoles(row.devengado)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
