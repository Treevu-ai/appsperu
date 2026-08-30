import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { getRadarEjecucionSectorFicha, type SectorFichaResponse } from "../../lib/api-client.js";
import { AppUnavailableError } from "../../lib/types.js";
import { CoverageBadge } from "../../components/CoverageBadge.js";
import { NumberWithMetadata, metaNumber } from "../../components/NumberWithMetadata.js";

const SECTORES = [
  "TRANSPORTE",
  "SALUD",
  "EDUCACION",
  "AGRICULTURA",
  "VIVIENDA",
  "ENERGIA_MINAS",
  "PRODUCE",
  "AMBIENTAL",
  "JUSTICIA",
  "DEFENSA",
  "INTERIOR",
  "TRABAJO",
  "COMERCIO_EXTERIOR_TURISMO",
  "CULTURA",
  "ECONOMIA_FINANZAS",
];

export function LaLibertadFicha() {
  const [searchParams, setSearchParams] = useSearchParams();
  const sectorParam = searchParams.get("sector") ?? "TRANSPORTE";
  const anioParam = searchParams.get("anio") ?? "2026";
  const [data, setData] = useState<SectorFichaResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    (async () => {
      try {
        const ficha = await getRadarEjecucionSectorFicha({
          sectorId: sectorParam,
          anio: Number(anioParam),
          departamento: "LA LIBERTAD",
        });
        if (!cancelled) setData(ficha);
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
  }, [sectorParam, anioParam]);

  return (
    <div className="card">
      <div className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col text-xs text-muted">
          Sector
          <select
            value={sectorParam}
            onChange={(e) => {
              const next = new URLSearchParams(searchParams);
              next.set("sector", e.target.value);
              setSearchParams(next);
            }}
            className="mt-1 bg-ink-900 border border-line rounded-md px-3 py-2 text-fg"
          >
            {SECTORES.map((s) => (
              <option key={s} value={s}>
                {s}
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

      <div className="mt-6">
        {loading ? (
          <p className="text-muted text-sm">Consultando API…</p>
        ) : error ? (
          <div className="text-danger text-sm">
            <p>No se pudo obtener la ficha.</p>
            <p className="text-fg-soft mt-1">{error}</p>
          </div>
        ) : data ? (
          <div>
            <div className="flex items-center gap-3 flex-wrap">
              <h2 className="text-fg font-semibold">{data.sectorId}</h2>
              <CoverageBadge cobertura={data.cobertura} />
              <span className="text-xs text-muted">corte: {data.corte}</span>
            </div>
            <p className="text-xs text-muted mt-1">
              matcher: {data.matcher} · regla: {data.regla}
            </p>

            <div className="mt-6 grid grid-cols-3 gap-4">
              <div>
                <p className="text-xs text-muted">PIA</p>
                <p className="text-2xl text-fg">
                  <NumberWithMetadata
                    data={metaNumber(
                      data.pia,
                      "radar-ejecucion / radar_ejecucion_sector_ficha",
                      data.corte,
                      data.cobertura,
                      data.matcher,
                    )}
                    suffix="S/"
                  />
                </p>
              </div>
              <div>
                <p className="text-xs text-muted">PIM</p>
                <p className="text-2xl text-fg">
                  <NumberWithMetadata
                    data={metaNumber(
                      data.pim,
                      "radar-ejecucion / radar_ejecucion_sector_ficha",
                      data.corte,
                      data.cobertura,
                      data.matcher,
                    )}
                    suffix="S/"
                  />
                </p>
              </div>
              <div>
                <p className="text-xs text-muted">Devengado</p>
                <p className="text-2xl text-accent">
                  <NumberWithMetadata
                    data={metaNumber(
                      data.devengado,
                      "radar-ejecucion / radar_ejecucion_sector_ficha",
                      data.corte,
                      data.cobertura,
                      data.matcher,
                    )}
                    suffix="S/"
                  />
                </p>
              </div>
            </div>

            <p className="mt-6 text-xs text-muted">
              Reglas territoriales: las entidades nacionales se consultan por gasto dirigido al departamento
              (meta_departamento); las regionales, por la unidad ejecutora con sede en La Libertad. Esta vista no
              suma ambos universos.
            </p>
          </div>
        ) : null}
      </div>
    </div>
  );
}
