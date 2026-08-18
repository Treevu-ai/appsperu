import { SuppliersTable } from "@/components/SuppliersTable";
import { getSuppliers } from "@/lib/api";
import { formatSoles } from "@/lib/format";

const DEFAULT_DEPARTAMENTO = "LA LIBERTAD";

interface PageProps {
  searchParams: Promise<{ departamento?: string }>;
}

export default async function ProveedoresPage({ searchParams }: PageProps) {
  const resolvedSearchParams = await searchParams;
  const departamento = resolvedSearchParams.departamento ?? DEFAULT_DEPARTAMENTO;
  const { resultados, concentracion } = await getSuppliers(departamento);

  return (
    <main>
      <p className="eyebrow">Follow the Sol · {departamento}</p>
      <h1>Proveedores del Estado</h1>
      <p className="lede">
        ¿Quién gana las adjudicaciones del Estado en {departamento} y qué tan concentrado
        está ese mercado? Muestra parcial vía la API de OECE (Contrataciones Abiertas,
        endpoint <code>/records</code>) — páginas recientes, no el universo completo de
        adjudicaciones. <a href="/">← Compras públicas</a>
      </p>

      <div className="stat-row">
        <div className="stat-card">
          <div className="stat-label">Proveedores</div>
          <div className="stat-value">{concentracion.proveedoresConsiderados}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Adjudicaciones</div>
          <div className="stat-value">{resultados.reduce((sum, r) => sum + r.adjudicaciones, 0)}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">CR3 (top 3 proveedores)</div>
          <div className="stat-value">{concentracion.cr3.toFixed(1)}%</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">HHI</div>
          <div className="stat-value">{concentracion.hhi.toFixed(0)}</div>
          <div style={{ fontSize: 12, color: "var(--ink-faint)", marginTop: 4 }}>
            {concentracion.hhi >= 2500
              ? "alta concentración"
              : concentracion.hhi >= 1500
                ? "concentración moderada"
                : "mercado competitivo"}
          </div>
        </div>
      </div>

      <form className="filters" method="get">
        <input
          type="text"
          name="departamento"
          defaultValue={departamento}
          placeholder="Departamento"
        />
        <button type="submit">Filtrar</button>
      </form>

      <SuppliersTable rows={resultados} />
    </main>
  );
}
