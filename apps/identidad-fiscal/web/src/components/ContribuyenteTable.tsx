import type { Contribuyente } from "@/lib/api";

export interface ContribuyenteTableProps {
  rows: Contribuyente[];
}

export function ContribuyenteTable({ rows }: ContribuyenteTableProps) {
  if (rows.length === 0) {
    return <p data-testid="contribuyente-table-empty">No hay resultados para estos filtros.</p>;
  }

  return (
    <table data-testid="contribuyente-table">
      <thead>
        <tr>
          <th>RUC</th>
          <th>Razón social</th>
          <th>Estado</th>
          <th>Condición de domicilio</th>
          <th>Ubigeo</th>
          <th>Dirección</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={row.ruc}>
            <td>{row.ruc}</td>
            <td>{row.razonSocial}</td>
            <td>{row.estadoContribuyente ?? "—"}</td>
            <td>{row.condicionDomicilio ?? "—"}</td>
            <td>{row.ubigeo ?? "—"}</td>
            <td>{row.direccion ?? "—"}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
