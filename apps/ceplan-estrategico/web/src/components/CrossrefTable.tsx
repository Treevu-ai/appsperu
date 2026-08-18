import type { CrossrefRow } from "@/lib/api";
import { formatAnio, formatPct } from "@/lib/format";

export interface CrossrefTableProps {
  rows: CrossrefRow[];
}

export function CrossrefTable({ rows }: CrossrefTableProps) {
  if (rows.length === 0) {
    return <p data-testid="crossref-table-empty">No hay cruces disponibles.</p>;
  }

  return (
    <table data-testid="crossref-table">
      <thead>
        <tr>
          <th>Nivel de gobierno</th>
          <th>Ejecución física (CEPLAN)</th>
          <th>Ejecución presupuestal (CEPLAN)</th>
          <th>Ejecución presupuestal (radar-ejecucion)</th>
          <th>Strategic Execution Gap</th>
          <th>Execution Efficiency</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={row.nivelGobierno}>
            <td>
              {row.nivelGobiernoRadarEjecucion}
              <div style={{ fontSize: 12, color: "var(--ink-faint)" }}>
                CEPLAN {formatAnio(row.anioCeplan)} · radar-ejecucion {row.anioRadarEjecucion ?? "sin dato"}
              </div>
            </td>
            <td>{formatPct(row.ejecucionFisicaCeplan)}</td>
            <td>{formatPct(row.ejecucionPresupuestalCeplan)}</td>
            <td>{formatPct(row.ejecucionPresupuestalRadarEjecucion)}</td>
            <td>{row.strategicExecutionGap === null ? "sin dato" : `${row.strategicExecutionGap.toFixed(1)} pp`}</td>
            <td>{row.executionEfficiency === null ? "sin dato" : row.executionEfficiency.toFixed(2)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
