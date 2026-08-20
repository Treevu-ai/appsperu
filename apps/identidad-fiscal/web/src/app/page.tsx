import { ContribuyenteTable } from "@/components/ContribuyenteTable";
import { getContribuyentes } from "@/lib/api";

// Datos en vivo por request, nunca pre-renderizado — sin esto Next intenta
// generar esta página en build time y se queda esperando la API.
export const dynamic = "force-dynamic";

interface PageProps {
  searchParams: Promise<{ razonSocial?: string; estado?: string; ubigeo?: string }>;
}

export default async function IdentidadFiscalPage({ searchParams }: PageProps) {
  const resolvedSearchParams = await searchParams;
  const { resultados } = await getContribuyentes(resolvedSearchParams);

  const activos = resultados.filter((r) => r.estadoContribuyente === "ACTIVO").length;
  const conUbigeo = resultados.filter((r) => r.ubigeo !== null).length;

  return (
    <main>
      <p className="eyebrow">Follow the Sol · Padrón RUC (SUNAT)</p>
      <h1>Identidad fiscal</h1>
      <p className="lede">
        Personas jurídicas (RUC-20) del Padrón Reducido RUC de SUNAT, filtradas a la ingesta real
        de este proyecto. Busca por razón social para ver estado tributario, condición de
        domicilio y ubigeo — o revisa los{" "}
        <a href="/cruce">cruces con proveedores y entidades del Estado →</a>
      </p>

      <div className="stat-row">
        <div className="stat-card">
          <div className="stat-label">Resultados</div>
          <div className="stat-value">{resultados.length}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Activos</div>
          <div className="stat-value">{activos}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Con ubigeo</div>
          <div className="stat-value">{conUbigeo}</div>
        </div>
      </div>

      <form className="filters" method="get">
        <input
          name="razonSocial"
          placeholder="Razón social (ej. CHAVIMOCHIC)"
          defaultValue={resolvedSearchParams.razonSocial ?? ""}
        />
        <select name="estado" defaultValue={resolvedSearchParams.estado ?? ""}>
          <option value="">Todos los estados</option>
          <option value="ACTIVO">Activo</option>
          <option value="BAJA DE OFICIO">Baja de oficio</option>
          <option value="BAJA DEFINITIVA">Baja definitiva</option>
          <option value="SUSPENSION TEMPORAL">Suspensión temporal</option>
        </select>
        <button type="submit">Buscar</button>
      </form>

      <ContribuyenteTable rows={resultados} />

      <p className="source-footnote">
        Fuente: Padrón Reducido RUC (SUNAT), datos abiertos, filtrado a personas jurídicas
        (RUC-20) en la ingesta. Ver{" "}
        <code>docs/data-contracts/sunat-padron-ruc.md</code> para el detalle de cobertura y
        limitaciones.
      </p>
    </main>
  );
}
