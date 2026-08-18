import { SourceFootnote } from "@/components/SourceFootnote";
import { getInvestment } from "@/lib/api";
import { formatFecha, formatSoles, variacionCostoPct } from "@/lib/format";

interface PageProps {
  params: Promise<{ cui: string }>;
}

export default async function InversionPage({ params }: PageProps) {
  const { cui } = await params;
  const inv = await getInvestment(cui);
  const variacion = variacionCostoPct(inv.montoViable, inv.costoActualizado);

  return (
    <main>
      <p className="eyebrow">
        {inv.departamento ?? "Departamento sin especificar"} · CUI {inv.cui}
      </p>
      <h1>{inv.nombre}</h1>
      <p className="lede">
        {inv.nombreUep ?? inv.entidad ?? "Unidad ejecutora sin especificar"} · {inv.estado ?? "—"} /{" "}
        {inv.situacion ?? "—"}
      </p>

      <dl className="detail-grid">
        <div>
          <dt>Monto viable</dt>
          <dd>{formatSoles(inv.montoViable)}</dd>
        </div>
        <div>
          <dt>Costo actualizado</dt>
          <dd>{formatSoles(inv.costoActualizado)}</dd>
        </div>
        <div>
          <dt>Variación</dt>
          <dd>
            {variacion === null ? (
              "sin dato"
            ) : variacion > 0 ? (
              <span className="signal-chip candidata">+{variacion}%</span>
            ) : (
              `${variacion}%`
            )}
          </dd>
        </div>
        <div>
          <dt>Ubicación</dt>
          <dd style={{ fontSize: "1rem" }}>
            {inv.provincia ?? "—"} / {inv.distrito ?? "—"}
          </dd>
        </div>
        <div>
          <dt>Función</dt>
          <dd style={{ fontSize: "1rem" }}>{inv.funcion ?? "—"}</dd>
        </div>
        <div>
          <dt>Tipo</dt>
          <dd style={{ fontSize: "1rem" }}>{inv.tipoInversion ?? "—"}</dd>
        </div>
        <div>
          <dt>Fecha de registro</dt>
          <dd style={{ fontSize: "1rem" }}>{formatFecha(inv.fechaRegistro)}</dd>
        </div>
        <div>
          <dt>Fecha de viabilidad</dt>
          <dd style={{ fontSize: "1rem" }}>{formatFecha(inv.fechaViabilidad)}</dd>
        </div>
      </dl>

      {variacion !== null && variacion > 0 && (
        <p className="lede">
          El costo actualizado supera al monto viable en {variacion}%. Esto se presenta como
          variación de registro, no como irregularidad — requiere revisión del expediente para
          entender la causa (ver metodología del documento fuente, sección 7).
        </p>
      )}

      <p className="lede">
        <strong>Código SNIP:</strong> {inv.codigoSnip ?? "sin registro"}
        {inv.secEjec && (
          <>
            {" "}
            · <strong>SEC_EJEC:</strong> {inv.secEjec}
          </>
        )}
      </p>

      <SourceFootnote dataset={inv.fuente.dataset} extraidoEl={inv.fuente.extraidoEl} />
    </main>
  );
}
