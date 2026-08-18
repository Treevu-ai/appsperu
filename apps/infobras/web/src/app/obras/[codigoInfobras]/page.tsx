import { SourceFootnote } from "@/components/SourceFootnote";
import { getPublicWork } from "@/lib/api";
import { formatFecha, formatPct, formatSoles } from "@/lib/format";

interface PageProps {
  params: Promise<{ codigoInfobras: string }>;
}

export default async function ObraPage({ params }: PageProps) {
  const { codigoInfobras } = await params;
  const obra = await getPublicWork(codigoInfobras);

  return (
    <main>
      <p className="eyebrow">
        {obra.departamento} · {obra.provincia ?? "sin provincia"} · {obra.distrito ?? "sin distrito"}
      </p>
      <h1>{obra.nombreObra}</h1>
      <p className="lede">{obra.entidadNombre}</p>

      <div>
        {obra.existeParalizacion && <span className="signal-chip alerta">paralizada</span>}
        {obra.costDriftPct !== null && obra.costDriftPct >= 20 && (
          <span className="signal-chip candidata">cost drift alto ({obra.costDriftPct.toFixed(1)}%)</span>
        )}
        {obra.estadoEjecucion && <span className="tag-chip">{obra.estadoEjecucion}</span>}
      </div>

      <dl className="detail-grid" style={{ marginTop: 24 }}>
        <div>
          <dt>Monto viable / aprobado</dt>
          <dd>{formatSoles(obra.montoViable)}</dd>
        </div>
        <div>
          <dt>Costo actualizado</dt>
          <dd>{formatSoles(obra.costoActualizado)}</dd>
        </div>
        <div>
          <dt>Avance físico real</dt>
          <dd>{formatPct(obra.avanceFisicoRealPct)}</dd>
        </div>
        <div>
          <dt>Ejecución financiera</dt>
          <dd>{formatPct(obra.ejecucionFinancieraPct)}</dd>
        </div>
        <div>
          <dt>Gap físico-financiero</dt>
          <dd>{obra.gapFisicoFinanciero === null ? "sin dato" : `${obra.gapFisicoFinanciero.toFixed(1)} pp`}</dd>
        </div>
      </dl>

      {obra.existeParalizacion && (
        <dl className="detail-grid">
          <div>
            <dt>Causal de paralización</dt>
            <dd>{obra.causalParalizacion ?? "sin dato"}</dd>
          </div>
          <div>
            <dt>Fecha de paralización</dt>
            <dd>{formatFecha(obra.fechaParalizacion)}</dd>
          </div>
          <div>
            <dt>Días paralizado</dt>
            <dd>{obra.diasParalizado ?? "sin dato"}</dd>
          </div>
        </dl>
      )}

      <p className="lede">
        <strong>Código INFOBRAS:</strong> {obra.codigoInfobras}
        {obra.cui && (
          <>
            {" "}
            · <strong>CUI:</strong> {obra.cui}
          </>
        )}
      </p>

      <SourceFootnote dataset={obra.fuente.dataset} extraidoEl={obra.fuente.extraidoEl} />
    </main>
  );
}
