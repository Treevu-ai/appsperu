import { getObservatorySignal } from "@/lib/api";

export const dynamic = "force-dynamic";

interface PageProps { params: Promise<{ id: string }> }
export default async function SenalDetallePage({ params }: PageProps) {
  const { id } = await params; const data = await getObservatorySignal(id); const signal = data.signal;
  return <main>
    <p className="eyebrow">{signal.signal_type} · Señal para revisión</p><h1>{signal.municipality_name}</h1>
    <p className="lede">{signal.explanation}</p><p><a href={`/contrataciones/${encodeURIComponent(signal.contracting_id)}`}>Ver contratación y evidencia →</a> · <a href="/senales">← Señales</a></p>
    <h2>Evidencia vinculada</h2><p>{data.evidence.length} referencia(s) a registros fuente utilizados por esta señal.</p>
    <p className="lede">{data.limitation}</p>
  </main>;
}
