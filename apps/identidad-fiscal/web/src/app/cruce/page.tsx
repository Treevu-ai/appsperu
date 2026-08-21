import { EntidadCrossrefTable } from "@/components/EntidadCrossrefTable";
import { ProveedorCrossrefTable } from "@/components/ProveedorCrossrefTable";
import { getCrossrefEntidades, getCrossrefProveedores } from "@/lib/api";

// Datos en vivo por request, nunca pre-renderizado. Además de la regla
// general de esta app (ver page.tsx), acá es crítico: /api/crossref/entidades
// recalcula el matcher difuso contra ~2.3M contribuyentes en cada llamada
// (30-60s) — intentar pre-renderizarlo en build time cuelga el build entero
// (confirmado en vivo: "Generating static pages" nunca avanzaba sin esto).
export const dynamic = "force-dynamic";

const DEFAULT_DEPARTAMENTO = "LA LIBERTAD";

interface PageProps {
  searchParams: Promise<{ departamento?: string }>;
}

export default async function CrucePage({ searchParams }: PageProps) {
  const resolvedSearchParams = await searchParams;
  const departamento = resolvedSearchParams.departamento ?? DEFAULT_DEPARTAMENTO;

  const [proveedores, entidades] = await Promise.all([
    getCrossrefProveedores(departamento),
    getCrossrefEntidades(departamento),
  ]);

  const proveedoresIrregulares = proveedores.resultados.filter((r) => r.irregular).length;
  const entidadesConfirmadas = entidades.resultados.filter((r) => r.confidence === "confirmada").length;
  const entidadesCandidatas = entidades.resultados.filter((r) => r.confidence === "candidata").length;

  return (
    <main>
      <p className="eyebrow">Follow the Sol · Cruce de identidad fiscal</p>
      <h1>Proveedores × entidades × padrón RUC</h1>
      <p className="lede">
        Dos cruces distintos, con rigor distinto. El de proveedores es por <strong>RUC exacto</strong>{" "}
        (ya viene embebido en <code>supplier_id</code> de compras-publicas). El de entidades es por{" "}
        <strong>nombre difuso</strong> — no existe RUC compartido del lado gobierno/municipalidad,
        así que cada match trae su nivel de confianza explícito.
      </p>

      <div className="stat-row">
        <div className="stat-card">
          <div className="stat-label">Adjudicaciones cruzadas</div>
          <div className="stat-value">{proveedores.resultados.length}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Proveedores irregulares</div>
          <div className="stat-value">{proveedoresIrregulares}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Entidades — match exacto</div>
          <div className="stat-value">{entidadesConfirmadas}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Entidades — match difuso</div>
          <div className="stat-value">{entidadesCandidatas}</div>
        </div>
      </div>

      <h2>Proveedores (compras-publicas ↔ padrón RUC)</h2>
      <p className="lede">
        Estatus tributario reportado al corte del padrón (hoy) — no necesariamente el estatus al
        momento de la adjudicación. Un proveedor irregular hoy pudo estar activo cuando ganó el
        contrato; solo casos recientes sostienen un hallazgo sin ese matiz.
      </p>
      <ProveedorCrossrefTable rows={proveedores.resultados} />

      <h2 style={{ marginTop: 40 }}>Entidades (radar-ejecucion ↔ padrón RUC)</h2>
      <p className="lede">
        {entidades.totalMatches} de {entidades.totalEntidades} entidades de {departamento} resueltas
        a un RUC — el resto no encontró un candidato con suficiente similitud de nombre.
      </p>
      <EntidadCrossrefTable rows={entidades.resultados} />

      <p className="source-footnote">
        Fuentes: SUNAT (Padrón Reducido RUC), OSCE/OCDS (compras-publicas), MEF (radar-ejecucion).
        Cruce de entidades por matcher difuso — ver <code>src/crossref/match.ts</code> y{" "}
        <code>docs/data-contracts/sunat-padron-ruc.md</code>.
      </p>
    </main>
  );
}
