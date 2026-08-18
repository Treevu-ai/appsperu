import Link from "next/link";
import type { ProcurementProcess } from "@/lib/api";
import { formatCategoria, formatFecha, formatSoles } from "@/lib/format";

export interface ProcurementTableProps {
  rows: ProcurementProcess[];
}

export function ProcurementTable({ rows }: ProcurementTableProps) {
  if (rows.length === 0) {
    return <p data-testid="procurement-table-empty">No hay resultados para estos filtros.</p>;
  }

  return (
    <table data-testid="procurement-table">
      <thead>
        <tr>
          <th>Entidad compradora</th>
          <th>Título</th>
          <th>Categoría</th>
          <th>Provincia / distrito</th>
          <th>Valor</th>
          <th>Publicado</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={row.ocid}>
            <td>
              <Link href={`/proceso/${encodeURIComponent(row.ocid)}`}>{row.buyerName}</Link>
            </td>
            <td>{row.titulo ?? "sin título"}</td>
            <td>{formatCategoria(row.categoria)}</td>
            <td>
              {row.provincia ?? "—"} / {row.distrito ?? "—"}
            </td>
            <td>{formatSoles(row.valorMonto)}</td>
            <td>{formatFecha(row.fechaPublicacion)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
