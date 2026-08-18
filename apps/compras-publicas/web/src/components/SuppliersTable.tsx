import Link from "next/link";
import type { SupplierSummary } from "@/lib/api";
import { formatSoles } from "@/lib/format";

export interface SuppliersTableProps {
  rows: SupplierSummary[];
}

export function SuppliersTable({ rows }: SuppliersTableProps) {
  if (rows.length === 0) {
    return <p data-testid="suppliers-table-empty">No hay proveedores para este filtro.</p>;
  }

  return (
    <table data-testid="suppliers-table">
      <thead>
        <tr>
          <th>Proveedor</th>
          <th>Adjudicaciones</th>
          <th>Entidades distintas</th>
          <th>Valor total</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={row.supplierId}>
            <td>
              <Link href={`/proveedores/${encodeURIComponent(row.supplierId)}`}>{row.supplierName}</Link>
            </td>
            <td>{row.adjudicaciones}</td>
            <td>{row.entidadesDistintas}</td>
            <td>{formatSoles(row.valorTotal)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
