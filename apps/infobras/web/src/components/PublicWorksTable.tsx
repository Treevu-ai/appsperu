import Link from "next/link";
import type { PublicWork } from "@/lib/api";
import { formatPct } from "@/lib/format";

export interface PublicWorksTableProps {
  rows: PublicWork[];
}

export function PublicWorksTable({ rows }: PublicWorksTableProps) {
  if (rows.length === 0) {
    return <p data-testid="public-works-table-empty">No hay obras para este filtro.</p>;
  }

  return (
    <table data-testid="public-works-table">
      <thead>
        <tr>
          <th>Obra</th>
          <th>Entidad</th>
          <th>Estado</th>
          <th>Avance físico real</th>
          <th>Cost drift</th>
          <th>Señales</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={row.codigoInfobras}>
            <td>
              <Link href={`/obras/${encodeURIComponent(row.codigoInfobras)}`}>{row.nombreObra}</Link>
            </td>
            <td>{row.entidadNombre}</td>
            <td>{row.estadoEjecucion ?? "sin dato"}</td>
            <td>{formatPct(row.avanceFisicoRealPct)}</td>
            <td>{row.costDriftPct === null ? "sin dato" : `${row.costDriftPct.toFixed(1)}%`}</td>
            <td>
              {row.existeParalizacion && <span className="signal-chip alerta">paralizada</span>}
              {!row.existeParalizacion && row.costDriftPct !== null && row.costDriftPct >= 20 && (
                <span className="signal-chip candidata">cost drift alto</span>
              )}
              {!row.existeParalizacion && (row.costDriftPct === null || row.costDriftPct < 20) && (
                <span className="signal-chip neutral">sin alertas</span>
              )}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
