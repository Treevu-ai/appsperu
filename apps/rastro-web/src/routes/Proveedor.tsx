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
import { Modal } from "../components/Modal.js";

interface SupplierMatch {
  ruc: string;
  supplierName: string;
  valorTotal: number;
  adjudicaciones: number;
  hhiSubconjunto: number;
}

export function Proveedor() {
  const { ruc = "" } = useParams();
  const valid = /^\d{11}$/.test(ruc);

  const [identidad, setIdentidad] = useState<ContribuyenteResponse | null>(null);
  const [sanciones, setSanciones] = useState<SancionesResponse | null>(null);
  const [adjudicaciones, setAdjudicaciones] = useState<SupplierMatch | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [citeModalOpen, setCiteModalOpen] = useState(false);

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
          // OJO: el endpoint no acepta filtro por RUC ni por supplier_id —
          // trae todos los proveedores (nacional, sin acotar por
          // departamento) y se busca acá el que matchea. `awards.supplier_id`
          // usa el formato `PE-RUC-<ruc>` (confirmado en
          // identidad-fiscal/src/routes/crossref.ts) — no hay campo `ruc`
          // separado en la respuesta de este endpoint.
          getComprasPublicasSuppliers({}),
        ]);
        if (cancelled) return;
        if (identidadRes.status === "fulfilled") setIdentidad(identidadRes.value);
        if (sancionesRes.status === "fulfilled") setSanciones(sancionesRes.value);
        if (supRes.status === "fulfilled") {
          const found = supRes.value.resultados.find((s) => s.supplierId === `PE-RUC-${ruc}`);
          if (found) {
            setAdjudicaciones({
              ruc,
              supplierName: found.supplierName,
              valorTotal: found.valorTotal,
              adjudicaciones: found.adjudicaciones,
              hhiSubconjunto: supRes.value.concentracion.hhi,
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
      <button
        type="button"
        onClick={() => setCiteModalOpen(true)}
        className="text-xs text-accent underline-offset-2 hover:underline"
      >
        Citar Rastro →
      </button>

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
            <CoverageBadge cobertura="NO_APLICA" />
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
                    "sin corte declarado por la fuente",
                    "NO_APLICA",
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
                    "sin corte declarado por la fuente",
                    "NO_APLICA",
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
                    "sin corte declarado por la fuente",
                    "NO_APLICA",
                  )}
                />
              </dd>
            </div>
          </dl>
          <p className="text-xs text-muted mt-3">
            {adjudicaciones.supplierName} · el endpoint no declara fecha de corte ni matcher para esta consulta.
          </p>
        </section>
      ) : null}

      <Modal open={citeModalOpen} onClose={() => setCiteModalOpen(false)} title="Citar Rastro">
        <p className="text-sm text-fg-soft">
          Copia el bloque de citación. Si alguna sección de esta página está vacía, esa ausencia también forma parte
          de la cita — no la omitas.
        </p>
        <pre className="mt-3 text-xs bg-ink-950 border border-line rounded-md p-3 overflow-x-auto text-fg-soft whitespace-pre-wrap">
          <code>
            {`Rastro v0.1.0 · identidad-fiscal / identidad_fiscal_contribuyente_by_ruc · corte ${
              identidad?.corte ?? "sin corte declarado por la fuente"
            } · cobertura ${identidad?.cobertura ?? "NO_APLICA"} · ${
              typeof window !== "undefined" ? window.location.href : `https://rastro.fyi/proveedor/${ruc}`
            }`}
          </code>
        </pre>
        <p className="text-xs text-muted mt-3">
          Ver{" "}
          <a href="/citar-rastro.md" className="text-accent underline-offset-2 hover:underline">
            guía completa de citación
          </a>{" "}
          — incluye qué NO se puede concluir de estos datos.
        </p>
      </Modal>
    </div>
  );
}
