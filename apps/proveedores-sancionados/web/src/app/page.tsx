import { SancionesResult } from "@/components/SancionesResult";
import { getSanciones } from "@/lib/api";

export const dynamic = "force-dynamic";

interface PageProps {
  searchParams: Promise<{ ruc?: string }>;
}

export default async function ProveedoresSancionadosPage({ searchParams }: PageProps) {
  const resolvedSearchParams = await searchParams;
  const ruc = resolvedSearchParams.ruc?.trim();
  const rucValido = ruc !== undefined && /^\d{8,11}$/.test(ruc);

  const data = rucValido ? await getSanciones(ruc) : null;

  return (
    <main>
      <p className="eyebrow">Follow the Sol · Tribunal de Contrataciones (RNP/OECE)</p>
      <h1>Proveedores sancionados</h1>
      <p className="lede">
        Inhabilitaciones y multas impuestas por el Tribunal de Contrataciones Públicas en los
        últimos 5 años. Busca por RUC — o revisa el{" "}
        <a href="/cruce">cruce con adjudicaciones reales de compras públicas →</a>
      </p>

      <form className="filters" method="get">
        <input name="ruc" placeholder="RUC (11 dígitos, ej. 20571603579)" defaultValue={ruc ?? ""} />
        <button type="submit">Buscar</button>
      </form>

      {ruc !== undefined && !rucValido && <p>El RUC debe tener entre 8 y 11 dígitos.</p>}
      {data && <SancionesResult data={data} />}

      <p className="source-footnote">
        Fuente: Tribunal de Contrataciones Públicas, vía el portal de consulta de RNP/OECE.
        Reporte de los últimos 5 años — una sanción más antigua no aparece aquí. Ver{" "}
        <code>docs/data-contracts/proveedores-sancionados.md</code> para el detalle completo.
      </p>
    </main>
  );
}
