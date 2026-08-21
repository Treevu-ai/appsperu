import type { ComponentScore, EntityScore } from "@/lib/api";

export interface ScoreTableProps {
  rows: EntityScore[];
}

function scoreChipClass(score: number | null): string {
  if (score === null) return "neutral";
  if (score >= 70) return "confirmada";
  if (score >= 40) return "candidata";
  return "irregular";
}

function componentCell(component: ComponentScore) {
  if (!component.disponible || component.valor === null) {
    return <span title="Sin dato de esta fuente para esta entidad">—</span>;
  }
  return <span>{component.valor.toFixed(1)}%</span>;
}

export function ScoreTable({ rows }: ScoreTableProps) {
  if (rows.length === 0) {
    return <p data-testid="score-table-empty">No hay resultados para estos filtros.</p>;
  }

  return (
    <div style={{ overflowX: "auto" }}>
      <table data-testid="score-table">
        <thead>
          <tr>
            <th>Entidad</th>
            <th>Score</th>
            <th># fuentes</th>
            <th>Ejecución</th>
            <th>Obras no paralizadas</th>
            <th>Inversiones sin sobrecosto</th>
            <th>Compras no concentradas</th>
            <th>Salud tributaria proveedores</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.entityCode}>
              <td>{row.nombre}</td>
              <td>
                {row.scoreCompuesto === null ? (
                  <span className="signal-chip neutral">sin dato</span>
                ) : (
                  <span className={`signal-chip ${scoreChipClass(row.scoreCompuesto)}`}>
                    {row.scoreCompuesto.toFixed(1)}
                  </span>
                )}
              </td>
              <td>{row.componentesUsados} / 5</td>
              <td>{componentCell(row.componentes.ejecucion)}</td>
              <td>{componentCell(row.componentes.obrasNoParalizadas)}</td>
              <td>{componentCell(row.componentes.inversionesSinSobrecosto)}</td>
              <td>{componentCell(row.componentes.comprasNoConcentradas)}</td>
              <td>{componentCell(row.componentes.saludTributariaProveedores)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
