import { getMinorContracts, getSourceFreshness } from "@/lib/api";
import { formatCategoria, formatFecha, formatSoles } from "@/lib/format";

export const dynamic = "force-dynamic";

interface PageProps { searchParams: Promise<{ q?: string; category?: string; year?: string }> }

export default async function ContratacionesMenoresPage({ searchParams }: PageProps) {
  const filters = await searchParams;
  const [data, freshness] = await Promise.all([getMinorContracts({ ...filters, year: filters.year ?? "2026" }), getSourceFreshness()]);
  return <main>
    <p className="eyebrow">Observatorio · {data.scope.department} · 2026</p>
    <h1>Contrataciones menores ≤ 8 UIT</h1>
    <p className="lede">Reconstrucción verificable de contratos de municipalidades distritales, bienes y servicios, hasta {formatSoles(data.scope.maximumAmount)}. <a href="/municipalidades">Municipalidades →</a> · <a href="/senales">Señales →</a> · <a href="/revision-semantica">Revisión semántica →</a></p>
    <form className="filters" method="get">
      <input name="q" defaultValue={filters.q ?? ""} placeholder="Objeto, proveedor, RUC u OCID" />
      <select name="category" defaultValue={filters.category ?? ""}><option value="">Bienes y servicios</option><option value="goods">Bienes</option><option value="services">Servicios</option></select>
      <input type="hidden" name="year" value="2026" /><button type="submit">Buscar</button>
    </form>
    <p className="lede">{data.resultados.length} contratación(es) localizadas. {data.scope.statement}</p>
    <p className="lede"><strong>Frescura y cobertura:</strong> {freshness.sources.map((source) => `${source.source}: ${source.fetchedAt ? new Date(source.fetchedAt).toLocaleDateString("es-PE") : "sin dato"} (${source.records} registros; ${source.coverage})`).join(" · ")}. {freshness.limitation}</p>
    <table><thead><tr><th>Objeto</th><th>Municipalidad</th><th>Proveedor</th><th>Monto adjudicado</th><th>Publicado</th><th>Cotizaciones</th></tr></thead>
      <tbody>{data.resultados.map((row) => <tr key={row.contractingId}><td><a href={`/contrataciones/${encodeURIComponent(row.contractingId)}`}>{row.objectOriginal ?? "sin objeto publicado"}</a><br /><small>{formatCategoria(row.category)}</small></td><td>{row.municipality.name}<br /><small>{row.municipality.district ?? "distrito no publicado"}</small></td><td>{row.supplier?.name ?? "proveedor no localizado"}</td><td>{formatSoles(row.awardedAmount)}</td><td>{formatFecha(row.publicationDate)}</td><td>{row.validQuotationCount === null ? `${row.quotationCount} participante(s); validez no publicada` : row.validQuotationCount}</td></tr>)}</tbody>
    </table>
  </main>;
}
