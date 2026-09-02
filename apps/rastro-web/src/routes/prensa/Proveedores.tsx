import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { getComprasPublicasSuppliers, type SuppliersResponse } from "../../lib/api-client.js";
import { AppUnavailableError } from "../../lib/types.js";
import { NumberWithMetadata, metaNumber } from "../../components/NumberWithMetadata.js";

// Piloto Rastro: mismas 5 regiones que el resto de la app (ver docs/conectores.md).
const DEPARTAMENTOS = ["LA LIBERTAD", "LAMBAYEQUE", "PIURA", "CAJAMARCA", "CUSCO"] as const;

const FUENTE = "compras-publicas / compras_publicas_suppliers";
// El endpoint /api/suppliers no declara fecha de corte por request — es
// honesto mostrar eso en vez de inventar una fecha.
const SIN_CORTE = "sin corte declarado por la fuente";

export function Proveedores() {
  const [params, setParams] = useSearchParams();
  const departamento = params.get("departamento") ?? "LA LIBERTAD";

  const [data, setData] = useState<SuppliersResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    setData(null);
    (async () => {
      try {
        const res = await getComprasPublicasSuppliers({ departamento });
        if (!cancelled) setData(res);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof AppUnavailableError ? err.message : (err as Error).message);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [departamento]);

  const totalValor = data ? data.resultados.reduce((sum, r) => sum + r.valorTotal, 0) : 0;

  return (
    <div className="max-w-5xl mx-auto px-6 py-12">
      <p className="text-xs text-muted font-mono">LECTOR PRENSA · RANKING DE PROVEEDORES</p>
      <h1 className="font-serif text-3xl text-fg mt-2">Proveedores y concentración de mercado</h1>
      <p className="text-fg-soft mt-2 max-w-3xl">
        Adjudicaciones OCDS (OECE) agregadas por proveedor. Solo números — sin score de riesgo ni umbral de color.
        Un HHI alto describe concentración de mercado, no irregularidad.
      </p>

      <div className="mt-6 flex flex-wrap gap-2">
        {DEPARTAMENTOS.map((d) => (
          <button
            key={d}
            type="button"
            onClick={() => setParams({ departamento: d })}
            className={`px-3 py-1.5 rounded-md text-sm border transition ${
              d === departamento
                ? "bg-accent/10 text-accent border-accent/30"
                : "text-fg-soft border-line hover:text-fg hover:bg-ink-800"
            }`}
          >
            {d}
          </button>
        ))}
      </div>

      {loading ? <p className="text-muted mt-6">Consultando API…</p> : null}
      {!loading && error ? <p className="text-danger mt-6">{error}</p> : null}

      {!loading && data && data.resultados.length === 0 ? (
        <p className="text-fg-soft mt-8">
          No hay proveedores con adjudicaciones registradas para este departamento.{" "}
          <a href="/docs/api" className="text-accent underline-offset-2 hover:underline">
            Ver documentación del conector
          </a>
          .
        </p>
      ) : null}

      {!loading && data && data.resultados.length > 0 ? (
        <div className="mt-8 card overflow-x-auto">
          <div className="flex flex-wrap items-center gap-4 text-sm">
            <span className="text-fg-soft">
              CR3:{" "}
              <NumberWithMetadata
                data={metaNumber(data.concentracion.cr3, FUENTE, SIN_CORTE, "NO_APLICA")}
                format={(n) => `${n.toFixed(1)}%`}
              />
            </span>
            <span className="text-fg-soft">
              CR5:{" "}
              <NumberWithMetadata
                data={metaNumber(data.concentracion.cr5, FUENTE, SIN_CORTE, "NO_APLICA")}
                format={(n) => `${n.toFixed(1)}%`}
              />
            </span>
            <span className="text-fg-soft">
              HHI:{" "}
              <NumberWithMetadata data={metaNumber(data.concentracion.hhi, FUENTE, SIN_CORTE, "NO_APLICA")} />
            </span>
            <span className="text-fg-soft">
              Proveedores considerados:{" "}
              <NumberWithMetadata
                data={metaNumber(data.concentracion.proveedoresConsiderados, FUENTE, SIN_CORTE, "NO_APLICA")}
              />
            </span>
          </div>

          <table className="mt-6 w-full text-sm">
            <thead className="text-xs text-muted text-left">
              <tr>
                <th className="py-2 pr-3">Proveedor</th>
                <th className="py-2 pr-3">Supplier ID</th>
                <th className="py-2 pr-3 text-right">Valor total (S/)</th>
                <th className="py-2 pr-3 text-right">% participación</th>
                <th className="py-2 pr-3 text-right">Adjudicaciones</th>
                <th className="py-2 pr-3 text-right">Entidades distintas</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line-soft">
              {data.resultados.slice(0, 50).map((s) => (
                <tr key={s.supplierId}>
                  <td className="py-2 pr-3 text-fg">{s.supplierName}</td>
                  <td className="py-2 pr-3 mono-num text-fg-soft text-xs">{s.supplierId}</td>
                  <td className="py-2 pr-3 text-right text-fg">
                    <NumberWithMetadata data={metaNumber(s.valorTotal, FUENTE, SIN_CORTE, "NO_APLICA")} />
                  </td>
                  <td className="py-2 pr-3 text-right text-fg">
                    <NumberWithMetadata
                      data={metaNumber(
                        totalValor > 0 ? (s.valorTotal / totalValor) * 100 : 0,
                        FUENTE,
                        SIN_CORTE,
                        "NO_APLICA",
                      )}
                      format={(n) => `${n.toFixed(1)}%`}
                    />
                  </td>
                  <td className="py-2 pr-3 text-right text-fg">
                    <NumberWithMetadata data={metaNumber(s.adjudicaciones, FUENTE, SIN_CORTE, "NO_APLICA")} />
                  </td>
                  <td className="py-2 pr-3 text-right text-fg">
                    <NumberWithMetadata data={metaNumber(s.entidadesDistintas, FUENTE, SIN_CORTE, "NO_APLICA")} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {data.resultados.length > 50 ? (
            <p className="text-xs text-muted mt-3">Mostrando primeros 50 de {data.resultados.length} proveedores.</p>
          ) : null}
          <p className="text-xs text-muted mt-3">
            El endpoint <code className="mono-num">/api/suppliers</code> no declara fecha de corte, cobertura ni
            matcher por respuesta — a diferencia de otras vistas de Rastro. Los números vienen verbatim de la API,
            sin metadata de frescura adicional que mostrar.
          </p>
        </div>
      ) : null}
    </div>
  );
}
