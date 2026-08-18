import type { IndicatorRow } from "@/lib/api";
import { formatAnio, formatValor } from "@/lib/format";

export interface IndicatorsTableProps {
  rows: IndicatorRow[];
}

export function IndicatorsTable({ rows }: IndicatorsTableProps) {
  if (rows.length === 0) {
    return <p data-testid="indicators-table-empty">No hay indicadores para este filtro.</p>;
  }

  return (
    <table data-testid="indicators-table">
      <thead>
        <tr>
          <th>Código</th>
          <th>Indicador</th>
          <th>Serie</th>
          <th>Nivel de gobierno</th>
          <th>Valor</th>
          <th>Año</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={`${row.indicatorCode}-${row.serieId}`}>
            <td>{row.indicatorCode}</td>
            <td>{row.indicatorName}</td>
            <td>{row.serieLabel}</td>
            <td>{row.nivelGobierno ?? "—"}</td>
            <td>{formatValor(row.value, row.unitOfMeasure)}</td>
            <td>{formatAnio(row.measurementDate)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
