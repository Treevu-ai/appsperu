import { ExecutionTable } from "@/components/ExecutionTable";
import { getExecutionList, type ExecutionRow } from "@/lib/api";

const DEFAULT_DEPARTAMENTO = "LA LIBERTAD";

interface PageProps {
  searchParams: Promise<{ nivel?: string; funcion?: string; anio?: string; departamento?: string }>;
}

function summarizePorNivel(rows: ExecutionRow[]) {
  const byNivel = new Map<string, { devengado: number; entidades: Set<string> }>();
  for (const row of rows) {
    const entry = byNivel.get(row.nivelGobierno) ?? { devengado: 0, entidades: new Set() };
    entry.devengado += row.devengado;
    entry.entidades.add(row.entityCode);
    byNivel.set(row.nivelGobierno, entry);
  }
  return [...byNivel.entries()]
    .map(([nivel, v]) => ({ nivel, devengado: v.devengado, entidades: v.entidades.size }))
    .sort((a, b) => b.devengado - a.devengado);
}

export default async function RadarEjecucionPage({ searchParams }: PageProps) {
  const resolvedSearchParams = await searchParams;
  const departamento = resolvedSearchParams.departamento ?? DEFAULT_DEPARTAMENTO;
  const [{ resultados }, { resultados: dirigidoAResultados }] = await Promise.all([
    getExecutionList({ ...resolvedSearchParams, departamento }),
    getExecutionList({ metaDepartamento: departamento, anio: resolvedSearchParams.anio }),
  ]);
  const totalPim = resultados.reduce((sum, r) => sum + r.pim, 0);
  const totalDevengado = resultados.reduce((sum, r) => sum + r.devengado, 0);
  const porNivel = summarizePorNivel(resultados);
  const totalDirigidoA = dirigidoAResultados.reduce((sum, r) => sum + r.devengado, 0);

  return (
    <main>
      <p className="eyebrow">Follow the Sol · {departamento}</p>
      <h1>Radar de ejecución</h1>
      <p className="lede">
        ¿Quién ejecuta cuánto de su presupuesto en {departamento} y cómo se compara frente a sus
        pares? Filtra por nivel de gobierno, función y año fiscal.
      </p>

      <div className="stat-row">
        <div className="stat-card">
          <div className="stat-label">Entidades listadas</div>
          <div className="stat-value">{resultados.length}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">PIM total (filtro actual)</div>
          <div className="stat-value">S/ {(totalPim / 1_000_000).toFixed(1)}M</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Devengado total</div>
          <div className="stat-value">S/ {(totalDevengado / 1_000_000).toFixed(1)}M</div>
        </div>
      </div>

      {porNivel.length > 0 && (
        <>
          <p className="eyebrow" style={{ marginBottom: 10 }}>
            Devengado por nivel de gobierno
          </p>
          <div className="stat-row">
            {porNivel.map((n) => (
              <div className="stat-card" key={n.nivel}>
                <div className="stat-label">{n.nivel}</div>
                <div className="stat-value">S/ {(n.devengado / 1_000_000).toFixed(1)}M</div>
                <div style={{ fontSize: 12, color: "var(--ink-faint)", marginTop: 4 }}>
                  {n.entidades} entidad(es)
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      <form className="filters" method="get">
        <input type="hidden" name="departamento" value={departamento} />
        <select name="nivel" defaultValue={resolvedSearchParams.nivel ?? ""}>
          <option value="">Todos los niveles</option>
          <option value="GOBIERNOS LOCALES">Gobiernos locales</option>
          <option value="GOBIERNOS REGIONALES">Gobierno regional</option>
          <option value="GOBIERNO NACIONAL">Gobierno nacional</option>
        </select>
        <input name="funcion" placeholder="Función (ej. Educación)" defaultValue={resolvedSearchParams.funcion ?? ""} />
        <input name="anio" placeholder="Año fiscal" defaultValue={resolvedSearchParams.anio ?? ""} />
        <button type="submit">Filtrar</button>
      </form>

      <ExecutionTable rows={resultados} />

      {dirigidoAResultados.length > 0 && (
        <section style={{ marginTop: 40, borderTop: "1px solid var(--line)", paddingTop: 28 }}>
          <p className="eyebrow">Gasto nacional dirigido a {departamento}</p>
          <p className="lede">
            Programas del Gobierno Nacional con sede en otra parte (usualmente Lima) que ejecutan
            metas de gasto en {departamento}. Distinto de la ejecución propia de la región — es
            dinero que llega desde afuera, no que la región administra.
          </p>
          <div className="stat-row">
            <div className="stat-card">
              <div className="stat-label">Programas nacionales</div>
              <div className="stat-value">{dirigidoAResultados.length}</div>
            </div>
            <div className="stat-card">
              <div className="stat-label">Devengado dirigido a la región</div>
              <div className="stat-value">S/ {(totalDirigidoA / 1_000_000).toFixed(1)}M</div>
            </div>
          </div>
          <ExecutionTable rows={dirigidoAResultados} />
        </section>
      )}
    </main>
  );
}
