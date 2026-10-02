import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { getRadarEjecucionBenchmark, type BenchmarkResponse } from "../../lib/api-client.js";
import { AppUnavailableError } from "../../lib/types.js";
import { NumberWithMetadata, metaNumber } from "../../components/NumberWithMetadata.js";

const ENTIDADES_DEMO = [
  { code: "831", label: "Transporte La Libertad (GR)" },
  { code: "832", label: "Salud La Libertad (GR)" },
  { code: "999", label: "Entidad sin cohorte suficiente" },
];

export function LaLibertadBenchmark() {
  const [searchParams, setSearchParams] = useSearchParams();
  const entityCode = searchParams.get("entityCode") ?? "831";
  const anioParam = searchParams.get("anio") ?? "2026";
  const [data, setData] = useState<BenchmarkResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [httpStatus, setHttpStatus] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    setHttpStatus(null);
    (async () => {
      try {
        const res = await getRadarEjecucionBenchmark({
          entityCode,
          anio: Number(anioParam),
        });
        if (!cancelled) setData(res);
      } catch (err) {
        if (!cancelled) {
          if (err instanceof AppUnavailableError) {
            setHttpStatus(err.status ?? null);
            setError(err.message);
          } else {
            setError((err as Error).message);
          }
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [entityCode, anioParam]);

  const fuente = "radar-ejecucion / radar_ejecucion_benchmark";
  const matcher = "nivel_gobierno + funcion + regla v1";
  const cobertura = data?.status === "ok" ? "COMPLETA" : "BLOQUEADA";
  const corte = data?.fechaCorte ?? "—";

  return (
    <div>
      <div className="card">
        <div className="flex items-end gap-3 flex-wrap">
          <label className="flex flex-col text-xs text-muted">
            Entidad
            <select
              value={entityCode}
              onChange={(e) => {
                const next = new URLSearchParams(searchParams);
                next.set("entityCode", e.target.value);
                setSearchParams(next);
              }}
              className="mt-1 bg-ink-900 border border-line rounded-md px-3 py-2 text-fg"
            >
              {ENTIDADES_DEMO.map((e) => (
                <option key={e.code} value={e.code}>
                  {e.code} · {e.label}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col text-xs text-muted">
            Año
            <input
              type="number"
              value={anioParam}
              min={2015}
              max={2030}
              onChange={(e) => {
                const next = new URLSearchParams(searchParams);
                next.set("anio", e.target.value);
                setSearchParams(next);
              }}
              className="mt-1 bg-ink-900 border border-line rounded-md px-3 py-2 text-fg w-28"
            />
          </label>
        </div>
      </div>

      <div className="mt-6">
        {loading ? (
          <p className="text-muted text-sm">Consultando API…</p>
        ) : error ? (
          <div className="card border-danger/30">
            <p className="text-danger text-sm">
              {httpStatus ? `HTTP ${httpStatus} · ` : ""}No se pudo obtener el benchmark.
            </p>
            <p className="text-fg-soft text-xs mt-1">{error}</p>
          </div>
        ) : data ? (
          <div className="card">
            {data.status === "ok" ? (
              <div>
                <div className="flex items-center gap-3 flex-wrap">
                  <h2 className="text-fg font-semibold">Entidad {data.entityCode}</h2>
                  <span className="text-xs text-muted">
                    cohorte · n ={" "}
                    <NumberWithMetadata
                      data={metaNumber(data.n ?? 0, fuente, corte, cobertura, matcher)}
                    />
                  </span>
                </div>

                <div className="mt-6 grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-xs text-muted">Percentil de avance</p>
                    <p className="text-3xl text-accent">
                      <NumberWithMetadata
                        data={metaNumber(data.percentil ?? 0, fuente, corte, cobertura, matcher)}
                        format={(n) => `P${n}`}
                      />
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-muted">Mediana de la cohorte</p>
                    <p className="text-3xl text-fg">
                      <NumberWithMetadata
                        data={metaNumber(data.medianaAvancePct ?? 0, fuente, corte, cobertura, matcher)}
                        format={(n) => `${n.toFixed(1)}%`}
                      />
                    </p>
                  </div>
                </div>

                {data.criterios ? (
                  <p className="mt-6 text-xs text-muted border-t border-line pt-3">
                    <strong className="text-fg-soft">Criterios de la cohorte:</strong> {data.criterios}
                  </p>
                ) : null}
                {data.exclusiones ? (
                  <p className="mt-1 text-xs text-muted">
                    <strong className="text-fg-soft">Exclusiones:</strong> {data.exclusiones}
                  </p>
                ) : null}
              </div>
            ) : (
              <div>
                <div className="flex items-center gap-3 flex-wrap">
                  <h2 className="text-fg font-semibold">Entidad {data.entityCode}</h2>
                  <span className="text-xs text-warn font-mono uppercase">datos_insuficientes</span>
                </div>
                <p className="text-fg-soft text-sm mt-3">
                  La cohorte tiene solo <span className="mono-num text-fg">{data.n ?? 0}</span> entidades; el mínimo
                  requerido es <span className="mono-num text-fg">{data.minRequerido ?? "?"}</span>. No se publica
                  benchmark sin base suficiente.
                </p>
                {data.criterios ? (
                  <p className="mt-3 text-xs text-muted border-t border-line pt-3">
                    <strong className="text-fg-soft">Criterios intentados:</strong> {data.criterios}
                  </p>
                ) : null}
              </div>
            )}
            <p className="mt-6 text-xs text-muted">corte: {data.fechaCorte}</p>
          </div>
        ) : null}
      </div>
    </div>
  );
}
