import { getSemanticReviewQueue } from "@/lib/api";

export const dynamic = "force-dynamic";

const soles = (value: number | null) => value === null ? "sin monto" : new Intl.NumberFormat("es-PE", { style: "currency", currency: "PEN", maximumFractionDigits: 0 }).format(value);

export default async function RevisionSemanticaPage() {
  const data = await getSemanticReviewQueue();
  return <main>
    <p className="eyebrow">Observatorio · Revisión documental</p>
    <h1>Pares semánticamente comparables</h1>
    <p className="lede">La bandeja prioriza contratos con objetos comparables por embeddings y publicados con hasta 90 días de distancia. S13 añade el mismo proveedor. No es una lista de irregularidades.</p>
    <p className="lede">{data.resultados.length} par(es) priorizado(s). {data.limitation}</p>
    {data.resultados.length === 0 ? <p className="lede">Aún no hay pares semánticos: primero configure un proveedor, genere embeddings y ejecute una nueva corrida de señales.</p> : <table>
      <thead><tr><th>Prioridad</th><th>Municipalidad</th><th>Contrato A</th><th>Contrato B</th><th>Similitud</th></tr></thead>
      <tbody>{data.resultados.map((row) => <tr key={row.signalId}>
        <td><a href={`/senales/${encodeURIComponent(row.signalId)}`}>{row.signalType}</a></td>
        <td>{row.municipality}</td>
        <td><a href={`/contrataciones/${encodeURIComponent(row.contract.contractingId)}`}>{row.contract.object ?? row.contract.contractingId}</a><br /><small>{soles(row.contract.awardedAmount)} · {row.contract.publicationDate?.slice(0, 10) ?? "sin fecha"}</small></td>
        <td><a href={`/contrataciones/${encodeURIComponent(row.comparedContract.contractingId)}`}>{row.comparedContract.object ?? row.comparedContract.contractingId}</a><br /><small>{soles(row.comparedContract.awardedAmount)} · {row.comparedContract.publicationDate?.slice(0, 10) ?? "sin fecha"}</small></td>
        <td>{(row.similarity * 100).toFixed(1)}%</td>
      </tr>)}</tbody>
    </table>}
  </main>;
}
