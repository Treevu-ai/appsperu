import Link from "next/link";
import type { Investment } from "@/lib/api";
import { formatSoles, variacionCostoPct } from "@/lib/format";

export interface InvestmentTableProps {
  rows: Investment[];
}

export function InvestmentTable({ rows }: InvestmentTableProps) {
  if (rows.length === 0) {
    return <p data-testid="investment-table-empty">No hay resultados para estos filtros.</p>;
  }

  return (
    <table data-testid="investment-table">
      <thead>
        <tr>
          <th>Inversión</th>
          <th>Estado / situación</th>
          <th>Monto viable</th>
          <th>Costo actualizado</th>
          <th>Variación</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => {
          const variacion = variacionCostoPct(row.montoViable, row.costoActualizado);
          return (
            <tr key={row.cui}>
              <td>
                <Link href={`/inversion/${encodeURIComponent(row.cui)}`}>{row.nombre}</Link>
              </td>
              <td>
                {row.estado ?? "—"} / {row.situacion ?? "—"}
              </td>
              <td>{formatSoles(row.montoViable)}</td>
              <td>{formatSoles(row.costoActualizado)}</td>
              <td>
                {variacion === null ? (
                  "sin dato"
                ) : variacion > 0 ? (
                  <span className="signal-chip candidata">+{variacion}%</span>
                ) : (
                  `${variacion}%`
                )}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
