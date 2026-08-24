import { getMinorContract } from "@/lib/api";
import { formatFecha, formatSoles } from "@/lib/format";

export const dynamic = "force-dynamic";

interface PageProps { params: Promise<{ id: string }> }
export default async function ContratacionDetallePage({ params }: PageProps) {
  const { id } = await params; const data = await getMinorContract(id); const item = data.contracting;
  return <main>
    <p className="eyebrow">Contratación menor · Evidencia trazable</p><h1>{item.objectOriginal ?? "Objeto no localizado"}</h1>
    <p className="lede"><a href={`/municipalidades/${encodeURIComponent(item.municipality.id)}`}>{item.municipality.name}</a> · {item.supplier?.name ?? "proveedor no localizado"} · <a href="/contrataciones">← Contrataciones</a></p>
    <dl className="detail-grid"><div><dt>Monto adjudicado</dt><dd>{formatSoles(item.awardedAmount)}</dd></div><div><dt>Publicado</dt><dd>{formatFecha(item.publicationDate)}</dd></div><div><dt>Cotizaciones</dt><dd>{item.validQuotationCount === null ? "Validez no publicada" : item.validQuotationCount}</dd></div><div><dt>Fuente</dt><dd><a href={item.source.url} target="_blank">Fuente pública verificable ↗</a></dd></div></dl>
    <h2>Evidencias</h2><p>{data.evidence.length} evidencia(s) enlazada(s) al lote de captura.</p>
    <h2>Señales relacionadas</h2><ul>{data.signals.map((signal) => <li key={signal.signal_id}><a href={`/senales/${encodeURIComponent(signal.signal_id)}`}>{signal.signal_type}</a>: {signal.explanation}</li>)}</ul>
    <p className="lede">{data.limitation}</p>
  </main>;
}
