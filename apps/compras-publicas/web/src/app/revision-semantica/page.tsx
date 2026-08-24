import { getSemanticReviewClusters } from "@/lib/api";

export const dynamic = "force-dynamic";

const soles = (value: number | null) => value === null ? "sin monto" : new Intl.NumberFormat("es-PE", { style: "currency", currency: "PEN", maximumFractionDigits: 0 }).format(value);

export default async function RevisionSemanticaPage() {
  const data = await getSemanticReviewClusters();
  return <main>
    <p className="eyebrow">Observatorio · Revisión documental</p>
    <h1>Clusters semánticamente comparables</h1>
    <p className="lede">La bandeja agrupa contratos comparables por embeddings y ventana temporal. S13 añade el mismo proveedor. No es una lista de irregularidades.</p>
    <p className="lede">{data.resultados.length} cluster(s) priorizado(s). {data.limitation}</p>
    {data.resultados.length === 0 ? <p className="lede">Aún no hay clusters semánticos: primero configure un proveedor, genere embeddings y ejecute una nueva corrida de señales.</p> : <table>
      <thead><tr><th>Señales</th><th>Municipalidad</th><th>Contratos</th><th>Monto agregado</th><th>Similitud</th></tr></thead>
      <tbody>{data.resultados.map((row) => <tr key={row.clusterId}>
        <td>{row.signalTypes.join(", ")}<br /><small>{row.reviewStatus}</small></td>
        <td>{row.municipality}</td>
        <td>{row.contracts.slice(0, 3).map((contract) => <div key={contract.contractingId}><a href={`/contrataciones/${encodeURIComponent(contract.contractingId)}`}>{contract.object ?? contract.contractingId}</a><br /><small>{soles(contract.awardedAmount)} · {contract.publicationDate?.slice(0, 10) ?? "sin fecha"}</small></div>)}{row.contractCount > 3 && <small>+ {row.contractCount - 3} contrato(s)</small>}</td>
        <td>{soles(row.totalAmount)}</td>
        <td>{(row.similarity * 100).toFixed(1)}%</td>
      </tr>)}</tbody>
    </table>}
  </main>;
}
