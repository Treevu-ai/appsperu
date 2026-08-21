import type { ProveedorCrossrefEntry } from "@/lib/api";

export interface ProveedorCrossrefTableProps {
  rows: ProveedorCrossrefEntry[];
}

function estatusLabel(row: ProveedorCrossrefEntry): string {
  if (!row.rucValido) return "RUC no estándar (consorcio)";
  if (!row.encontradoEnPadron) return "no ingerido en el padrón";
  return `${row.estadoContribuyente ?? "—"} / ${row.condicionDomicilio ?? "—"}`;
}

export function ProveedorCrossrefTable({ rows }: ProveedorCrossrefTableProps) {
  if (rows.length === 0) {
    return <p data-testid="proveedor-crossref-empty">No hay resultados para estos filtros.</p>;
  }

  return (
    <table data-testid="proveedor-crossref-table">
      <thead>
        <tr>
          <th>Proveedor</th>
          <th>Comprador</th>
          <th>Monto</th>
          <th>Fecha</th>
          <th>Estatus tributario</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={row.awardId}>
            <td>{row.supplierName}</td>
            <td>{row.buyerName}</td>
            <td>
              {row.valorMonto === null
                ? "—"
                : `${row.valorMoneda ?? "PEN"} ${row.valorMonto.toLocaleString("es-PE")}`}
            </td>
            <td>{row.fecha ? new Date(row.fecha).toLocaleDateString("es-PE") : "—"}</td>
            <td>
              {row.irregular ? (
                <span className="signal-chip irregular">{estatusLabel(row)}</span>
              ) : (
                estatusLabel(row)
              )}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
