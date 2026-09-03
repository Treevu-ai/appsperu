import { useEffect, useState } from "react";
import {
  getInfobrasCrossrefEjecucion,
  type InfobrasCrossrefEjecucionRow,
} from "../../lib/api-client.js";
import { AppUnavailableError } from "../../lib/types.js";
import { CoverageBadge } from "../../components/CoverageBadge.js";
import { NumberWithMetadata, metaNumber } from "../../components/NumberWithMetadata.js";

type ConfidenceFilter = "todas" | "confirmada" | "candidata";

/**
 * Crosswalk INFOBRAS↔radar-ejecucion por nombre de entidad (matcher difuso,
 * `entity_crosswalk`) — resolución de identidad avanzada del PRD de
 * INFOBRAS (ver docs/adr/0002-infobras-app-standalone-y-cruce-por-cui.md,
 * actualización 2026-09-02). Cruza el devengado presupuestal de una entidad
 * (MEF) con las obras físicas de esa misma entidad (INFOBRAS) — permite ver,
 * por ejemplo, una entidad con alto devengado y varias obras paralizadas.
 */
export function EntidadesInfobras() {
  const [filter, setFilter] = useState<ConfidenceFilter>("todas");
  const [resultados, setResultados] = useState<InfobrasCrossrefEjecucionRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    (async () => {
      try {
        const res = await getInfobrasCrossrefEjecucion({
          confidence: filter === "todas" ? undefined : filter,
        });
        if (!cancelled) setResultados(res.resultados);
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
  }, [filter]);

  return (
    <div className="max-w-5xl mx-auto px-6 py-12">
      <p className="text-xs text-muted font-mono">LECTOR AUDITORÍA · CROSSWALK MEF↔INFOBRAS</p>
      <h1 className="font-serif text-3xl text-fg mt-2">Entidades cruzadas: presupuesto y obras</h1>
      <p className="text-fg-soft mt-2 max-w-3xl">
        Cruce por nombre de entidad (matcher difuso, sin clave exacta compartida entre las dos fuentes) entre el
        devengado presupuestal de radar-ejecucion (MEF) y las obras físicas de INFOBRAS. Cada fila declara su nivel
        de confianza — <strong className="text-fg">confirmada</strong> o{" "}
        <strong className="text-fg">candidata</strong> — no hay match sin score.
      </p>

      <div className="mt-6 flex gap-2 text-xs">
        {(["todas", "confirmada", "candidata"] as const).map((f) => (
          <button
            key={f}
            type="button"
            onClick={() => setFilter(f)}
            className={`px-3 py-1.5 rounded-full border font-mono uppercase transition ${
              filter === f
                ? "border-accent text-accent bg-accent/10"
                : "border-line text-muted hover:text-fg-soft hover:border-line-soft"
            }`}
          >
            {f}
          </button>
        ))}
      </div>

      {loading ? <p className="text-muted mt-6">Consultando API…</p> : null}
      {!loading && error ? <p className="text-danger mt-6">{error}</p> : null}

      {!loading && resultados ? (
        <div className="mt-6 card overflow-x-auto">
          <h2 className="text-fg font-semibold">{resultados.length} entidades cruzadas</h2>

          {resultados.length === 0 ? (
            <p className="text-fg-soft text-sm mt-4">Sin entidades cruzadas para este filtro.</p>
          ) : (
            <table className="mt-6 w-full text-sm min-w-[760px]">
              <thead className="text-xs text-muted text-left">
                <tr>
                  <th className="py-2 pr-3">Entidad (MEF)</th>
                  <th className="py-2 pr-3">Entidad (INFOBRAS)</th>
                  <th className="py-2 pr-3 whitespace-nowrap">Confianza</th>
                  <th className="py-2 pr-3 text-right whitespace-nowrap">Devengado</th>
                  <th className="py-2 pr-3 text-right whitespace-nowrap">Obras</th>
                  <th className="py-2 pr-3 text-right whitespace-nowrap">Paralizadas</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line-soft">
                {resultados.map((r) => (
                  <tr key={`${r.ejecucionEntityCode}-${r.infobrasCodigoEntidad}`}>
                    <td className="py-2 pr-3 text-fg max-w-xs truncate" title={r.ejecucionNombre}>{r.ejecucionNombre}</td>
                    <td className="py-2 pr-3 text-fg-soft max-w-xs truncate" title={r.infobrasEntidadNombre}>{r.infobrasEntidadNombre}</td>
                    <td className="py-2 pr-3 whitespace-nowrap">
                      <CoverageBadge
                        cobertura={r.confidence === "confirmada" ? "COMPLETA" : "PARCIAL"}
                        label={r.confidence}
                      />
                    </td>
                    <td className="py-2 pr-3 text-right text-fg whitespace-nowrap">
                      S/{" "}
                      <NumberWithMetadata
                        data={metaNumber(
                          r.devengado,
                          "infobras / infobras_crossref_ejecucion",
                          r.coberturaTemporal?.cortesUsados.join(", ") ?? "sin corte declarado",
                          r.coberturaTemporal?.estado ?? "NO_APLICA",
                        )}
                      />
                    </td>
                    <td className="py-2 pr-3 text-right text-fg-soft whitespace-nowrap">{r.obras}</td>
                    <td className="py-2 pr-3 text-right whitespace-nowrap">
                      {r.obrasParalizadas > 0 ? (
                        <span className="text-danger">{r.obrasParalizadas}</span>
                      ) : (
                        <span className="text-fg-soft">0</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <p className="text-xs text-muted mt-3">
            El score y la confianza vienen del matcher difuso de nombres — no implican que la entidad esté
            correctamente identificada al 100%; "candidata" pide revisión manual antes de citarse como hecho.
          </p>
        </div>
      ) : null}
    </div>
  );
}
