import Link from "next/link";
import type { ExecutionRow } from "@/lib/api";
import { formatPct, formatSoles } from "@/lib/format";

export interface ExecutionTableProps {
  rows: ExecutionRow[];
}

export function ExecutionTable({ rows }: ExecutionTableProps) {
  if (rows.length === 0) {
    return <p data-testid="execution-table-empty">No hay resultados para estos filtros.</p>;
  }

  return (
    <table data-testid="execution-table">
      <thead>
        <tr>
          <th>Entidad</th>
          <th>Función</th>
          <th>Año</th>
          <th>PIA</th>
          <th>PIM</th>
          <th>Devengado</th>
          <th>Avance</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={`${row.entityCode}-${row.funcion}-${row.anioFiscal}`}>
            <td>
              <Link href={`/entidad/${encodeURIComponent(row.entityCode)}`}>{row.nombre}</Link>
            </td>
            <td>{row.funcion}</td>
            <td>{row.anioFiscal}</td>
            <td>{formatSoles(row.pia)}</td>
            <td>{formatSoles(row.pim)}</td>
            <td>{formatSoles(row.devengado)}</td>
            <td>
              {formatPct(row.avancePct)}
              <div className="progress-track" style={{ width: 72 }}>
                <div
                  className="progress-fill"
                  style={{ width: `${Math.min(100, Math.max(0, row.avancePct ?? 0))}%` }}
                />
              </div>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
