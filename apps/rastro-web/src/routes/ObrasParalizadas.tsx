import { useEffect, useMemo, useState } from "react";
import {
  getInfobrasPublicWorks,
  getProveedoresSancionadosCrossref,
  type InfobrasPublicWorksOrderBy,
  type ProveedoresSancionadosCrossrefResponse,
  type PublicWork,
  type PublicWorksResponse,
} from "../lib/api-client.js";
import { AppUnavailableError } from "../lib/types.js";
import { ORIGEN_CONTRATO_LABEL } from "../lib/origen-contrato.js";
import { CoverageBadge } from "../components/CoverageBadge.js";
import {
  NumberWithMetadata,
  metaNumber,
} from "../components/NumberWithMetadata.js";

const FUENTE = "infobras / infobras_public_works";
const SIN_CORTE = "sin corte declarado por la fuente";
const PAGE_SIZE = 50;

const ORDER_BY_OPTIONS: { value: InfobrasPublicWorksOrderBy; label: string }[] =
  [
    { value: "diasParalizado_desc", label: "Días paralizado (mayor primero)" },
    { value: "montoViable_desc", label: "Monto viable (mayor primero)" },
    { value: "nombre_asc", label: "Nombre de obra (A-Z)" },
  ];

/**
 * Ranking nacional de obras paralizadas (GORE-06b, PV-03/PV-04). Esta vista
 * es específicamente sobre obras paralizadas — a diferencia de
 * `Distrito.tsx` (que lista el universo completo de un departamento), acá
 * `conParalizacion=true` es constante: sin ese filtro el universo nacional
 * de INFOBRAS son ~191k filas (ver docs/ESTADO.md), no algo razonable de
 * traer a un solo fetch. `diasParalizadoMin` es un umbral adicional
 * opcional sobre ese universo ya filtrado.
 *
 * Sin `sectorEntidad`, es exactamente el ranking nacional que documentó
 * PV-04 (referencia 2026-09-12: 1,319 obras +180 días) — mismo endpoint,
 * cero filtro adicional. Paginación de cliente porque PV-04 difirió
 * explícitamente la paginación de backend (ver docs/TICKETS_GORE_La_Libertad_S2_v1.md).
 */
/** Ventana de debounce para los inputs de texto/número — evita un fetch nacional por cada tecla. */
const FILTER_DEBOUNCE_MS = 400;

export function ObrasParalizadas() {
  const [sectorEntidad, setSectorEntidad] = useState("");
  const [diasParalizadoMinInput, setDiasParalizadoMinInput] = useState("180");
  const [orderBy, setOrderBy] = useState<InfobrasPublicWorksOrderBy>(
    "diasParalizado_desc",
  );
  const [page, setPage] = useState(0);

  const [data, setData] = useState<PublicWorksResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // Debounce: `sectorEntidad`/`diasParalizadoMinInput` cambian carácter por
  // carácter en cada tecla — sin esto, escribir "PRODUCE" dispara 7 fetches
  // sucesivos contra un endpoint que documenta ~191k filas de universo sin
  // filtrar (revisión de GORE-06b).
  const [debouncedSector, setDebouncedSector] = useState(sectorEntidad);
  const [debouncedDiasMinInput, setDebouncedDiasMinInput] = useState(
    diasParalizadoMinInput,
  );
  useEffect(() => {
    const id = setTimeout(() => {
      setDebouncedSector(sectorEntidad);
      setDebouncedDiasMinInput(diasParalizadoMinInput);
    }, FILTER_DEBOUNCE_MS);
    return () => clearTimeout(id);
  }, [sectorEntidad, diasParalizadoMinInput]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    setPage(0);
    (async () => {
      try {
        // Un valor vacío, no numérico o negativo se trata como "sin mínimo"
        // — el input HTML `min={0}` no impide escribir "-5" en la mayoría de
        // navegadores (GORE-06b), y mandarlo tal cual solo produciría un 400
        // del backend en vez de una degradación silenciosa razonable.
        const parsedDiasMin = Number(debouncedDiasMinInput);
        const diasParalizadoMin =
          debouncedDiasMinInput.trim() === "" ||
          Number.isNaN(parsedDiasMin) ||
          parsedDiasMin < 0
            ? undefined
            : parsedDiasMin;
        const result = await getInfobrasPublicWorks({
          conParalizacion: true,
          sectorEntidad:
            debouncedSector.trim() === ""
              ? undefined
              : debouncedSector.trim().toUpperCase(),
          diasParalizadoMin,
          orderBy,
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
  }, [debouncedSector, debouncedDiasMinInput, orderBy]);

  const totalPaginas = data
    ? Math.max(1, Math.ceil(data.resultados.length / PAGE_SIZE))
    : 1;
  const filasPagina = useMemo(() => {
    if (!data) return [];
    const start = page * PAGE_SIZE;
    return data.resultados.slice(start, start + PAGE_SIZE);
  }, [data, page]);

  return (
    <div className="max-w-5xl mx-auto px-6 py-12">
      <p className="text-xs text-muted font-mono">
        RANKING NACIONAL · INFOBRAS
      </p>
      <h1 className="font-serif text-3xl text-fg mt-2">Obras paralizadas</h1>
      <p className="text-fg-soft mt-2 max-w-3xl">
        Ranking nacional de obras con paralización vigente registrada en
        INFOBRAS, sin acotar a ningún departamento. Sin filtro de sector, es el
        mismo universo que el ranking nacional (referencia 2026-09-12: 1,319
        obras +180 días — puede variar según el corte más reciente).
      </p>

      <div className="mt-6 card">
        <div className="flex flex-wrap items-end gap-3">
          <label className="flex flex-col text-xs text-muted">
            Sector (sector_entidad exacto de INFOBRAS)
            <input
              type="text"
              value={sectorEntidad}
              onChange={(e) => setSectorEntidad(e.target.value)}
              placeholder="ej. PRODUCE"
              className="mt-1 bg-ink-900 border border-line rounded-md px-3 py-2 text-fg w-56"
            />
          </label>
          <label className="flex flex-col text-xs text-muted">
            Días paralizado (mínimo)
            <input
              type="number"
              value={diasParalizadoMinInput}
              min={0}
              onChange={(e) => setDiasParalizadoMinInput(e.target.value)}
              placeholder="sin mínimo"
              className="mt-1 bg-ink-900 border border-line rounded-md px-3 py-2 text-fg w-32"
            />
          </label>
          <label className="flex flex-col text-xs text-muted">
            Orden
            <select
              value={orderBy}
              onChange={(e) =>
                setOrderBy(e.target.value as InfobrasPublicWorksOrderBy)
              }
              className="mt-1 bg-ink-900 border border-line rounded-md px-3 py-2 text-fg"
            >
              {ORDER_BY_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="mt-6">
          {loading ? (
            <p className="text-muted text-sm">Consultando API…</p>
          ) : error ? (
            <div className="text-danger text-sm">
              <p>No se pudo obtener el ranking.</p>
              <p className="text-fg-soft mt-1">{error}</p>
            </div>
          ) : !data || data.resultados.length === 0 ? (
            <p className="text-fg-soft text-sm">
              Sin obras paralizadas para estos filtros. Prueba quitar el sector
              o bajar el mínimo de días.
            </p>
          ) : (
            <>
              <div className="flex items-center gap-3 flex-wrap">
                <h2 className="text-fg font-semibold">
                  {data.resultados.length} obras paralizadas
                </h2>
                <CoverageBadge cobertura="NO_APLICA" />
              </div>
              <p className="text-xs text-muted mt-1">
                El endpoint no declara fecha de corte, matcher ni cobertura para
                esta consulta.
              </p>

              <div className="mt-4 overflow-x-auto">
                <table className="w-full text-sm min-w-[880px]">
                  <thead className="text-xs text-muted text-left">
                    <tr>
                      <th className="py-2 pr-3">Obra</th>
                      <th className="py-2 pr-3 whitespace-nowrap">
                        Entidad / sector
                      </th>
                      <th className="py-2 pr-3 text-right whitespace-nowrap">
                        Días paral.
                      </th>
                      <th className="py-2 pr-3 text-right whitespace-nowrap">
                        Monto viable
                      </th>
                      <th className="py-2 pr-3 text-right whitespace-nowrap">
                        Cost Drift
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line-soft">
                    {filasPagina.map((w: PublicWork) => (
                      <tr key={w.codigoInfobras}>
                        <td
                          className="py-2 pr-3 text-fg max-w-sm truncate"
                          title={w.nombreObra}
                        >
                          {w.nombreObra}
                        </td>
                        <td
                          className="py-2 pr-3 text-fg-soft max-w-xs truncate"
                          title={w.entidadNombre}
                        >
                          {w.entidadNombre}
                          {w.sectorEntidad ? (
                            <span className="text-muted">
                              {" "}
                              · {w.sectorEntidad}
                            </span>
                          ) : null}
                        </td>
                        <td className="py-2 pr-3 text-right text-fg">
                          {w.diasParalizado != null ? (
                            <NumberWithMetadata
                              data={metaNumber(
                                w.diasParalizado,
                                FUENTE,
                                SIN_CORTE,
                                "NO_APLICA",
                              )}
                            />
                          ) : (
                            "—"
                          )}
                        </td>
                        <td className="py-2 pr-3 text-right text-fg">
                          {w.montoViable != null ? (
                            <NumberWithMetadata
                              data={metaNumber(
                                w.montoViable,
                                FUENTE,
                                SIN_CORTE,
                                "NO_APLICA",
                              )}
                              suffix="S/"
                            />
                          ) : (
                            "—"
                          )}
                        </td>
                        <td
                          className="py-2 pr-3 text-right text-fg"
                          title="(Costo actualizado − Monto viable) / Monto viable"
                        >
                          {w.costDriftPct != null ? (
                            <NumberWithMetadata
                              data={metaNumber(
                                w.costDriftPct,
                                `${FUENTE} (signals.costDriftPct)`,
                                SIN_CORTE,
                                "NO_APLICA",
                              )}
                              format={(n) =>
                                `${n > 0 ? "+" : ""}${n.toFixed(1)}%`
                              }
                              className={
                                w.costDriftPct > 0 ? "text-warn" : undefined
                              }
                            />
                          ) : (
                            "—"
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {totalPaginas > 1 ? (
                <div className="mt-4 flex items-center gap-3 text-xs text-muted">
                  <button
                    type="button"
                    disabled={page === 0}
                    onClick={() => setPage((p) => Math.max(0, p - 1))}
                    className="btn-ghost px-3 py-1 disabled:opacity-40"
                  >
                    ← Anterior
                  </button>
                  <span>
                    Página {page + 1} de {totalPaginas} · Mostrando{" "}
                    {filasPagina.length} de {data.resultados.length}
                  </span>
                  <button
                    type="button"
                    disabled={page >= totalPaginas - 1}
                    onClick={() =>
                      setPage((p) => Math.min(totalPaginas - 1, p + 1))
                    }
                    className="btn-ghost px-3 py-1 disabled:opacity-40"
                  >
                    Siguiente →
                  </button>
                </div>
              ) : null}
            </>
          )}
        </div>
      </div>

      <SancionadosNuevosSection />
    </div>
  );
}

/**
 * Sancionados nuevos (GORE-06c, PV-05/PV-06): proveedores con inhabilitación
 * vigente detectados por primera vez en esta corrida, a nivel nacional
 * (`departamento=TODOS`). Comparte pantalla con el ranking de obras
 * paralizadas porque ambos son vigilancia nacional de bajo esfuerzo del
 * mismo PRD — sin dependencia entre los dos fetches (secciones
 * independientes, cada una con su propio loading/error).
 *
 * "Nuevo" = detectado por primera vez por este cruce, no "sanción reciente"
 * — un caso puede llevar años inhabilitado y aparecer acá si es la primera
 * vez que el cruce lo ve (ej. la tabla de "vistos" recién se creó o el
 * departamento nunca se había consultado con `soloNuevos=true`). Texto
 * explícito abajo para no sugerir lo contrario.
 *
 * Solo lectura — no envía notificaciones (correo/Slack/webhook). PV-06 lo
 * dejó explícito: no hay infraestructura de notificación en el repo, y
 * agregarla es una decisión de producto aparte, fuera de este ticket.
 *
 * RUC deliberadamente SIN enmascarar: es el identificador tributario público
 * de una empresa (SUNAT), no un dato personal — el resto de la app ya lo
 * muestra sin enmascarar (ej. la URL de `/proveedor/:ruc`). Enmascararlo acá
 * habría sido inconsistente con esa convención existente.
 */
function SancionadosNuevosSection() {
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
          departamento: "TODOS",
          soloInhabilitados: true,
          soloNuevos: true,
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
    <div className="mt-8 card">
      <h2 className="text-fg font-semibold">Sancionados nuevos (nacional)</h2>
      <p className="text-xs text-muted mt-1">
        Proveedores con inhabilitación vigente ante el Tribunal de
        Contrataciones detectados por{" "}
        <strong className="text-fg-soft">primera vez en esta corrida</strong> —
        "nuevo" describe cuándo se detectó, no cuándo se sancionó: un caso puede
        tener años de inhabilitado y aparecer acá si es la primera vez que este
        cruce lo revisa. Solo lectura, sin envío de notificaciones.
      </p>

      <div className="mt-4">
        {loading ? (
          <p className="text-muted text-sm">Consultando API…</p>
        ) : error ? (
          <div className="text-danger text-sm">
            <p>No se pudo obtener el cruce de sancionados.</p>
            <p className="text-fg-soft mt-1">{error}</p>
          </div>
        ) : !data || data.resultados.length === 0 ? (
          <p className="text-fg-soft text-sm">
            Sin casos nuevos desde la última corrida.
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
                          suffix={row.valorMoneda ?? "S/"}
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
    </div>
  );
}
