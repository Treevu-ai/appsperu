import { useEffect, useState } from "react";
import { AppUnavailableError, type Cobertura, type WithMetadata } from "../lib/types.js";
import { getRadarEjecucionMetaSources, type MetaSource } from "../lib/api-client.js";

type FreshnessState =
  | { status: "loading" }
  | { status: "unavailable"; message: string }
  | { status: "ok"; latest: WithMetadata<MetaSource> | null };

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;
const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

function ageInDays(iso: string): number {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return Number.POSITIVE_INFINITY;
  return (Date.now() - t) / (24 * 60 * 60 * 1000);
}

function colorForAge(daysOld: number, cobertura: Cobertura): "green" | "amber" | "red" {
  if (cobertura === "BLOQUEADA") return "red";
  if (daysOld > THIRTY_DAYS_MS / (24 * 60 * 60 * 1000)) return "red";
  if (daysOld > SEVEN_DAYS_MS / (24 * 60 * 60 * 1000)) return "amber";
  return "green";
}

export function DataFreshnessBar() {
  const [state, setState] = useState<FreshnessState>({ status: "loading" });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await getRadarEjecucionMetaSources();
        if (cancelled) return;
        const items = data.items ?? [];
        if (items.length === 0) {
          setState({ status: "ok", latest: null });
          return;
        }
        const sorted = [...items].sort((a, b) => Date.parse(b.runAt) - Date.parse(a.runAt));
        const latest = sorted[0];
        const cobertura: Cobertura = latest.cobertura ?? "PARCIAL";
        setState({
          status: "ok",
          latest: {
            value: latest,
            fuente: "radar-ejecucion / radar_ejecucion_meta_sources",
            corte: latest.runAt,
            cobertura,
            matcher: "runAt (ordenamiento temporal)",
            restriccion: "Ingesta manual, sin scheduler.",
          },
        });
      } catch (err) {
        if (cancelled) return;
        const message = err instanceof AppUnavailableError ? err.message : (err as Error).message;
        setState({ status: "unavailable", message });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (state.status === "loading") {
    return (
      <div className="border-t border-line-soft bg-ink-900/40">
        <div className="mx-auto max-w-6xl px-6 py-2 text-xs text-muted">Consultando frescura de las APIs…</div>
      </div>
    );
  }

  if (state.status === "unavailable") {
    return (
      <div className="border-t border-line-soft bg-danger/10">
        <div className="mx-auto max-w-6xl px-6 py-2 text-xs text-danger flex items-center gap-2">
          <span className="inline-block w-1.5 h-1.5 rounded-full bg-danger" />
          API no disponible: <span className="text-fg-soft">{state.message}</span>
        </div>
      </div>
    );
  }

  if (!state.latest) {
    return (
      <div className="border-t border-line-soft bg-ink-900/40">
        <div className="mx-auto max-w-6xl px-6 py-2 text-xs text-muted">Sin corridas registradas todavía.</div>
      </div>
    );
  }

  const days = ageInDays(state.latest.corte);
  const color = colorForAge(days, state.latest.cobertura);
  const colorClass =
    color === "red"
      ? "text-danger bg-danger/10 border-danger/30"
      : color === "amber"
        ? "text-warn bg-warn/10 border-warn/30"
        : "text-accent bg-accent/10 border-accent/30";

  return (
    <div className="border-t border-line-soft bg-ink-900/40">
      <div className="mx-auto max-w-6xl px-6 py-2 text-xs flex items-center gap-3 flex-wrap">
        <span className={`px-2 py-0.5 rounded border ${colorClass}`}>
          radar-ejecucion · última corrida: {state.latest.corte}
        </span>
        <span className="text-muted">
          · cobertura: <span className="text-fg-soft">{state.latest.cobertura}</span>
        </span>
        <span className="text-muted hidden sm:inline">
          · matcher: <span className="text-fg-soft">{state.latest.matcher}</span>
        </span>
        <span className="text-muted hidden md:inline">· {state.latest.restriccion}</span>
      </div>
    </div>
  );
}
