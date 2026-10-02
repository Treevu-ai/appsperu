import { useEffect, useState } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { getRadarEjecucionSectorFicha, type SectorFichaResponse } from "../lib/api-client.js";
import { aggregateSectorBudget } from "../lib/sector-ficha.js";
import { AppUnavailableError } from "../lib/types.js";
import { CoverageBadge } from "../components/CoverageBadge.js";
import { SectorFichaSections } from "./gore/SectorFichaSections.js";
import { BudgetBlock } from "./gore/LaLibertadFicha.js";

const FUENTE = "radar-ejecucion / radar_ejecucion_sector_ficha";

/**
 * Ficha de un sector a nivel NACIONAL (GORE-05b) — hermana de
 * `/gore/la-libertad/ficha`, que es estrictamente regional por diseño del
 * PRD Capa Lectura. Esta ruta pide `ambito=NACIONAL` (PV-01) y por eso NO
 * tiene selector de departamento.
 *
 * `cobertura.estado` de cada entidad viene `"NO_VERIFICADA"` en modo
 * nacional (los snapshots de cobertura territorial son por departamento —
 * no existe uno nacional). Deliberadamente NO se reusa el mapeo de
 * `aggregateSectorBudget.cobertura` a `"BLOQUEADA"` (pensado para el caso
 * regional, donde sí implica un vacío de datos real) para el badge de
 * cabecera: eso pintaría rojo/"bloqueado" algo que en realidad es "no
 * verificable a esta escala", un mensaje distinto y menos alarmante. Se usa
 * `"NO_APLICA"` (gris, mismo valor que ya usa `Distrito.tsx` para métricas
 * sin cobertura territorial aplicable) + texto explícito.
 */
export function Sector() {
  const { sectorId } = useParams<{ sectorId: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const anioParam = searchParams.get("anio") ?? "2026";
  const [data, setData] = useState<SectorFichaResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!sectorId) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    (async () => {
      try {
        const ficha = await getRadarEjecucionSectorFicha({
          sectorId,
          anio: Number(anioParam),
          ambito: "NACIONAL",
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
  }, [sectorId, anioParam]);

  if (!sectorId) {
    return <p className="text-danger text-sm">Falta el identificador de sector en la ruta.</p>;
  }

  return (
    <div className="card">
      <div className="flex flex-wrap items-end gap-3">
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
          (() => {
            const budget = aggregateSectorBudget(data.entidades);
            return (
              <div>
                <div className="flex items-center gap-3 flex-wrap">
                  <h2 className="text-fg font-semibold">{data.sector.id}</h2>
                  <span className="text-xs text-muted uppercase tracking-wide">Ámbito nacional</span>
                </div>
                <div className="mt-2 flex items-center gap-2 flex-wrap">
                  <CoverageBadge cobertura="NO_APLICA" label="NO_VERIFICADA" />
                  <span className="text-xs text-muted">
                    Cobertura territorial: NO_VERIFICADA (agregado nacional, sin corte de cobertura por
                    departamento — los snapshots de cobertura territorial son por departamento).
                  </span>
                </div>
                <p className="text-xs text-muted mt-1">corte: {budget.corte} · matcher: {budget.matcher}</p>

                <div className="mt-6 space-y-6">
                  {budget.metaDepartamento.entidades > 0 ? (
                    <BudgetBlock
                      title="Gasto nacional (regla META_DEPARTAMENTO)"
                      totals={budget.metaDepartamento}
                      fuente={FUENTE}
                      corte={budget.corte}
                      cobertura="NO_APLICA"
                      matcher={budget.matcher}
                    />
                  ) : null}
                  {budget.sedeEjecutora.entidades > 0 ? (
                    <BudgetBlock
                      title="Ejecución nacional (regla SEDE_EJECUTORA)"
                      totals={budget.sedeEjecutora}
                      fuente={FUENTE}
                      corte={budget.corte}
                      cobertura="NO_APLICA"
                      matcher={budget.matcher}
                    />
                  ) : null}
                </div>

                <SectorFichaSections
                  data={data}
                  corte={budget.corte}
                  cobertura="NO_APLICA"
                  matcher={budget.matcher}
                />

                <p className="mt-6 text-xs text-muted">{data.advertenciaGasto}</p>
                <p className="mt-2 text-xs text-muted">{data.limitation}</p>
              </div>
            );
          })()
        ) : null}
      </div>
    </div>
  );
}
