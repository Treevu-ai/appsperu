import type { SancionesResponse } from "@/lib/api";

export interface SancionesResultProps {
  data: SancionesResponse;
}

export function SancionesResult({ data }: SancionesResultProps) {
  const { ruc, tieneInhabilitacionVigente, inhabilitaciones, multas } = data;

  if (inhabilitaciones.length === 0 && multas.length === 0) {
    return (
      <p data-testid="sanciones-result-empty">
        No se encontró ninguna sanción para el RUC {ruc} en el reporte de los últimos 5 años.
      </p>
    );
  }

  return (
    <div data-testid="sanciones-result">
      <p>
        {tieneInhabilitacionVigente ? (
          <span className="signal-chip irregular">Inhabilitación VIGENTE</span>
        ) : (
          <span className="signal-chip neutral">Sin inhabilitación vigente hoy</span>
        )}
      </p>

      {inhabilitaciones.length > 0 && (
        <>
          <h2>Inhabilitaciones ({inhabilitaciones.length})</h2>
          <table data-testid="inhabilitaciones-table">
            <thead>
              <tr>
                <th>Resolución</th>
                <th>Periodo</th>
                <th>Desde</th>
                <th>Hasta</th>
                <th>Infracción</th>
                <th>Estado</th>
              </tr>
            </thead>
            <tbody>
              {inhabilitaciones.map((row) => (
                <tr key={row.resolucion}>
                  <td>{row.resolucion}</td>
                  <td>{row.periodo_inhabilitacion ?? "—"}</td>
                  <td>{row.desde ?? "—"}</td>
                  <td>{row.hasta ?? "—"}</td>
                  <td>{row.infraccion ?? "—"}</td>
                  <td>
                    {row.estado === "VIGENTE" ? (
                      <span className="signal-chip irregular">{row.estado}</span>
                    ) : (
                      row.estado ?? "—"
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}

      {multas.length > 0 && (
        <>
          <h2 style={{ marginTop: 32 }}>Multas ({multas.length})</h2>
          <table data-testid="multas-table">
            <thead>
              <tr>
                <th>Resolución</th>
                <th>Fecha</th>
                <th>Monto (S/)</th>
                <th>Suspensión cautelar</th>
                <th>Estado</th>
              </tr>
            </thead>
            <tbody>
              {multas.map((row) => (
                <tr key={row.resolucion}>
                  <td>{row.resolucion}</td>
                  <td>{row.fecha_resolucion ?? "—"}</td>
                  <td>{row.monto_multa === null ? "—" : row.monto_multa.toLocaleString("es-PE")}</td>
                  <td>{row.periodo_suspension ?? "—"}</td>
                  <td>{row.estado ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </div>
  );
}
