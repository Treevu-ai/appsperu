import { getObservatorySignals } from "@/lib/api";

export const dynamic = "force-dynamic";

interface PageProps { searchParams: Promise<{ signalType?: string }> }

export default async function SenalesPage({ searchParams }: PageProps) {
  const { signalType } = await searchParams; const data = await getObservatorySignals(signalType);
  return <main>
    <p className="eyebrow">Observatorio · Señales para revisión</p><h1>Patrones observables</h1>
    <p className="lede">Cada señal enlaza evidencia y una explicación reproducible. No determina corrupción, favorecimiento, fraccionamiento ni incumplimiento.</p>
    <p className="lede"><a href="/revision-semantica">Abrir bandeja de revisión semántica →</a></p>
    <form className="filters" method="get"><select name="signalType" defaultValue={signalType ?? ""}><option value="">Todas las señales</option>{["S01","S02","S03","S04","S05","S06","S07","S08","S09","S10","S11","S12","S13"].map((type) => <option key={type} value={type}>{type}</option>)}</select><button type="submit">Filtrar</button></form>
    <p className="lede">{data.resultados.length} señal(es). {data.limitation}</p>
    <table><thead><tr><th>Señal</th><th>Municipalidad</th><th>Contratación</th><th>Explicación</th><th>Confianza técnica</th></tr></thead><tbody>
      {data.resultados.map((row) => <tr key={row.signal_id}><td><a href={`/senales/${encodeURIComponent(row.signal_id)}`}>{row.signal_type}</a><br /><small>{row.severity}</small></td><td>{row.municipality_name}</td><td><a href={`/contrataciones/${encodeURIComponent(row.contracting_id)}`}>{row.object_original ?? row.contracting_id}</a></td><td>{row.explanation}</td><td>{row.confidence}</td></tr>)}
    </tbody></table>
  </main>;
}
