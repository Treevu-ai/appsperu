import { ProcurementTable } from "@/components/ProcurementTable";
import { getProcurementList, type ProcurementProcess } from "@/lib/api";
import { formatCategoria } from "@/lib/format";

const DEFAULT_DEPARTAMENTO = "LA LIBERTAD";

interface PageProps {
  searchParams: Promise<{ departamento?: string; categoria?: string }>;
}

function summarizePorCategoria(rows: ProcurementProcess[]) {
  const byCategoria = new Map<string, { valor: number; procesos: number }>();
  for (const row of rows) {
    const key = row.categoria ?? "sin_categoria";
    const entry = byCategoria.get(key) ?? { valor: 0, procesos: 0 };
    entry.valor += row.valorMonto ?? 0;
    entry.procesos += 1;
    byCategoria.set(key, entry);
  }
  return [...byCategoria.entries()]
    .map(([categoria, v]) => ({ categoria, valor: v.valor, procesos: v.procesos }))
    .sort((a, b) => b.valor - a.valor);
}

export default async function ComprasPublicasPage({ searchParams }: PageProps) {
  const resolvedSearchParams = await searchParams;
  const departamento = resolvedSearchParams.departamento ?? DEFAULT_DEPARTAMENTO;
  const { resultados } = await getProcurementList({ ...resolvedSearchParams, departamento });
  const porCategoria = summarizePorCategoria(resultados);
  const totalValor = resultados.reduce((sum, r) => sum + (r.valorMonto ?? 0), 0);

  return (
    <main>
      <p className="eyebrow">Follow the Sol · {departamento}</p>
      <h1>Compras públicas</h1>
      <p className="lede">
        ¿Qué está comprando el Estado en {departamento}, quién compra y cuánto vale?
        Muestra parcial vía la API de OECE (Contrataciones Abiertas, OCDS) — páginas
        recientes, no el universo completo de procesos.{" "}
        <a href="/cruce">Ver cruce con presupuesto (MEF) →</a> ·{" "}
        <a href="/proveedores">Ver proveedores y concentración →</a>
      </p>

      <div className="stat-row">
        <div className="stat-card">
          <div className="stat-label">Procesos listados</div>
          <div className="stat-value">{resultados.length}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Valor total (filtro actual)</div>
          <div className="stat-value">S/ {(totalValor / 1_000).toFixed(0)}k</div>
        </div>
      </div>

      {porCategoria.length > 0 && (
        <>
          <p className="eyebrow" style={{ marginBottom: 10 }}>
            Por categoría
          </p>
          <div className="stat-row">
            {porCategoria.map((c) => (
              <div className="stat-card" key={c.categoria}>
                <div className="stat-label">{formatCategoria(c.categoria)}</div>
                <div className="stat-value">S/ {(c.valor / 1_000).toFixed(0)}k</div>
                <div style={{ fontSize: 12, color: "var(--ink-faint)", marginTop: 4 }}>
                  {c.procesos} proceso(s)
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      <form className="filters" method="get">
        <input type="hidden" name="departamento" value={departamento} />
        <select name="categoria" defaultValue={resolvedSearchParams.categoria ?? ""}>
          <option value="">Todas las categorías</option>
          <option value="goods">Bienes</option>
          <option value="works">Obras</option>
          <option value="services">Servicios</option>
        </select>
        <button type="submit">Filtrar</button>
      </form>

      <ProcurementTable rows={resultados} />
    </main>
  );
}
