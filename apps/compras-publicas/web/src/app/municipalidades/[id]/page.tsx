import { getMunicipality } from "@/lib/api";
import { formatSoles } from "@/lib/format";

export const dynamic = "force-dynamic";

interface PageProps { params: Promise<{ id: string }> }
export default async function MunicipalidadDetallePage({ params }: PageProps) {
  const { id } = await params; const data = await getMunicipality(id); const profile = data.profile;
  return <main>
    <p className="eyebrow">Municipalidad distrital · Observatorio</p><h1>{data.municipality.officialName}</h1>
    <p className="lede">{data.municipality.province ?? "Provincia no publicada"} / {data.municipality.district ?? "Distrito no publicado"} · <a href="/municipalidades">← Municipalidades</a></p>
    <div className="stat-row"><div className="stat-card"><div className="stat-label">Contratos</div><div className="stat-value">{profile.contracts}</div></div><div className="stat-card"><div className="stat-label">Monto</div><div className="stat-value">{formatSoles(Number(profile.total_amount))}</div></div><div className="stat-card"><div className="stat-label">Proveedores</div><div className="stat-value">{profile.supplier_count}</div></div></div>
    <h2>Categorías</h2><ul>{data.categories.map((row) => <li key={row.category ?? "none"}>{row.category ?? "sin categoría"}: {row.contracts} · {formatSoles(Number(row.total_amount))}</li>)}</ul>
    <h2>Proveedores principales</h2><ul>{data.suppliers.map((row) => <li key={row.supplier_id}>{row.legal_name}: {row.contracts} contrato(s) · {formatSoles(Number(row.total_amount))}</li>)}</ul>
    <p className="lede">{data.limitation}</p>
  </main>;
}
