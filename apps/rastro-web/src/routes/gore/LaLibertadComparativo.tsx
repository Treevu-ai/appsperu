import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import {
  getRadarEjecucionSectorComparativo,
  type SectorComparativoResponse,
  type SectorComparativoRow,
} from "../../lib/api-client.js";
import { AppUnavailableError, type Cobertura } from "../../lib/types.js";
import { CoverageBadge } from "../../components/CoverageBadge.js";
import { NumberWithMetadata, metaNumber } from "../../components/NumberWithMetadata.js";

const SECTORES_DEMO = ["TRANSPORTE", "SALUD", "EDUCACION", "AGRICULTURA", "VIVIENDA"];

const ESTADO_BADGE: Record<string, Cobertura> = {
  COMPLETA: "COMPLETA",
  PARCIAL: "PARCIAL",
  BLOQUEADA: "BLOQUEADA",
  NO_VERIFICADA: "BLOQUEADA",
};

export function LaLibertadComparativo() {
  const [searchParams, setSearchParams] = useSearchParams();
  const anioParam = searchParams.get("anio") ?? "2026";
  const sectoresParam = searchParams.get("sectores") ?? "TRANSPORTE,SALUD";
  const sectoresList = sectoresParam.split(",").map((s) => s.trim()).filter(Boolean);
  const [data, setData] = useState<SectorComparativoResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    (async () => {
      try {
        const res = await getRadarEjecucionSectorComparativo({
          anio: Number(anioParam),
          departamento: "LA LIBERTAD",
          sectores: sectoresList,
        });
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
  }, [anioParam, sectoresList.join(",")]);

  function toggleSector(sector: string) {
    const next = new Set(sectoresList);
    if (next.has(sector)) {
      next.delete(sector);
    } else {
      next.add(sector);
    }
    const params = new URLSearchParams(searchParams);
    if (next.size === 0) {
      params.delete("sectores");
    } else {
      params.set("sectores", [...next].join(","));
    }
    setSearchParams(params);
  }

  return (
    <div>
      <div className="card">
        <div className="flex items-end gap-3 flex-wrap">
          <label className="flex flex-col text-xs text-muted">
            Sectores
            <div className="mt-1 flex flex-wrap gap-2">
              {SECTORES_DEMO.map((s) => {
                const active = sectoresList.includes(s);
                return (
                  <button
                    key={s}
                    type="button"
                    onClick={() => toggleSector(s)}
                    className={`text-xs px-2 py-1 rounded border transition ${
                      active
                        ? "bg-accent/10 text-accent border-accent/40"
                        : "bg-ink-900 text-fg-soft border-line hover:border-fg-soft"
                    }`}
                  >
                    {s}
                  </button>
                );
              })}
            </div>
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
            <p className="text-danger text-sm">No se pudo obtener el comparativo.</p>
            <p className="text-fg-soft text-xs mt-1">{error}</p>
          </div>
        ) : data ? (
          <div className="card overflow-x-auto">
            <p className="text-xs text-muted">
              Comparativo descriptivo. Mantiene separadas la responsabilidad nacional dirigida al departamento y la
              ejecución regional por sede; no genera score ni suma ambos universos como si fueran uno solo.
            </p>

            <table className="mt-4 w-full text-sm min-w-[760px]">
              <thead className="text-xs text-muted text-left">
                <tr>
                  <th className="py-2 pr-3 whitespace-nowrap">Sector</th>
                  <th className="py-2 pr-3">Entidad</th>
                  <th className="py-2 pr-3 whitespace-nowrap">Alcance</th>
                  <th className="py-2 pr-3 text-right whitespace-nowrap">PIA</th>
                  <th className="py-2 pr-3 text-right whitespace-nowrap">PIM</th>
                  <th className="py-2 pr-3 text-right whitespace-nowrap">Devengado</th>
                  <th className="py-2 pr-3 whitespace-nowrap">Cobertura</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line-soft">
                {data.resultados.map((row: SectorComparativoRow) => {
                  const cob: Cobertura = ESTADO_BADGE[row.cobertura.estado] ?? "BLOQUEADA";
                  const fuenteRow = "radar-ejecucion / radar_ejecucion_sector_comparativo";
                  const corteRow = row.cobertura.fechaCorteParticion ?? `${data.anio}-12-31`;
                  return (
                    <tr key={`${row.sectorId}-${row.entityCode}`}>
                      <td className="py-2 pr-3 text-fg whitespace-nowrap">{row.sector}</td>
                      <td className="py-2 pr-3 text-fg-soft max-w-xs truncate" title={row.entidad}>{row.entidad}</td>
                      <td className="py-2 pr-3 text-fg-soft text-xs whitespace-nowrap">{row.alcance}</td>
                      <td className="py-2 pr-3 text-right text-fg whitespace-nowrap">
                        <NumberWithMetadata
                          data={metaNumber(row.pia, fuenteRow, corteRow, cob, "sector_entity_registry")}
                          format={(n) => n.toLocaleString("es-PE")}
                          suffix=""
                        />
                      </td>
                      <td className="py-2 pr-3 text-right text-fg whitespace-nowrap">
                        <NumberWithMetadata
                          data={metaNumber(row.pim, fuenteRow, corteRow, cob, "sector_entity_registry")}
                          format={(n) => n.toLocaleString("es-PE")}
                        />
                      </td>
                      <td className="py-2 pr-3 text-right text-accent whitespace-nowrap">
                        <NumberWithMetadata
                          data={metaNumber(row.devengado, fuenteRow, corteRow, cob, "sector_entity_registry")}
                          format={(n) => n.toLocaleString("es-PE")}
                        />
                      </td>
                      <td className="py-2 pr-3 whitespace-nowrap">
                        <CoverageBadge cobertura={cob} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>

            {data.limitation ? (
              <p className="mt-4 text-xs text-warn border-t border-line pt-3">⚠ {data.limitation}</p>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}
