import { SourceFootnote } from "@/components/SourceFootnote";
import { getSupplierDetail } from "@/lib/api";
import { formatFecha, formatSoles } from "@/lib/format";

interface PageProps {
  params: Promise<{ supplierId: string }>;
}

export default async function ProveedorPage({ params }: PageProps) {
  const { supplierId } = await params;
  const proveedor = await getSupplierDetail(supplierId);
  const valorTotal = proveedor.adjudicaciones.reduce((sum, a) => sum + (a.valorMonto ?? 0), 0);
  const entidadesDistintas = new Set(proveedor.adjudicaciones.map((a) => a.buyerId)).size;

  return (
    <main>
      <p className="eyebrow">Follow the Sol · Ficha de proveedor</p>
      <h1>{proveedor.supplierName}</h1>
      <p className="lede">
        <strong>RUC / ID:</strong> {proveedor.supplierId} · <a href="/proveedores">← Proveedores</a>
      </p>

      <div className="stat-row">
        <div className="stat-card">
          <div className="stat-label">Adjudicaciones</div>
          <div className="stat-value">{proveedor.adjudicaciones.length}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Entidades distintas</div>
          <div className="stat-value">{entidadesDistintas}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Valor total</div>
          <div className="stat-value">{formatSoles(valorTotal)}</div>
        </div>
      </div>

      <table data-testid="supplier-awards-table">
        <thead>
          <tr>
            <th>Entidad compradora</th>
            <th>Departamento</th>
            <th>Monto</th>
            <th>Fecha</th>
            <th>OCID</th>
          </tr>
        </thead>
        <tbody>
          {proveedor.adjudicaciones.map((a) => (
            <tr key={`${a.ocid}-${a.awardId}`}>
              <td>{a.buyerName ?? "sin dato"}</td>
              <td>{a.departamento ?? "sin dato"}</td>
              <td>{formatSoles(a.valorMonto)}</td>
              <td>{formatFecha(a.fecha)}</td>
              <td>{a.ocid}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <SourceFootnote
        dataset="OECE - Contrataciones Abiertas (OCDS)"
        extraidoEl={proveedor.adjudicaciones[0]?.fuente.extraidoEl}
      />
    </main>
  );
}
