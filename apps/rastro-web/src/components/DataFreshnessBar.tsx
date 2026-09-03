import { useEffect, useState } from "react";
import { AppUnavailableError, type Cobertura, type WithMetadata } from "../lib/types.js";
import { apisPublishedForBrowser, APIS_NOT_PUBLISHED_MESSAGE } from "../lib/api-config.js";
import { getRadarEjecucionMetaSources, type MetaSource } from "../lib/api-client.js";
import { Modal } from "./Modal.js";
import { NumberWithMetadata, metaNumber } from "./NumberWithMetadata.js";
import snapshot from "../data/snapshot.json" with { type: "json" };

type FreshnessState =
  | { status: "loading" }
  | { status: "unavailable"; message: string }
  | { status: "snapshot"; corte: string }
  | { status: "ok"; latest: WithMetadata<MetaSource> | null; items: MetaSource[] };

function formatCorteFecha(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("es-PE", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
}

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
  const [modalOpen, setModalOpen] = useState(false);

  useEffect(() => {
    if (!apisPublishedForBrowser()) {
      if (snapshot.corte) {
        setState({ status: "snapshot", corte: snapshot.corte });
      } else {
        setState({ status: "unavailable", message: APIS_NOT_PUBLISHED_MESSAGE });
      }
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const data = await getRadarEjecucionMetaSources();
        if (cancelled) return;
        const items = data.items ?? [];
        if (items.length === 0) {
          setState({ status: "ok", latest: null, items: [] });
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
          items: sorted,
        });
      } catch (err) {
        if (cancelled) return;
        const message =
          err instanceof AppUnavailableError
            ? err.kind === "network" || err.kind === "timeout"
              ? APIS_NOT_PUBLISHED_MESSAGE
              : err.message
            : (err as Error).message;
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

  if (state.status === "snapshot") {
    return (
      <div className="border-t border-line-soft bg-ink-900/40">
        <div className="mx-auto max-w-6xl px-6 py-2 text-xs text-fg-soft flex items-center gap-2">
          <span className="inline-block w-1.5 h-1.5 rounded-full bg-accent" />
          Datos al {formatCorteFecha(state.corte)} — corte semanal, no en vivo.
        </div>
      </div>
    );
  }

  if (state.status === "unavailable") {
    return (
      <div className="border-t border-line-soft bg-ink-900/40">
        <div className="mx-auto max-w-6xl px-6 py-2 text-xs text-muted flex items-center gap-2">
          <span className="inline-block w-1.5 h-1.5 rounded-full bg-muted" />
          {state.message}
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
        <button
          type="button"
          onClick={() => setModalOpen(true)}
          className={`px-2 py-0.5 rounded border ${colorClass} hover:brightness-110 cursor-pointer`}
        >
          radar-ejecucion · última corrida: {state.latest.corte}
        </button>
        <span className="text-muted">
          · cobertura: <span className="text-fg-soft">{state.latest.cobertura}</span>
        </span>
        <span className="text-muted hidden sm:inline">
          · matcher: <span className="text-fg-soft">{state.latest.matcher}</span>
        </span>
        <span className="text-muted hidden md:inline">· {state.latest.restriccion}</span>
        <button
          type="button"
          onClick={() => setModalOpen(true)}
          className="text-accent underline-offset-2 hover:underline"
        >
          ver todas las fuentes →
        </button>
      </div>

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title="radar_ejecucion_meta_sources — lotes de ingesta">
        {state.items.length === 0 ? (
          <p className="text-sm text-muted">Sin corridas registradas todavía.</p>
        ) : (
          <ul className="space-y-3 max-h-96 overflow-y-auto text-sm">
            {state.items.map((item, i) => (
              <li key={i} className="border-b border-line-soft pb-2 last:border-b-0">
                <p className="text-fg">
                  {item.runAt} ·{" "}
                  <NumberWithMetadata
                    data={metaNumber(
                      item.records,
                      "radar-ejecucion / radar_ejecucion_meta_sources",
                      item.runAt,
                      item.cobertura ?? "PARCIAL",
                    )}
                  />{" "}
                  registros
                </p>
                <p className="text-xs text-muted mt-1">
                  cobertura: {item.cobertura ?? "PARCIAL"}
                  {item.fuente ? ` · fuente: ${item.fuente}` : ""}
                  {item.checksum ? ` · checksum: ${item.checksum.slice(0, 12)}…` : ""}
                </p>
              </li>
            ))}
          </ul>
        )}
      </Modal>
    </div>
  );
}
