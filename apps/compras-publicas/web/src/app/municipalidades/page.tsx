import { getMunicipalities } from "@/lib/api";
import { formatSoles } from "@/lib/format";

export const dynamic = "force-dynamic";

interface PageProps { searchParams: Promise<{ q?: string }> }

export default async function MunicipalidadesPage({ searchParams }: PageProps) {
  const { q } = await searchParams; const data = await getMunicipalities(q);
  return <main>
    <p className="eyebrow">Observatorio · La Libertad · 2026</p><h1>Municipalidades distritales</h1>
    <p className="lede">Perfil descriptivo de las municipalidades con contrataciones menores materializadas. <a href="/contrataciones">← Contrataciones</a></p>
    <form className="filters" method="get"><input name="q" defaultValue={q ?? ""} placeholder="Municipalidad, distrito o RUC" /><button type="submit">Buscar</button></form>
    <table><thead><tr><th>Municipalidad</th><th>Provincia / distrito</th><th>Contratos</th><th>Monto</th><th>Proveedores</th></tr></thead><tbody>
      {data.resultados.map((row) => <tr key={row.municipalityId}><td><a href={`/municipalidades/${encodeURIComponent(row.municipalityId)}`}>{row.officialName}</a><br /><small>{row.ruc ?? "RUC no localizado"}</small></td><td>{row.province ?? "—"} / {row.district ?? "—"}</td><td>{row.contracts}</td><td>{formatSoles(row.totalAmount)}</td><td>{row.suppliers}</td></tr>)}
    </tbody></table>
  </main>;
}
