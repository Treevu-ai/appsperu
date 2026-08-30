import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import {
  getComprasPublicasSuppliers,
  getIdentidadFiscalContribuyente,
  getProveedoresSancionadosPorRuc,
  type ContribuyenteResponse,
  type SancionesResponse,
} from "../lib/api-client.js";
import { AppUnavailableError } from "../lib/types.js";
import { CoverageBadge } from "../components/CoverageBadge.js";
import { NumberWithMetadata, metaNumber } from "../components/NumberWithMetadata.js";

interface SupplierMatch {
  ruc: string;
  razonSocial: string;
  valorTotal: number;
  adjudicaciones: number;
  hhiSubconjunto: number;
  cobertura: "COMPLETA" | "PARCIAL" | "BLOQUEADA";
  matcher: string;
  corte: string;
}

export function Proveedor() {
  const { ruc = "" } = useParams();
  const valid = /^\d{11}$/.test(ruc);

  const [identidad, setIdentidad] = useState<ContribuyenteResponse | null>(null);
  const [sanciones, setSanciones] = useState<SancionesResponse | null>(null);
  const [adjudicaciones, setAdjudicaciones] = useState<SupplierMatch | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!valid) {
      setLoading(false);
      setError("RUC inválido. Debe tener exactamente 11 dígitos.");
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    (async () => {
      try {
        const [identidadRes, sancionesRes, supRes] = await Promise.allSettled([
          getIdentidadFiscalContribuyente(ruc),
          getProveedoresSancionadosPorRuc(ruc),
          // OJO: el endpoint actual filtra por departamento. Para el perfil
          // individual, en Sprint 12 lo reemplazaremos por
          // `getComprasPublicasSupplierById(ruc)` cuando exista
          // coincidencia RUC↔supplier_id. Mientras tanto, consultamos
          // proveedores del departamento de domicilio.
          getComprasPublicasSuppliers({}),
        ]);
        if (cancelled) return;
        if (identidadRes.status === "fulfilled") setIdentidad(identidadRes.value);
        if (sancionesRes.status === "fulfilled") setSanciones(sancionesRes.value);
        if (supRes.status === "fulfilled") {
          const found = supRes.value.items.find((s) => s.ruc === ruc);
          if (found) {
            setAdjudicaciones({
              ruc: found.ruc ?? ruc,
              razonSocial: found.razonSocial,
              valorTotal: found.valorTotal,
              adjudicaciones: found.adjudicaciones,
              hhiSubconjunto: supRes.value.concentracion.hhi,
              cobertura: supRes.value.cobertura,
              matcher: supRes.value.matcher,
              corte: supRes.value.corte,
            });
          }
        }
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
  }, [ruc, valid]);

  if (!valid) {
    return (
      <div className="max-w-3xl mx-auto px-6 py-12">
        <h1 className="font-serif text-3xl text-fg">Proveedor</h1>
        <p className="text-danger mt-4">{error ?? "RUC inválido."}</p>
        <p className="text-muted text-sm mt-2">Formato esperado: 11 dígitos sin guiones.</p>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto px-6 py-12 space-y-6">
      <p className="text-xs text-muted font-mono">LECTOR PRENSA · RUC {ruc}</p>
      <h1 className="font-serif text-3xl text-fg">Perfil de proveedor</h1>
      <p className="text-fg-soft text-sm">
        Identidad SUNAT, contrataciones públicas y sanciones del Tribunal. La ausencia de un dato se declara como
        vacío, no como conclusión.
      </p>

      {loading ? <p className="text-muted">Consultando 3 APIs en paralelo…</p> : null}

      {!loading && identidad ? (
        <section className="card">
          <div className="flex items-center gap-3">
            <h2 className="text-fg font-semibold">Identidad</h2>
            <CoverageBadge cobertura={identidad.cobertura} />
          </div>
          <dl className="mt-4 grid sm:grid-cols-2 gap-3 text-sm">
            <div>
              <dt className="text-muted text-xs">Razón social</dt>
              <dd className="text-fg">{identidad.value.razonSocial}</dd>
            </div>
            <div>
              <dt className="text-muted text-xs">Estado SUNAT</dt>
              <dd className="text-fg">{identidad.value.estado}</dd>
            </div>
            <div>
              <dt className="text-muted text-xs">Condición</dt>
              <dd className="text-fg">{identidad.value.condicion}</dd>
            </div>
            {identidad.value.ubigeo ? (
              <div>
                <dt className="text-muted text-xs">UBIGEO</dt>
                <dd className="text-fg mono-num">{identidad.value.ubigeo}</dd>
              </div>
            ) : null}
          </dl>
          <p className="text-xs text-muted mt-3">
            matcher: {identidad.matcher} · corte: {identidad.corte}
          </p>
        </section>
      ) : null}

      {!loading && sanciones ? (
        <section className="card">
          <div className="flex items-center gap-3">
            <h2 className="text-fg font-semibold">Sanciones</h2>
            <CoverageBadge cobertura={sanciones.cobertura} />
          </div>
          {sanciones.items.length === 0 ? (
            <p className="text-fg-soft text-sm mt-3">No se registran sanciones en el periodo cubierto.</p>
          ) : (
            <ul className="mt-3 space-y-2 text-sm">
              {sanciones.items.map((s, i) => (
                <li key={i} className="flex items-center gap-3">
                  <span className="text-fg">{s.tipo}</span>
                  <span className="text-xs text-muted">{s.estado}</span>
                  {s.expediente ? (
                    <span className="text-xs text-muted mono-num">exp. {s.expediente}</span>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
          <p className="text-xs text-muted mt-3">matcher: {sanciones.matcher} · corte: {sanciones.corte}</p>
        </section>
      ) : null}

      {!loading && adjudicaciones ? (
        <section className="card">
          <div className="flex items-center gap-3">
            <h2 className="text-fg font-semibold">Contrataciones</h2>
            <CoverageBadge cobertura={adjudicaciones.cobertura} />
          </div>
          <dl className="mt-4 grid sm:grid-cols-2 gap-3 text-sm">
            <div>
              <dt className="text-muted text-xs">Valor total adjudicado</dt>
              <dd className="text-fg">
                S/{" "}
                <NumberWithMetadata
                  data={metaNumber(
                    adjudicaciones.valorTotal,
                    "compras-publicas / compras_publicas_suppliers",
                    adjudicaciones.corte,
                    adjudicaciones.cobertura,
                    adjudicaciones.matcher,
                  )}
                />
              </dd>
            </div>
            <div>
              <dt className="text-muted text-xs">Adjudicaciones</dt>
              <dd className="text-fg">
                <NumberWithMetadata
                  data={metaNumber(
                    adjudicaciones.adjudicaciones,
                    "compras-publicas / compras_publicas_suppliers",
                    adjudicaciones.corte,
                    adjudicaciones.cobertura,
                    adjudicaciones.matcher,
                  )}
                />
              </dd>
            </div>
            <div>
              <dt className="text-muted text-xs">HHI del subconjunto</dt>
              <dd className="text-fg">
                <NumberWithMetadata
                  data={metaNumber(
                    adjudicaciones.hhiSubconjunto,
                    "compras-publicas / compras_publicas_suppliers",
                    adjudicaciones.corte,
                    adjudicaciones.cobertura,
                    adjudicaciones.matcher,
                  )}
                />
              </dd>
            </div>
          </dl>
          <p className="text-xs text-muted mt-3">
            matcher: {adjudicaciones.matcher} · corte: {adjudicaciones.corte}
          </p>
        </section>
      ) : null}
    </div>
  );
}
