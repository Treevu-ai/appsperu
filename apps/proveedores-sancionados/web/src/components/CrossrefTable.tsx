import type { CrossrefEntry } from "@/lib/api";

export interface CrossrefTableProps {
  rows: CrossrefEntry[];
}

export function CrossrefTable({ rows }: CrossrefTableProps) {
  if (rows.length === 0) {
    return <p data-testid="crossref-table-empty">No hay resultados para estos filtros.</p>;
  }

  return (
    <table data-testid="crossref-table">
      <thead>
        <tr>
          <th>Proveedor</th>
          <th>Comprador</th>
          <th>Monto</th>
          <th>Fecha</th>
          <th>Estatus tributario</th>
          <th>Inhabilitación</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={row.awardId}>
            <td>{row.supplierName}</td>
            <td>{row.buyerName}</td>
            <td>
              {row.valorMonto === null ? "—" : `${row.valorMoneda ?? "PEN"} ${row.valorMonto.toLocaleString("es-PE")}`}
            </td>
            <td>{row.fecha ? new Date(row.fecha).toLocaleDateString("es-PE") : "—"}</td>
            <td>
              {row.estadoContribuyente ?? "—"} / {row.condicionDomicilio ?? "—"}
            </td>
            <td>
              {!row.rucValido ? (
                "RUC no estándar"
              ) : row.tieneInhabilitacionVigente ? (
                <span className="signal-chip irregular">VIGENTE hoy ({row.inhabilitacionesEncontradas})</span>
              ) : row.inhabilitacionesEncontradas > 0 ? (
                <span className="signal-chip candidata">histórica ({row.inhabilitacionesEncontradas})</span>
              ) : (
                "sin registro"
              )}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
