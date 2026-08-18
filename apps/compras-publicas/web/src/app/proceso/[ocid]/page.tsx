import { SourceFootnote } from "@/components/SourceFootnote";
import { getProcurementProcess } from "@/lib/api";
import { formatCategoria, formatFecha, formatSoles } from "@/lib/format";

interface PageProps {
  params: Promise<{ ocid: string }>;
}

export default async function ProcesoPage({ params }: PageProps) {
  const { ocid } = await params;
  const proceso = await getProcurementProcess(ocid);

  return (
    <main>
      <p className="eyebrow">
        {proceso.departamento ?? "Departamento sin especificar"} · {proceso.sourceId ?? "fuente sin identificar"}
      </p>
      <h1>{proceso.buyerName}</h1>
      <p className="lede">{proceso.titulo ?? "Proceso sin título registrado"}</p>

      <div>
        {proceso.tags.map((tag) => (
          <span className="tag-chip" key={tag}>
            {tag}
          </span>
        ))}
      </div>

      <dl className="detail-grid" style={{ marginTop: 24 }}>
        <div>
          <dt>Categoría</dt>
          <dd>{formatCategoria(proceso.categoria)}</dd>
        </div>
        <div>
          <dt>Valor referencial</dt>
          <dd>{formatSoles(proceso.valorMonto)}</dd>
        </div>
        <div>
          <dt>Provincia / distrito</dt>
          <dd>
            {proceso.provincia ?? "—"} / {proceso.distrito ?? "—"}
          </dd>
        </div>
        <div>
          <dt>Publicado</dt>
          <dd>{formatFecha(proceso.fechaPublicacion)}</dd>
        </div>
        <div>
          <dt>Período de licitación</dt>
          <dd>
            {formatFecha(proceso.tenderInicio)} — {formatFecha(proceso.tenderFin)}
          </dd>
        </div>
      </dl>

      <p className="lede">
        <strong>OCID:</strong> {proceso.ocid}
        {proceso.tenderId && (
          <>
            {" "}
            · <strong>Expediente:</strong> {proceso.tenderId}
          </>
        )}
      </p>

      <SourceFootnote dataset={proceso.fuente.dataset} extraidoEl={proceso.fuente.extraidoEl} />
    </main>
  );
}
