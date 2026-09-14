import { useEffect, useState } from "react";
import {
  getIdentidadFiscalCrossref,
  getProveedoresSancionadosCrossref,
  type IdentidadFiscalCrossrefResponse,
  type ProveedoresSancionadosCrossrefResponse,
} from "../../lib/api-client.js";
import { ORIGEN_CONTRATO_LABEL } from "../../lib/origen-contrato.js";
import { AppUnavailableError } from "../../lib/types.js";
import {
  NumberWithMetadata,
  metaNumber,
} from "../../components/NumberWithMetadata.js";

const SIN_CORTE = "sin corte declarado por la fuente";

/**
 * CX-01 (backend, cerrado 2026-09-02) expuesto en la ficha GORE La Libertad —
 * quedó diferido a S3 en docs/TICKETS_GORE_La_Libertad_S1_v1.md y S2_v1.md.
 * Ninguno de los dos crossref (proveedores-sancionados, identidad-fiscal)
 * filtra por sector en el backend, solo por departamento — por eso esta
 * sección es intencionalmente independiente del selector de sector de arriba:
 * vista departamental completa, no un desglose del sector seleccionado.
 */
export function ProveedoresRiesgoSection() {
  return (
    <div className="mt-8 card">
      <h2 className="text-fg font-semibold">
        Riesgo de proveedores en La Libertad
      </h2>
      <p className="text-xs text-muted mt-1">
        Vista departamental completa — no filtrada por el sector seleccionado
        arriba, porque el cruce de proveedores no está segmentado por sector en
        el backend. Incluye tanto adjudicaciones OCDS (
        <strong className="text-fg-soft">awards</strong>) como contratos menores
        SEACE (<strong className="text-fg-soft">minor_contracts</strong>).
      </p>

      <div className="mt-6 space-y-8">
        <SancionadosSubsection />
        <IrregularesSubsection />
      </div>
    </div>
  );
}

function SancionadosSubsection() {
  const [data, setData] =
    useState<ProveedoresSancionadosCrossrefResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    (async () => {
      try {
        const result = await getProveedoresSancionadosCrossref({
          departamento: "LA LIBERTAD",
          soloInhabilitados: true,
          // Esta sección es de solo visualización — nunca debe "gastar" el
          // flag de nuevo desde la última corrida que usa el widget nacional
          // (ver getProveedoresSancionadosCrossref para el detalle).
          soloLectura: true,
        });
        if (!cancelled) setData(result);
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof AppUnavailableError
              ? err.message
              : (err as Error).message,
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <section>
      <h3 className="text-fg-soft font-medium text-sm">
        Proveedores sancionados con contratación registrada
      </h3>
      <p className="text-xs text-muted mt-1">
        Proveedores con inhabilitación vigente ante el Tribunal de
        Contrataciones que tienen al menos una contratación registrada en La
        Libertad — la fuente no indica si esa contratación específica sigue
        activa.
      </p>
      <div className="mt-3">
        {loading ? (
          <p className="text-muted text-sm">Consultando API…</p>
        ) : error ? (
          <div className="text-danger text-sm">
            <p>No se pudo obtener el cruce de sancionados.</p>
            <p className="text-fg-soft mt-1">{error}</p>
          </div>
        ) : !data || data.resultados.length === 0 ? (
          <p className="text-fg-soft text-sm">
            Sin proveedores sancionados con contrato vigente en La Libertad.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[820px]">
              <thead className="text-xs text-muted text-left">
                <tr>
                  <th className="py-2 pr-3">Proveedor</th>
                  <th className="py-2 pr-3 whitespace-nowrap">
                    Entidad compradora
                  </th>
                  <th className="py-2 pr-3 text-right whitespace-nowrap">
                    Monto
                  </th>
                  <th className="py-2 pr-3 whitespace-nowrap">
                    Fecha adjudicación
                  </th>
                  <th className="py-2 pr-3 whitespace-nowrap">Origen</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line-soft">
                {data.resultados.map((row) => (
                  <tr
                    key={`${row.origen}:${row.ocid ?? ""}:${row.awardId ?? ""}`}
                  >
                    <td
                      className="py-2 pr-3 text-fg max-w-xs truncate"
                      title={row.supplierId ?? undefined}
                    >
                      {row.supplierName ?? row.supplierId ?? "—"}
                    </td>
                    <td
                      className="py-2 pr-3 text-fg-soft max-w-xs truncate"
                      title={row.buyerName ?? undefined}
                    >
                      {row.buyerName ?? "—"}
                    </td>
                    <td className="py-2 pr-3 text-right text-fg">
                      {row.valorMonto != null ? (
                        <NumberWithMetadata
                          data={metaNumber(
                            row.valorMonto,
                            "proveedores-sancionados / proveedores_sancionados_crossref",
                            SIN_CORTE,
                            "NO_APLICA",
                          )}
                          suffix={row.valorMoneda ?? undefined}
                        />
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="py-2 pr-3 text-fg-soft whitespace-nowrap">
                      {row.fechaAdjudicacion
                        ? row.fechaAdjudicacion.slice(0, 10)
                        : "—"}
                    </td>
                    <td className="py-2 pr-3 text-fg-soft whitespace-nowrap">
                      {ORIGEN_CONTRATO_LABEL[row.origen]}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  );
}

function IrregularesSubsection() {
  const [data, setData] = useState<IdentidadFiscalCrossrefResponse | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    (async () => {
      try {
        const result = await getIdentidadFiscalCrossref({
          departamento: "LA LIBERTAD",
          soloIrregulares: true,
        });
        if (!cancelled) setData(result);
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof AppUnavailableError
              ? err.message
              : (err as Error).message,
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <section>
      <h3 className="text-fg-soft font-medium text-sm">
        Proveedores con estado tributario irregular
      </h3>
      <p className="text-xs text-muted mt-1">
        Proveedores encontrados en el padrón SUNAT cuyo estado de contribuyente
        o condición de domicilio no es regular (no ACTIVO/HABIDO), según el
        padrón consultado.
      </p>
      <div className="mt-3">
        {loading ? (
          <p className="text-muted text-sm">Consultando API…</p>
        ) : error ? (
          <div className="text-danger text-sm">
            <p>No se pudo obtener el cruce con el padrón RUC.</p>
            <p className="text-fg-soft mt-1">{error}</p>
          </div>
        ) : !data || data.resultados.length === 0 ? (
          <p className="text-fg-soft text-sm">
            Sin proveedores con estado tributario irregular en La Libertad.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[820px]">
              <thead className="text-xs text-muted text-left">
                <tr>
                  <th className="py-2 pr-3">Proveedor</th>
                  <th className="py-2 pr-3 whitespace-nowrap">
                    Entidad compradora
                  </th>
                  <th className="py-2 pr-3 text-right whitespace-nowrap">
                    Monto
                  </th>
                  <th className="py-2 pr-3 whitespace-nowrap">
                    Estado contribuyente
                  </th>
                  <th className="py-2 pr-3 whitespace-nowrap">
                    Condición domicilio
                  </th>
                  <th className="py-2 pr-3 whitespace-nowrap">Origen</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line-soft">
                {data.resultados.map((row) => (
                  <tr
                    key={`${row.origen}:${row.ocid ?? ""}:${row.awardId ?? ""}`}
                  >
                    <td
                      className="py-2 pr-3 text-fg max-w-xs truncate"
                      title={row.supplierId ?? undefined}
                    >
                      {row.supplierName ?? row.supplierId ?? "—"}
                    </td>
                    <td
                      className="py-2 pr-3 text-fg-soft max-w-xs truncate"
                      title={row.buyerName ?? undefined}
                    >
                      {row.buyerName ?? "—"}
                    </td>
                    <td className="py-2 pr-3 text-right text-fg">
                      {row.valorMonto != null ? (
                        <NumberWithMetadata
                          data={metaNumber(
                            row.valorMonto,
                            "identidad-fiscal / identidad_fiscal_crossref",
                            SIN_CORTE,
                            "NO_APLICA",
                          )}
                          suffix={row.valorMoneda ?? undefined}
                        />
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="py-2 pr-3 text-fg-soft whitespace-nowrap">
                      {row.estadoContribuyente ?? "—"}
                    </td>
                    <td className="py-2 pr-3 text-fg-soft whitespace-nowrap">
                      {row.condicionDomicilio ?? "—"}
                    </td>
                    <td className="py-2 pr-3 text-fg-soft whitespace-nowrap">
                      {ORIGEN_CONTRATO_LABEL[row.origen]}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  );
}
